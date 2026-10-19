import { describe, expect, it } from 'vitest';
import { parseCurrentFeed, parseItems } from './edgar8k';

const XML = `<feed><entry><title>8-K - APPLE INC (0000320193) (Filer)</title><link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/0000320193-24-000123-index.htm"/><summary type="html"> &lt;b&gt;Filed:&lt;/b&gt; 2024-10-31 &lt;b&gt;AccNo:&lt;/b&gt; 0000320193-24-000123 &lt;b&gt;Size:&lt;/b&gt; 2 MB Item 2.02: Results of Operations Item 9.01: Financial Statements</summary><updated>2024-10-31T16:30:00-04:00</updated></entry>
<entry><title>8-K - SMALL CO &amp; SONS (0001234567) (Filer)</title><link href="https://x"/><summary>Item 4.01 Item 5.02</summary><updated>2024-10-31T16:31:00-04:00</updated></entry></feed>`;

describe('edgar 8-K feed', () => {
  it('parses entries and items', () => {
    const r = parseCurrentFeed(XML);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ form: '8-K', company: 'APPLE INC', cik: 320193, items: ['2.02', '9.01'] });
    expect(r[1]).toMatchObject({ company: 'SMALL CO & SONS', items: ['4.01', '5.02'] });
  });
  it('ignores unknown item numbers', () => {
    expect(parseItems('Item 9.99 and 2.02')).toEqual(['2.02']);
  });
});
