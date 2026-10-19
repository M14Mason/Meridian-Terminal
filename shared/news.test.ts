import { describe, expect, it } from 'vitest';
import { dedupe, keywordSentiment, latencySeconds } from './news';
import type { NewsItem } from './market';

const n = (id: string, headline: string, publishedAt: number, provider: string): NewsItem => ({ id, headline, source: 's', url: 'u', symbols: [], publishedAt, receivedAt: publishedAt + 5000, provider });

describe('news', () => {
  it('merges the same headline from two feeds', () => {
    const out = dedupe([n('1', 'Apple beats estimates!', 2000, 'Alpaca'), n('2', 'apple beats estimates', 1000, 'Finnhub'), n('3', 'Other', 500, 'Alpaca')]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ publishedAt: 1000, alsoFrom: ['Finnhub'] });
  });
  it('scores keywords', () => {
    expect(keywordSentiment('Nvidia beats and raises guidance')).toBe(1);
    expect(keywordSentiment('Boeing shares plunge after recall')).toBe(-1);
    expect(keywordSentiment('Company holds annual meeting')).toBe(0);
  });
  it('measures latency', () => {
    expect(latencySeconds({ publishedAt: 0, receivedAt: 12_400 })).toBe(12);
  });
});
