// 8-K item codes in plain English (SEC Form 8-K General Instructions). Used to flag material events.
export const ITEMS_8K: Record<string, string> = {
  '1.01': 'Material agreement',
  '1.02': 'Agreement terminated',
  '1.03': 'Bankruptcy or receivership',
  '1.05': 'Cybersecurity incident',
  '2.01': 'Acquisition or disposition completed',
  '2.02': 'Earnings results',
  '2.03': 'New debt obligation',
  '2.04': 'Debt acceleration',
  '2.05': 'Restructuring or exit costs',
  '2.06': 'Material impairment',
  '3.01': 'Delisting notice',
  '3.02': 'Unregistered equity sale',
  '3.03': 'Change to shareholder rights',
  '4.01': 'Auditor change',
  '4.02': 'Prior financials no longer reliable',
  '5.01': 'Change in control',
  '5.02': 'Director or officer change',
  '5.03': 'Charter or bylaw amendment',
  '5.07': 'Shareholder vote results',
  '7.01': 'Regulation FD disclosure',
  '8.01': 'Other events',
  '9.01': 'Financial statements and exhibits',
};

/** Items that usually matter most for a holder. */
export const RED_FLAG_ITEMS = new Set(['1.03', '1.05', '2.04', '2.06', '3.01', '4.01', '4.02', '5.01']);

export function parseItems(text: string): string[] {
  return [...new Set([...text.matchAll(/\b(\d\.\d{2})\b/g)].map((m) => m[1]!).filter((i) => ITEMS_8K[i]))];
}

export interface CurrentFiling {
  form: string;
  company: string;
  cik: number;
  url: string;
  updated: number;
  items: string[];
}

/** Parses the EDGAR "getcurrent" Atom feed. Pure string parsing so it also runs in tests. */
export function parseCurrentFeed(xml: string): CurrentFiling[] {
  const out: CurrentFiling[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1]!;
    const title = /<title>([\s\S]*?)<\/title>/.exec(e)?.[1]?.trim() ?? '';
    const href = /<link[^>]*href="([^"]+)"/.exec(e)?.[1] ?? '';
    const updated = /<updated>([^<]+)<\/updated>/.exec(e)?.[1] ?? '';
    const summary = /<summary[^>]*>([\s\S]*?)<\/summary>/.exec(e)?.[1] ?? '';
    const t = /^(\S+)\s+-\s+(.*?)\s+\((\d{4,10})\)/.exec(title);
    if (!t) continue;
    out.push({
      form: t[1]!,
      company: t[2]!.replace(/&amp;/g, '&'),
      cik: Number(t[3]),
      url: href.replace(/&amp;/g, '&'),
      updated: Date.parse(updated),
      items: parseItems(summary.replace(/&lt;[^&]*&gt;/g, ' ')),
    });
  }
  return out;
}
