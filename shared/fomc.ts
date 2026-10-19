// FOMC meeting dates from the Fed's own calendar page (federalreserve.gov/monetarypolicy/fomccalendars.htm).
// FRED's "FOMC Press Release" release is NOT a schedule: FRED updates the target-range series almost daily, so its
// release dates show an FOMC entry nearly every day. Always use these dates instead.

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export interface FomcMeeting {
  /** Statement day (the last meeting day), YYYY-MM-DD. The statement is released at 2:00 PM New York time. */
  statement: string;
  label: string;
  /** Meeting with a Summary of Economic Projections (dot plot). */
  sep: boolean;
}

export function parseFomcCalendar(html: string): FomcMeeting[] {
  const out: FomcMeeting[] = [];
  const blocks = html.split(/(\d{4}) FOMC Meetings/);
  for (let i = 1; i + 1 < blocks.length; i += 2) {
    const year = Number(blocks[i]);
    for (const m of blocks[i + 1]!.matchAll(/fomc-meeting__month[^>]*><strong>([A-Za-z/]+)<\/strong>[\s\S]*?fomc-meeting__date[^>]*>\s*([0-9]{1,2}(?:-[0-9]{1,2})?)(\*?)/g)) {
      const months = m[1]!.toLowerCase().split('/');
      const days = m[2]!.split('-').map(Number);
      const mi = MONTHS.indexOf(months.at(-1)!);
      const day = days.at(-1)!;
      if (mi < 0 || !day) continue; // "notation vote" rows and other non-meeting entries
      const statement = `${year}-${String(mi + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      out.push({ statement, label: `${m[1]} ${m[2]}, ${year}`, sep: m[3] === '*' });
    }
  }
  return out.sort((a, b) => a.statement.localeCompare(b.statement));
}

export const isFredFomc = (releaseName: string) => /^FOMC/i.test(releaseName);
