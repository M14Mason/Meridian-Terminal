import { describe, expect, it } from 'vitest';
import { PRIORITY, Scheduler, type Clock } from './scheduler';

/** Deterministic clock: timers fire only when advance() is called. */
function fakeClock() {
  let t = 0;
  let timers: { at: number; fn: () => void; id: number }[] = [];
  let next = 1;
  const clock: Clock = {
    now: () => t,
    setTimeout: (fn, ms) => {
      const id = next++;
      timers.push({ at: t + ms, fn, id });
      return id;
    },
    clearTimeout: (id) => {
      timers = timers.filter((x) => x.id !== id);
    },
  };
  async function advance(ms: number) {
    const end = t + ms;
    for (;;) {
      await Promise.resolve();
      await Promise.resolve();
      const due = timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      t = due.at;
      timers = timers.filter((x) => x !== due);
      due.fn();
    }
    t = end;
    await Promise.resolve();
    await Promise.resolve();
  }
  return { clock, advance };
}

describe('Scheduler', () => {
  it('respects the token bucket', async () => {
    const { clock, advance } = fakeClock();
    const s = new Scheduler({ fin: { capacity: 2, windowMs: 1000 } }, clock);
    const done: number[] = [];
    for (let i = 0; i < 4; i++) void s.request('fin', async () => i).then((v) => done.push(v));
    await advance(0);
    expect(done).toEqual([0, 1]);
    await advance(500);
    expect(done).toEqual([0, 1, 2]);
    await advance(500);
    expect(done).toEqual([0, 1, 2, 3]);
  });

  it('serves on-screen work before background work', async () => {
    const { clock, advance } = fakeClock();
    const s = new Scheduler({ p: { capacity: 1, windowMs: 1000 } }, clock);
    const order: string[] = [];
    void s.request('p', async () => order.push('first'));
    void s.request('p', async () => order.push('bg'), PRIORITY.background);
    void s.request('p', async () => order.push('alert'), PRIORITY.alert);
    void s.request('p', async () => order.push('screen'), PRIORITY.visible);
    await advance(3000);
    expect(order).toEqual(['first', 'screen', 'alert', 'bg']);
  });

  it('polls at cadence and backs off exponentially on errors', async () => {
    const { clock, advance } = fakeClock();
    const s = new Scheduler({}, clock);
    let calls = 0;
    let fail = true;
    const retries: number[] = [];
    const h = s.poll('x', 1000, async () => {
      calls++;
      if (fail) throw new Error('down');
      return calls;
    }, () => undefined, (_e, ms) => retries.push(ms));
    await advance(0);
    await advance(2000);
    await advance(4000);
    expect(retries).toEqual([2000, 4000, 8000]);
    fail = false;
    await advance(8000);
    const before = calls;
    await advance(1000);
    expect(calls).toBe(before + 1);
    h.stop();
    await advance(10_000);
    expect(calls).toBe(before + 1);
  });

  it('polls slower when hidden', async () => {
    const { clock, advance } = fakeClock();
    const s = new Scheduler({}, clock);
    let calls = 0;
    s.hidden = true;
    s.poll('x', 1000, async () => ++calls, () => undefined, () => undefined);
    await advance(3999);
    expect(calls).toBe(1);
    await advance(1);
    expect(calls).toBe(2);
  });

  it('reports headroom', () => {
    const s = new Scheduler({ a: { capacity: 60, windowMs: 60_000 } }, fakeClock().clock);
    expect(s.headroom('a')).toBe(60);
    void s.request('a', async () => 1);
    expect(s.headroom('a')).toBe(59);
  });
});
