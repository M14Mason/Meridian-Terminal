// 13F information table parsing and quarter-over-quarter comparison (GURU, owner additions).
// Since January 2023 the SEC requires 13F values in whole dollars (before that, thousands).

export interface Holding {
  cusip: string;
  issuer: string;
  cls: string;
  value: number; // dollars
  shares: number;
  shType: string; // SH or PRN
  putCall: '' | 'Put' | 'Call';
}

const tag = (block: string, name: string) => {
  const m = new RegExp(`<(?:\\w+:)?${name}>([\\s\\S]*?)</(?:\\w+:)?${name}>`).exec(block);
  return m ? m[1]!.trim().replace(/&amp;/g, '&') : '';
};

/** Parses infoTable entries. Works with or without XML namespace prefixes. */
export function parseInfoTable(xml: string, valueInThousands = false): Holding[] {
  const out: Holding[] = [];
  for (const m of xml.matchAll(/<(?:\w+:)?infoTable>([\s\S]*?)<\/(?:\w+:)?infoTable>/g)) {
    const b = m[1]!;
    const pc = tag(b, 'putCall');
    out.push({
      cusip: tag(b, 'cusip').toUpperCase(),
      issuer: tag(b, 'nameOfIssuer'),
      cls: tag(b, 'titleOfClass'),
      value: Number(tag(b, 'value')) * (valueInThousands ? 1000 : 1),
      shares: Number(tag(b, 'sshPrnamt')),
      shType: tag(b, 'sshPrnamtType'),
      putCall: pc === 'Put' || pc === 'Call' ? pc : '',
    });
  }
  return aggregate(out);
}

/** Funds report one line per sub-manager; combine by CUSIP and option type. */
export function aggregate(rows: Holding[]): Holding[] {
  const m = new Map<string, Holding>();
  for (const r of rows) {
    const k = `${r.cusip}|${r.putCall}`;
    const cur = m.get(k);
    if (cur) {
      cur.value += r.value;
      cur.shares += r.shares;
    } else m.set(k, { ...r });
  }
  return [...m.values()].sort((a, b) => b.value - a.value);
}

export type Change = 'NEW' | 'ADD' | 'TRIM' | 'SAME' | 'EXIT';

export interface Row extends Holding {
  weight: number;
  change: Change;
  sharesChangePct: number | null;
}

export function compare(cur: Holding[], prev: Holding[] | null): { rows: Row[]; exited: Holding[]; total: number } {
  const total = cur.reduce((s, h) => s + h.value, 0);
  const pm = new Map((prev ?? []).map((h) => [`${h.cusip}|${h.putCall}`, h]));
  const rows = cur.map((h): Row => {
    const p = pm.get(`${h.cusip}|${h.putCall}`);
    let change: Change;
    let pct: number | null = null;
    if (!prev) change = 'SAME';
    else if (!p) change = 'NEW';
    else {
      pct = p.shares ? (h.shares / p.shares - 1) * 100 : null;
      change = pct == null ? 'SAME' : pct > 0.5 ? 'ADD' : pct < -0.5 ? 'TRIM' : 'SAME';
    }
    return { ...h, weight: total ? h.value / total : 0, change, sharesChangePct: pct };
  });
  const curKeys = new Set(cur.map((h) => `${h.cusip}|${h.putCall}`));
  const exited = (prev ?? []).filter((h) => !curKeys.has(`${h.cusip}|${h.putCall}`));
  return { rows, exited, total };
}

const STOP = /\b(INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|PLC|LLC|LP|HOLDINGS?|HLDGS|GROUP|GRP|NV|SA|AG|SE|CL|CLASS|NEW|DEL|COM|THE|OF|ADR|SPONSORED|SPON|ORD|SHS|A|B|C)\b/g;

// Abbreviations common in 13F issuer names.
const ABBR: [RegExp, string][] = [
  [/\bAMER\b/g, 'AMERICA'], [/\bFINL\b/g, 'FINANCIAL'], [/\bPETE\b/g, 'PETROLEUM'], [/\bPAC\b/g, 'PACIFIC'],
  [/\bINTL\b/g, 'INTERNATIONAL'], [/\bSVCS\b/g, 'SERVICES'], [/\bSYS\b/g, 'SYSTEMS'], [/\bMGMT\b/g, 'MANAGEMENT'],
  [/\bTECHNOLOGIES\b/g, 'TECH'], [/\bTECHNOLOGY\b/g, 'TECH'], [/\bPHARMACEUTICALS?\b/g, 'PHARMA'], [/\bMTRS\b/g, 'MOTORS'],
  [/\bCOMMUNICATIONS\b/g, 'COMM'], [/\bCOMMUNICATION\b/g, 'COMM'], [/\bLABS\b/g, 'LABORATORIES'], [/\bSOLUTIONS\b/g, 'SOLUTION'],
  [/\bENTMT\b/g, 'ENTERTAINMENT'], [/\bRES\b/g, 'RESOURCES'], [/\bPPTYS\b/g, 'PROPERTIES'], [/\bTR\b/g, 'TRUST'],
];

export function normName(n: string): string {
  let s = n.toUpperCase().replace(/\/[A-Z]{2,3}\/?\s*$/, '').replace(/['\u2019]/g, '').replace(/&/g, ' AND ').replace(/[^A-Z0-9 ]/g, ' ');
  for (const [re, to] of ABBR) s = s.replace(re, to);
  return s.replace(STOP, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Best-effort ticker from the issuer name using the SEC ticker list. 13F gives CUSIPs, and free
 * CUSIP-to-ticker mapping is not available in bulk, so a few matches can be wrong; the UI says so.
 */
export function makeTickerMatcher(list: { ticker: string; name: string }[]) {
  const byName = new Map<string, string>();
  const bySquash = new Map<string, string>();
  const names: [string, string][] = [];
  const put = (m: Map<string, string>, k: string, t: string) => {
    // Prefer the shortest ticker for a name (common shares over preferred or warrants).
    const cur = m.get(k);
    if (!cur || t.length < cur.length) m.set(k, t);
  };
  for (const t of list) {
    const k = normName(t.name);
    if (!k) continue;
    put(byName, k, t.ticker);
    put(bySquash, k.replace(/ /g, ''), t.ticker);
    names.push([k, t.ticker]);
  }
  const prefix = (k: string): string | undefined => {
    if (k.length < 6) return undefined;
    const hits = new Set(names.filter(([n]) => n.startsWith(k + ' ') || k.startsWith(n + ' ')).map(([, t]) => t));
    return hits.size === 1 ? [...hits][0] : undefined;
  };
  return (issuer: string, cls: string): string | null => {
    const k = normName(issuer);
    const hit = byName.get(k) ?? bySquash.get(k.replace(/ /g, '')) ?? prefix(k);
    if (!hit) return null;
    // Class B shares (for example BRK.B, GOOG) need the class from titleOfClass.
    if (/CL(ASS)? ?B/i.test(cls)) {
      const b = list.find((t) => normName(t.name) === k && /[.-]B$/.test(t.ticker));
      if (b) return b.ticker;
    }
    return hit;
  };
}
