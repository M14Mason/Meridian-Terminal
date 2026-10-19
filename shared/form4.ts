// SEC Form 4 parsing for insider buying (CLUS). Keeps open-market purchases only (code P).

export interface InsiderBuy {
  acc: string;
  issuerCik: number;
  issuer: string;
  ticker: string;
  owner: string;
  role: string;
  date: string;
  shares: number;
  price: number;
  value: number;
}

const one = (s: string, name: string) => new RegExp(`<${name}>\\s*([^<]*)`).exec(s)?.[1]?.trim() ?? '';
const val = (s: string, name: string) => {
  const m = new RegExp(`<${name}>[\\s\\S]*?<value>\\s*([^<]*)`).exec(s);
  return m?.[1]?.trim() ?? '';
};

export function parseForm4(doc: string, acc: string): InsiderBuy[] {
  const x = /<ownershipDocument>[\s\S]*<\/ownershipDocument>/.exec(doc)?.[0];
  if (!x) return [];
  const issuerCik = Number(one(x, 'issuerCik'));
  const issuer = one(x, 'issuerName').replace(/&amp;/g, '&');
  const ticker = one(x, 'issuerTradingSymbol').toUpperCase();
  const owner = one(x, 'rptOwnerName').replace(/&amp;/g, '&');
  const roles: string[] = [];
  if (/<isDirector>\s*(1|true)/i.test(x)) roles.push('Director');
  const title = one(x, 'officerTitle');
  if (/<isOfficer>\s*(1|true)/i.test(x)) roles.push(title || 'Officer');
  if (/<isTenPercentOwner>\s*(1|true)/i.test(x)) roles.push('10% owner');
  const out: InsiderBuy[] = [];
  for (const m of x.matchAll(/<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/g)) {
    const t = m[1]!;
    if (one(t, 'transactionCode') !== 'P') continue;
    if (val(t, 'transactionAcquiredDisposedCode') !== 'A') continue;
    const shares = Number(val(t, 'transactionShares'));
    const price = Number(val(t, 'transactionPricePerShare'));
    if (!(shares > 0) || !(price > 0)) continue;
    out.push({ acc, issuerCik, issuer, ticker, owner, role: roles.join(', ') || 'Other', date: val(t, 'transactionDate'), shares, price, value: shares * price });
  }
  return out;
}

export interface Cluster {
  ticker: string;
  issuer: string;
  insiders: string[];
  roles: string[];
  value: number;
  first: string;
  last: string;
  buys: InsiderBuy[];
}

/** Groups buys by ticker; a cluster is 3+ distinct insiders buying within `windowDays`. */
export function findClusters(buys: InsiderBuy[], minInsiders = 3, windowDays = 10): Cluster[] {
  const byTicker = new Map<string, InsiderBuy[]>();
  for (const b of buys) {
    // Some issuers file "N/A" or "NONE" as the symbol; group those by company CIK instead.
    const key = /^[A-Z][A-Z0-9.-]{0,9}$/.test(b.ticker) && b.ticker !== 'NONE' ? b.ticker : `CIK${b.issuerCik}`;
    (byTicker.get(key) ?? byTicker.set(key, []).get(key)!).push(b);
  }
  const out: Cluster[] = [];
  for (const [ticker, list] of byTicker) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    let best: InsiderBuy[] = [];
    for (let i = 0; i < list.length; i++) {
      const start = Date.parse(list[i]!.date);
      const win = list.filter((b) => {
        const t = Date.parse(b.date);
        return t >= start && t - start <= windowDays * 86_400_000;
      });
      if (new Set(win.map((b) => b.owner)).size > new Set(best.map((b) => b.owner)).size) best = win;
    }
    const owners = [...new Set(best.map((b) => b.owner))];
    if (owners.length >= minInsiders) {
      out.push({
        ticker,
        issuer: best[0]!.issuer,
        insiders: owners,
        roles: [...new Set(best.map((b) => b.role))],
        value: best.reduce((s, b) => s + b.value, 0),
        first: best[0]!.date,
        last: best.at(-1)!.date,
        buys: best,
      });
    }
  }
  return out.sort((a, b) => b.insiders.length - a.insiders.length || b.value - a.value);
}
