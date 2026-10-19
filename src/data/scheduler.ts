// Central rate-limit scheduler (BUILD_PROMPT 5.5). One token bucket per provider.
// Priority when limits conflict: what is on screen, then alerts, then background caches.
// Errors back off exponentially per task. Hidden tabs poll slower to save the free budget.

export type Priority = 0 | 1 | 2; // 0 = on screen, 1 = alerts, 2 = background
export const PRIORITY = { visible: 0, alert: 1, background: 2 } as const;

export interface ProviderLimit {
  /** Requests allowed per window. */
  capacity: number;
  windowMs: number;
}

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

interface Bucket {
  limit: ProviderLimit;
  tokens: number;
  updated: number;
}

interface Job<T> {
  provider: string;
  priority: Priority;
  seq: number;
  run: () => Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}

export interface PollHandle {
  stop(): void;
  setPriority(p: Priority): void;
  /** Run now (for example on pull to refresh), then continue the normal cadence. */
  kick(): void;
}

export class Scheduler {
  private buckets = new Map<string, Bucket>();
  private queue: Job<unknown>[] = [];
  private seq = 0;
  private timer: unknown = null;
  hidden = false;

  constructor(
    limits: Record<string, ProviderLimit>,
    private clock: Clock = realClock,
  ) {
    for (const [id, limit] of Object.entries(limits)) this.buckets.set(id, { limit, tokens: limit.capacity, updated: clock.now() });
  }

  private refill(b: Bucket) {
    const now = this.clock.now();
    const rate = b.limit.capacity / b.limit.windowMs;
    b.tokens = Math.min(b.limit.capacity, b.tokens + (now - b.updated) * rate);
    b.updated = now;
  }

  /** Remaining requests in the current window (for the data health panel). */
  headroom(provider: string): number {
    const b = this.buckets.get(provider);
    if (!b) return Infinity;
    this.refill(b);
    return Math.floor(b.tokens);
  }

  /** Queue one request. Resolves when the provider's bucket allows it and the call finishes. */
  request<T>(provider: string, run: () => Promise<T>, priority: Priority = 0): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ provider, priority, seq: this.seq++, run, resolve, reject } as Job<unknown>);
      this.queue.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
      this.pump();
    });
  }

  private pump() {
    if (this.timer) {
      this.clock.clearTimeout(this.timer);
      this.timer = null;
    }
    let wait = Infinity;
    for (let i = 0; i < this.queue.length; ) {
      const job = this.queue[i]!;
      const b = this.buckets.get(job.provider);
      if (!b) {
        this.queue.splice(i, 1);
        void job.run().then(job.resolve, job.reject);
        continue;
      }
      this.refill(b);
      if (b.tokens >= 1) {
        b.tokens -= 1;
        this.queue.splice(i, 1);
        void job.run().then(job.resolve, job.reject);
        continue;
      }
      wait = Math.min(wait, Math.ceil((1 - b.tokens) / (b.limit.capacity / b.limit.windowMs)));
      i++;
    }
    if (wait < Infinity) this.timer = this.clock.setTimeout(() => this.pump(), wait);
  }

  /**
   * Poll at the source's natural cadence (5.5): if data changes 6 times a minute, poll every 10 s.
   * Backs off exponentially on errors (cap 5 minutes). Polls 4x slower when the tab is hidden.
   */
  poll<T>(provider: string, everyMs: number, fetcher: () => Promise<T>, onData: (v: T) => void, onError: (e: unknown, retryInMs: number) => void, priority: Priority = 0): PollHandle {
    let stopped = false;
    let failures = 0;
    let prio = priority;
    let timer: unknown = null;
    const schedule = (ms: number) => {
      if (stopped) return;
      timer = this.clock.setTimeout(tick, ms);
    };
    const tick = () => {
      if (stopped) return;
      this.request(provider, fetcher, prio).then(
        (v) => {
          failures = 0;
          if (stopped) return;
          onData(v);
          schedule(this.hidden ? everyMs * 4 : everyMs);
        },
        (e) => {
          failures++;
          const backoff = Math.min(5 * 60_000, everyMs * 2 ** failures);
          if (stopped) return;
          onError(e, backoff);
          schedule(backoff);
        },
      );
    };
    tick();
    return {
      stop: () => {
        stopped = true;
        if (timer) this.clock.clearTimeout(timer);
      },
      setPriority: (p) => {
        prio = p;
      },
      kick: () => {
        if (timer) this.clock.clearTimeout(timer);
        tick();
      },
    };
  }
}
