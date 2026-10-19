import { TickMarkType, type UTCTimestamp } from 'lightweight-charts';
import { describe, expect, it } from 'vitest';
import { tickLabel, timeLabel } from './lw';

const s = (iso: string) => (Date.parse(iso) / 1000) as UTCTimestamp;

describe('chart time labels', () => {
  it('labels intraday bars in Pacific, not UTC', () => {
    // 21:00 UTC on Oct 19 2026 is 2:00 PM PDT.
    expect(tickLabel(s('2026-10-19T21:00:00Z'), TickMarkType.Time)).toBe('2:00 PM');
    expect(timeLabel(s('2026-10-19T21:00:00Z'))).toMatch(/Oct 19, 2:00 PM PDT/);
  });
  it('keeps the right calendar date for daily bars at New York midnight and dated series at UTC midnight', () => {
    expect(timeLabel(s('2026-10-16T04:00:00Z'))).toMatch(/Fri, Oct 16, 26/);
    expect(tickLabel(s('2026-10-01T00:00:00Z'), TickMarkType.DayOfMonth)).toBe('Oct 1');
    expect(tickLabel(s('2026-01-15T05:00:00Z'), TickMarkType.DayOfMonth)).toBe('Jan 15');
  });
});
