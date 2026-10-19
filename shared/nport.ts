// SEC Form N-PORT holdings parser (ETFH, TMAP). Pure, tested.
export interface NportHolding { name: string; title: string; cusip: string; isin: string; value: number; pct: number; cat: string; country: string; units: string; balance: number }
export interface Nport { series: string; period: string; netAssets: number; holdings: NportHolding[] }

const tag = (s: string, t: string) => {
  const m = new RegExp(`<${t}>([^<]*)</${t}>`).exec(s);
  return m ? m[1]!.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&quot;/g, '"').trim() : '';
};

export function parseNport(xml: string): Nport {
  const holdings: NportHolding[] = [];
  const re = /<invstOrSec>([\s\S]*?)<\/invstOrSec>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const s = m[1]!;
    holdings.push({
      name: tag(s, 'name'),
      title: tag(s, 'title'),
      cusip: tag(s, 'cusip'),
      isin: /<isin value="([^"]+)"/.exec(s)?.[1] ?? '',
      value: Number(tag(s, 'valUSD')) || 0,
      pct: Number(tag(s, 'pctVal')) || 0,
      cat: tag(s, 'assetCat') || (/<assetConditional[^>]*desc="([^"]+)"/.exec(s)?.[1] ?? ''),
      country: tag(s, 'invCountry'),
      units: tag(s, 'units'),
      balance: Number(tag(s, 'balance')) || 0,
    });
  }
  holdings.sort((a, b) => b.value - a.value);
  return { series: tag(xml, 'seriesId'), period: tag(xml, 'repPdDate'), netAssets: Number(tag(xml, 'netAssets')) || 0, holdings };
}

export const ASSET_CAT: Record<string, string> = {
  EC: 'Equity (common)', EP: 'Equity (preferred)', DBT: 'Debt', ABS: 'Asset-backed', 'ABS-MBS': 'Mortgage-backed', 'ABS-CBDO': 'CDO', STIV: 'Cash vehicle', RE: 'Real estate', DE: 'Derivative (equity)', DIR: 'Derivative (rates)', DFE: 'Derivative (FX)', DCO: 'Derivative (commodity)', DCR: 'Derivative (credit)', LON: 'Loan', OTHER: 'Other',
};

/** Overlap between two funds by weight: sum over common holdings of the smaller weight. */
export function overlap(a: NportHolding[], b: NportHolding[]): { pct: number; common: { name: string; a: number; b: number }[] } {
  const key = (h: NportHolding) => h.isin || h.cusip || h.name;
  const mb = new Map(b.map((h) => [key(h), h]));
  const common: { name: string; a: number; b: number }[] = [];
  let pct = 0;
  for (const h of a) {
    const o = mb.get(key(h));
    if (!o) continue;
    pct += Math.min(h.pct, o.pct);
    common.push({ name: h.name, a: h.pct, b: o.pct });
  }
  return { pct, common: common.sort((x, y) => Math.min(y.a, y.b) - Math.min(x.a, x.b)) };
}
