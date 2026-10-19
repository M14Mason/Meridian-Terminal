// Runs backtests off the main thread (21.2).
import { optimize, run, shuffleTest, strategy, walkForward, type Opts, type Panel } from '../../shared/backtest';

export type Job =
  | { kind: 'run'; panel: Panel; id: string; params: Record<string, number>; opts: Opts; bench?: string }
  | { kind: 'optimize'; panel: Panel; id: string; params: Record<string, number>; opts: Opts; kx: string; ky: string; xs: number[]; ys: number[] }
  | { kind: 'walk'; panel: Panel; id: string; params: Record<string, number>; opts: Opts; key: string; values: number[] };

self.onmessage = (e: MessageEvent<Job & { seq: number }>) => {
  const j = e.data;
  try {
    if (j.kind === 'run') {
      const r = run(j.panel, strategy(j.id), j.params, j.opts, j.bench);
      const sh = shuffleTest(r, 400);
      self.postMessage({ seq: j.seq, ok: true, result: r, shuffle: sh.percentile });
    } else if (j.kind === 'optimize') {
      self.postMessage({ seq: j.seq, ok: true, grid: optimize(j.panel, j.id, j.params, j.kx, j.ky, j.xs, j.ys, j.opts) });
    } else {
      self.postMessage({ seq: j.seq, ok: true, walk: walkForward(j.panel, j.id, j.params, j.key, j.values, j.opts, 4) });
    }
  } catch (err) {
    self.postMessage({ seq: j.seq, ok: false, error: err instanceof Error ? err.message : 'failed' });
  }
};
