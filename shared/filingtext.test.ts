import { describe, expect, it } from 'vitest';
import { diffParagraphs, htmlToText, riskFactors, toneCounts } from './filingtext';

describe('filingtext', () => {
  it('converts HTML to text paragraphs', () => {
    expect(htmlToText('<html><head><title>x</title></head><body><p>Hello&nbsp;&amp; world</p><div>Next&#8217;s line</div><script>bad()</script></body></html>')).toBe("Hello & world\nNext’s line");
  });
  it('takes the risk factor body, not the table of contents', () => {
    const t = ['Item 1A. Risk Factors 12', 'Item 1B. Unresolved 30', 'Item 2. Properties 31', 'PART I', 'Item 1A. Risk Factors', 'Our business could suffer from many risks that are described in this long paragraph of text.', 'Another risk paragraph that is also quite long and detailed for testing.', 'Item 1B. Unresolved Staff Comments', 'None.'].join('\n');
    const r = riskFactors(t);
    expect(r).toContain('Another risk paragraph');
    expect(r).not.toContain('Unresolved Staff');
  });
  it('diffs paragraphs into added, removed and changed', () => {
    const prev = ['We rely on suppliers in Asia for most of our components and parts.', 'Interest rates could rise and hurt demand for our products in many markets.', 'Old risk about a product we no longer sell at all anywhere.'];
    const cur = ['We rely on suppliers in Asia and Mexico for most of our components and parts.', 'Interest rates could rise and hurt demand for our products in many markets.', 'New tariffs on imported goods could raise our costs significantly next year.'];
    const d = diffParagraphs(prev, cur);
    expect(d.same).toBe(1);
    expect(d.changed).toHaveLength(1);
    expect(d.added).toEqual([cur[2]]);
    expect(d.removed).toEqual([prev[2]]);
  });
  it('counts tone words per 1,000', () => {
    const t = toneCounts('We may face litigation and adverse uncertain results.');
    expect(t.uncertainty).toBeGreaterThan(0);
    expect(t.litigious).toBeGreaterThan(0);
    expect(t.negative).toBeGreaterThan(0);
  });
});
