// News helpers (12.4): de-duplication across providers and a transparent keyword sentiment score.
import type { NewsItem } from './market';

export function headlineKey(h: string): string {
  return h.toLowerCase().replace(/&amp;/g, '&').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 70);
}

/** Merges duplicate headlines from different feeds. Keeps the earliest publish time and lists every source. */
export function dedupe(items: NewsItem[]): (NewsItem & { alsoFrom: string[] })[] {
  const byKey = new Map<string, NewsItem & { alsoFrom: string[] }>();
  for (const n of items) {
    const k = headlineKey(n.headline);
    if (!k) continue;
    const cur = byKey.get(k);
    if (!cur) byKey.set(k, { ...n, alsoFrom: [] });
    else {
      if (!cur.alsoFrom.includes(n.provider) && cur.provider !== n.provider) cur.alsoFrom.push(n.provider);
      if (n.publishedAt < cur.publishedAt) cur.publishedAt = n.publishedAt;
      cur.symbols = [...new Set([...cur.symbols, ...n.symbols])];
    }
  }
  return [...byKey.values()].sort((a, b) => b.publishedAt - a.publishedAt);
}

const POS = ['beat', 'beats', 'surge', 'surges', 'soar', 'soars', 'record', 'upgrade', 'upgraded', 'raises', 'raised', 'growth', 'profit', 'approval', 'approved', 'wins', 'strong', 'rally', 'rallies', 'jump', 'jumps', 'gain', 'gains', 'outperform', 'buyback', 'expands', 'tops'];
const NEG = ['miss', 'misses', 'plunge', 'plunges', 'fall', 'falls', 'downgrade', 'downgraded', 'cut', 'cuts', 'loss', 'losses', 'lawsuit', 'probe', 'recall', 'weak', 'slump', 'slumps', 'drop', 'drops', 'warning', 'warns', 'bankruptcy', 'layoffs', 'fraud', 'investigation', 'sues', 'sued', 'decline', 'declines', 'halt', 'delay', 'delays'];
const P = new Set(POS);
const N = new Set(NEG);

/** -1 to 1 from word counts. Shown as "keyword score", never as AI or as advice. */
export function keywordSentiment(text: string): number {
  let p = 0;
  let n = 0;
  for (const w of text.toLowerCase().split(/[^a-z]+/)) {
    if (P.has(w)) p++;
    else if (N.has(w)) n++;
  }
  return p + n === 0 ? 0 : (p - n) / (p + n);
}

/** Seconds between publish and first sight on this device (12.2). */
export function latencySeconds(n: Pick<NewsItem, 'publishedAt' | 'receivedAt'>): number {
  return Math.max(0, Math.round((n.receivedAt - n.publishedAt) / 1000));
}
