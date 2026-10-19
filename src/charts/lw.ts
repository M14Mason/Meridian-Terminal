// Lightweight Charts helpers: theme colors from CSS tokens, lifecycle. Loaded only by chart panels.
// TradingView attribution logo stays on (Apache-2.0 attribution requirement, 22.3).
import { createChart, CrosshairMode, TickMarkType, type DeepPartial, type IChartApi, type ChartOptions, type Time, type UTCTimestamp } from 'lightweight-charts';
import { DISPLAY_TZ } from '../config';

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

// Times are stored as UTC seconds; the library labels them in UTC by default (2 PM Pacific showed as 21:00).
// These formatters label intraday points in Pacific. Date-only points (daily, weekly, monthly bars and dated
// series) sit at midnight UTC or midnight New York, so they are labeled with the date in that zone.
const dtf = (tz: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: tz, ...o });
const HM = { utc: dtf('UTC', { hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }), ny: dtf('America/New_York', { hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }) };
const midnight = (f: Intl.DateTimeFormat, ms: number) => { const p = f.formatToParts(ms); return Number(p.find((x) => x.type === 'hour')!.value) % 24 === 0 && Number(p.find((x) => x.type === 'minute')!.value) === 0; };
/** Zone in which this instant is a calendar date, or null for an intraday instant. */
const dateZone = (ms: number) => (midnight(HM.utc, ms) ? 'UTC' : midnight(HM.ny, ms) ? 'America/New_York' : null);
const F = {
  year: (tz: string) => dtf(tz, { year: 'numeric' }),
  month: (tz: string) => dtf(tz, { month: 'short', year: '2-digit' }),
  day: (tz: string) => dtf(tz, { month: 'short', day: 'numeric' }),
  full: (tz: string) => dtf(tz, { weekday: 'short', month: 'short', day: 'numeric', year: '2-digit' }),
  time: dtf(DISPLAY_TZ, { hour: 'numeric', minute: '2-digit' }),
  timeSec: dtf(DISPLAY_TZ, { hour: 'numeric', minute: '2-digit', second: '2-digit' }),
  stamp: dtf(DISPLAY_TZ, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
};
const toMs = (t: Time) => (typeof t === 'number' ? t * 1000 : typeof t === 'string' ? Date.parse(`${t}T00:00:00Z`) : Date.UTC(t.year, t.month - 1, t.day));

export function timeLabel(t: Time): string {
  const ms = toMs(t);
  const z = dateZone(ms);
  return z ? F.full(z).format(ms) : F.stamp.format(ms);
}

export function tickLabel(t: Time, type: TickMarkType): string {
  const ms = toMs(t);
  const z = dateZone(ms) ?? DISPLAY_TZ;
  switch (type) {
    case TickMarkType.Year: return F.year(z).format(ms);
    case TickMarkType.Month: return F.month(z).format(ms);
    case TickMarkType.DayOfMonth: return F.day(z).format(ms);
    case TickMarkType.TimeWithSeconds: return F.timeSec.format(ms);
    default: return F.time.format(ms);
  }
}

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
    localization: { timeFormatter: timeLabel },
    ...extra,
    timeScale: { borderColor: c.grid, timeVisible: true, secondsVisible: false, tickMarkFormatter: tickLabel, ...extra.timeScale },
  });
}

export const ts = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp;

/** Line data from an aligned indicator array, skipping warm-up NaNs. */
export function line(times: number[], values: number[]) {
  const out: { time: UTCTimestamp; value: number }[] = [];
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i]!)) out.push({ time: ts(times[i]!), value: values[i]! });
  return out;
}
