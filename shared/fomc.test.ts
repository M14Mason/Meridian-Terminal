import { describe, expect, it } from 'vitest';
import { isFredFomc, parseFomcCalendar } from './fomc';

const html = `<h4>2026 FOMC Meetings</h4>
<div class="fomc-meeting__month col-xs-5"><strong>September</strong></div><div class="x"></div>
<div class="fomc-meeting__date col-xs-4">15-16*</div>
<div class="fomc-meeting__month col-xs-5"><strong>October</strong></div>
<div class="fomc-meeting__date col-xs-4">27-28</div>
<div class="fomc-meeting__month col-xs-5"><strong>Apr/May</strong></div>
<div class="fomc-meeting__date col-xs-4">30-1</div>
<h4>2025 FOMC Meetings</h4>
<div class="fomc-meeting__month col-xs-5"><strong>December</strong></div>
<div class="fomc-meeting__date col-xs-4">9-10*</div>`;

describe('FOMC calendar', () => {
  it('uses the last meeting day as the statement date and flags projection meetings', () => {
    const m = parseFomcCalendar(html);
    expect(m.map((x) => x.statement)).toEqual(['2025-12-10', '2026-05-01', '2026-09-16', '2026-10-28']);
    expect(m.find((x) => x.statement === '2026-09-16')?.sep).toBe(true);
    expect(m.find((x) => x.statement === '2026-10-28')?.sep).toBe(false);
  });
  it('recognizes FRED FOMC release names', () => {
    expect(isFredFomc('FOMC Press Release')).toBe(true);
    expect(isFredFomc('Consumer Price Index')).toBe(false);
  });
});
