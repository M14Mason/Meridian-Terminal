import { describe, expect, it } from 'vitest';
import { checkShard, disrupt, edges, neighborhood, relevantText, type Shard } from './supply';

const src = 'https://www.sec.gov/Archives/edgar/data/1/000000000000000001/x.htm';
const shard = (t: string, rels: Shard['rels']): Shard => ({ v: 1, t, cik: 1, name: t, industry: 'x', hq: { city: 'A', country: 'US' }, filing: { form: '10-K', date: '2026-01-01', url: src }, facilities: [], rels, gaps: '', model: 'claude-code', at: '2026-10-19' });

describe('supply', () => {
  it('validates shards and enforces sources and short evidence', () => {
    const ok = shard('AAPL', [{ n: 'Taiwan Semiconductor', t: 'TSM', k: 'supplier', what: 'chips', conf: 0.9, ev: 'manufactured by TSMC', src }]);
    expect(checkShard(ok)).toBeNull();
    expect(checkShard({ ...ok, rels: [{ ...ok.rels[0]!, src: 'https://example.com' }] })).toMatch(/SEC/);
    expect(checkShard({ ...ok, rels: [{ ...ok.rels[0]!, ev: 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen' }] })).toMatch(/15 words/);
  });
  it('builds directed edges and neighborhoods', () => {
    const e = edges([shard('AAPL', [{ n: 'TSMC', t: 'TSM', k: 'supplier', what: 'chips', conf: 0.9, ev: 'x', src }]), shard('TSM', [{ n: 'Apple', t: 'AAPL', k: 'customer', what: 'wafers', share: 25, conf: 0.9, ev: 'x', src }, { n: 'ASML', t: 'ASML', k: 'supplier', what: 'tools', conf: 0.8, ev: 'x', src }])]);
    expect(e.map((x) => `${x.from}>${x.to}`)).toEqual(['TSM>AAPL', 'TSM>AAPL', 'ASML>TSM']);
    const n = neighborhood(e, 'AAPL', 2);
    expect([...n.nodes.keys()].sort()).toEqual(['AAPL', 'ASML', 'TSM']);
    const d = disrupt(e, 'TSM');
    expect(d.get('AAPL')!).toBeGreaterThan(d.get('ASML')!);
  });
  it('keeps concentration paragraphs and drops boilerplate', () => {
    const text = ['General corporate boilerplate about our mission and values that goes on for a while without saying anything.', 'Sales to Walmart Inc. accounted for 18% of our net sales in fiscal 2025, and our largest customers are retailers.', 'We rely on a limited number of suppliers, and our products are manufactured by Foxconn Ltd. in China.'].join('\n');
    const r = relevantText(text);
    expect(r.body).toContain('Walmart');
    expect(r.body).toContain('Foxconn');
    expect(r.body).not.toContain('boilerplate');
  });
});

import { forceLayout } from './supply';
describe('forceLayout', () => {
  it('places linked nodes closer than unlinked ones and is deterministic', () => {
    const ids = ['A', 'B', 'C', 'D'];
    const a = forceLayout(ids, [['A', 'B'], ['C', 'D']], 200);
    const b = forceLayout(ids, [['A', 'B'], ['C', 'D']], 200);
    expect(a.get('A')).toEqual(b.get('A'));
    const dist = (x: string, y: string) => Math.hypot(...a.get(x)!.map((v, i) => v - a.get(y)![i]!));
    expect(dist('A', 'B')).toBeLessThan(dist('A', 'C'));
  });
});
