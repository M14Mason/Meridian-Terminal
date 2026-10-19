// Filing text tools for FDIF and ECS (catalog 107 to 110). Pure, tested.

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', mdash: '-', ndash: '-', bull: '*', hellip: '...' };

/** HTML or iXBRL to plain text with paragraph breaks. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<ix:header[\s\S]*?<\/ix:header>/gi, ' ')
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENT[n.toLowerCase()] ?? m)
    .replace(/[ \t ]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Item 1A (Risk Factors) of a 10-K. Skips the table of contents by taking the LONGEST span that
 * starts at an "Item 1A" heading and ends at the next "Item 1B" / "Item 1C" / "Item 2" heading.
 */
export function riskFactors(text: string): string {
  const starts = [...text.matchAll(/^\s*item\s*1a\.?\s*[-:]?\s*risk factors/gim)].map((m) => m.index!);
  let best = '';
  for (const s of starts) {
    const rest = text.slice(s);
    const end = rest.slice(20).search(/^\s*item\s*(1b|1c|2)\.?\s/im);
    const chunk = end < 0 ? rest.slice(0, 400_000) : rest.slice(0, end + 20);
    if (chunk.length > best.length) best = chunk;
  }
  return best;
}

export const paragraphs = (t: string, min = 60) => t.split('\n').map((p) => p.trim()).filter((p) => p.length >= min);

const words = (p: string) => new Set(p.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
function jaccard(a: Set<string>, b: Set<string>) {
  let i = 0;
  for (const w of a) if (b.has(w)) i++;
  return i / (a.size + b.size - i || 1);
}

export interface ParaDiff { added: string[]; removed: string[]; changed: { before: string; after: string; sim: number }[]; same: number }

/** Paragraph-level diff: exact matches are "same", near matches (similarity >= 0.6) are "changed". */
export function diffParagraphs(prev: string[], cur: string[]): ParaDiff {
  const prevSet = new Set(prev);
  const curSet = new Set(cur);
  const removedCand = prev.filter((p) => !curSet.has(p));
  const addedCand = cur.filter((p) => !prevSet.has(p));
  const rw = removedCand.map(words);
  const used = new Set<number>();
  const changed: ParaDiff['changed'] = [];
  const added: string[] = [];
  for (const a of addedCand) {
    const aw = words(a);
    let best = -1, bs = 0;
    rw.forEach((w, i) => { if (used.has(i)) return; const s = jaccard(aw, w); if (s > bs) { bs = s; best = i; } });
    if (best >= 0 && bs >= 0.6) { used.add(best); changed.push({ before: removedCand[best]!, after: a, sim: bs }); } else added.push(a);
  }
  return { added, removed: removedCand.filter((_, i) => !used.has(i)), changed, same: cur.length - addedCand.length };
}

/** Loughran-McDonald style tone counts on a small built-in word list (uncertainty, negative, litigious). */
const NEG = ['adverse', 'decline', 'loss', 'losses', 'impair', 'impairment', 'failure', 'weak', 'deteriorat', 'downturn', 'shortfall', 'default', 'breach', 'disrupt'];
const UNC = ['uncertain', 'uncertainty', 'may', 'might', 'could', 'possible', 'possibly', 'risk', 'risks', 'volatil', 'unpredictab', 'depend'];
const LIT = ['litigation', 'lawsuit', 'claims', 'regulator', 'investigation', 'penalt', 'settlement', 'subpoena'];
export function toneCounts(t: string) {
  const ws = t.toLowerCase().match(/[a-z]+/g) ?? [];
  const n = ws.length || 1;
  const c = (list: string[]) => ws.filter((w) => list.some((x) => w.startsWith(x))).length;
  return { words: ws.length, negative: (c(NEG) / n) * 1000, uncertainty: (c(UNC) / n) * 1000, litigious: (c(LIT) / n) * 1000 };
}
