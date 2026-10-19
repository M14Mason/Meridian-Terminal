import { describe, expect, it } from 'vitest';
import { metrics, optimize, paramGrid, run, shuffleTest, strategy, STRATEGIES, walkForward, type Panel } from './backtest';

const OPTS = { costBps: 0, slippageBps: 0, initial: 100 };
function panel(n: number, f: Record<string, (i: number) => number>): Panel {
  const dates = Array.from({ length: n }, (_, i) => new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString().slice(0, 10));
  return { dates, close: Object.fromEntries(Object.entries(f).map(([k, fn]) => [k, dates.map((_, i) => fn(i))])) };
}

describe('backtest metrics', () => {
  it('computes drawdown and CAGR', () => {
    const m = metrics([100, 120, 90, 110]);
    expect(m.maxDd).toBeCloseTo(-0.25, 10);
    expect(metrics(Array.from({ length: 253 }, (_, i) => 100 * 1.1 ** (i / 252))).cagr).toBeCloseTo(0.1, 6);
  });
});

describe('engine', () => {
  it('buy and hold tracks the asset exactly with no costs', () => {
    const p = panel(300, { SPY: (i) => 100 + i });
    const r = run(p, strategy('buyhold'), {}, OPTS, 'SPY');
    expect(r.equity.at(-1)! / r.equity[0]!).toBeCloseTo(p.close.SPY!.at(-1)! / p.close.SPY![1]!, 10);
  });
  it('has no look-ahead: today\'s signal earns tomorrow\'s return', () => {
    // Price jumps 50% on day 10. A rule that only sees the jump at day 10 must not capture it.
    const p = panel(30, { SPY: (i) => (i >= 10 ? 150 : 100) });
    const s = { ...strategy('buyhold'), id: 'peek', rebalance: 'D' as const, warmup: () => 1, weights: ({ i }: { i: number }): Record<string, number> => (i >= 10 ? { SPY: 1 } : {}) };
    expect(run(p, s, {}, OPTS).equity.at(-1)).toBeCloseTo(100, 10);
  });
  it('charges costs on turnover', () => {
    const p = panel(40, { SPY: () => 100, IEF: () => 100 });
    const r = run(p, strategy('sixty40'), {}, { costBps: 10, slippageBps: 0, initial: 100 });
    expect(r.equity.at(-1)).toBeLessThan(100);
    expect(r.equity.at(-1)).toBeGreaterThan(99.8);
  });
  it('trend rule exits a falling market', () => {
    const p = panel(500, { SPY: (i) => (i < 300 ? 100 + i : 400 - (i - 300) * 1.5) });
    const trend = run(p, strategy('smacross'), { fast: 20, slow: 100 }, OPTS);
    const hold = run(p, strategy('buyhold'), {}, OPTS);
    expect(trend.metrics.maxDd).toBeGreaterThan(hold.metrics.maxDd);
  });
  it('every library strategy runs on synthetic data', () => {
    const syms = [...new Set(STRATEGIES.flatMap((s) => s.universe))];
    const p = panel(600, Object.fromEntries(syms.map((s, k) => [s, (i: number) => 100 + Math.sin(i / (5 + k)) * 10 + i * 0.05 * ((k % 3) - 1)])));
    for (const s of STRATEGIES) {
      const sub: Panel = { dates: p.dates, close: Object.fromEntries(s.universe.map((u) => [u, p.close[u]!])) };
      const params = Object.fromEntries(s.params.map((q) => [q.key, q.default]));
      const r = run(sub, s, params, OPTS);
      expect(Number.isFinite(r.equity.at(-1)!), s.id).toBe(true);
    }
  });
  it('parameter grids snap to whole steps', () => {
    expect(paramGrid({ key: 'look', label: '', default: 252, min: 63, max: 252, step: 21 }, 6)).toEqual([63, 105, 147, 168, 210, 252]);
  });
  it('optimizer, walk-forward and shuffle test produce sane output', () => {
    const p = panel(800, { SPY: (i) => 100 + i * 0.1 + Math.sin(i / 20) * 8 });
    const grid = optimize(p, 'smacross', { fast: 20, slow: 100 }, 'fast', 'slow', [10, 20], [50, 100], OPTS);
    expect(grid).toHaveLength(2);
    expect(grid[0]).toHaveLength(2);
    const wf = walkForward(p, 'smacross', { fast: 20, slow: 100 }, 'fast', [10, 20, 40], OPTS, 3);
    expect(wf).toHaveLength(3);
    const r = run(p, strategy('buyhold'), {}, OPTS);
    const sh = shuffleTest(r, 100);
    expect(sh.percentile).toBeGreaterThan(0.5); // a steady uptrend beats random sign flips
  });
});
