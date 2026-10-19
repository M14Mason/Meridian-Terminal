// Lightweight Charts helpers: theme colors from CSS tokens, lifecycle. Loaded only by chart panels.
// TradingView attribution logo stays on (Apache-2.0 attribution requirement, 22.3).
import { createChart, CrosshairMode, type DeepPartial, type IChartApi, type ChartOptions, type UTCTimestamp } from 'lightweight-charts';

export const css = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export function themeColors() {
  return {
    bg: css('--panel', '#0a0a0a'),
    text: css('--text', '#ffb800'),
    dim: css('--text-dim', '#b38200'),
    grid: css('--hairline', '#262626'),
    up: css('--up', '#00c805'),
    down: css('--down', '#ff3b30'),
    accent: css('--accent', '#fa7900'),
    link: css('--link', '#4aa3ff'),
  };
}

export const PALETTE = ['#4aa3ff', '#fa7900', '#b07cff', '#00c8c8', '#ff6ec7', '#c8c800', '#9bd35a', '#ff8c5a'];

export function makeChart(el: HTMLElement, extra: DeepPartial<ChartOptions> = {}): IChartApi {
  const c = themeColors();
  return createChart(el, {
    autoSize: true,
    layout: {
      background: { color: c.bg },
      textColor: c.dim,
      fontFamily: getComputedStyle(document.body).fontFamily,
      fontSize: 11,
      attributionLogo: true,
      panes: { separatorColor: c.grid, enableResize: true },
    },
    grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: { borderColor: c.grid },
    timeScale: { borderColor: c.grid, timeVisible: true, secondsVisible: false },
    ...extra,
  });
}

export const ts = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp;

/** Line data from an aligned indicator array, skipping warm-up NaNs. */
export function line(times: number[], values: number[]) {
  const out: { time: UTCTimestamp; value: number }[] = [];
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i]!)) out.push({ time: ts(times[i]!), value: values[i]! });
  return out;
}
