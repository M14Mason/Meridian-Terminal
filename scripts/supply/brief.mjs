// Prints the candidate sentences of prepared extraction files (names, shares, sourcing language) so an
// extraction session reads less. Usage: node scripts/supply/brief.mjs <rankFrom> <rankTo>
import { readdirSync, readFileSync } from 'node:fs';

const [a, b] = process.argv.slice(2).map(Number);
const CUE = /(accounted for|\d+(\.\d+)?\s?%|sole|single[- ]source|limited number of|contract manufactur|foundr|supplier|supply agreement|purchase agreement|distribut|collaborat|partnership|joint venture|licens|customer|offtake|tolling|depend)/i;
const NAME = /\b([A-Z][A-Za-z&.-]+(?: [A-Z][A-Za-z&.-]+)*,? (?:Inc|Corp|Corporation|Ltd|Limited|LLC|plc|Co|N\.V|AG|S\.A|SE|GmbH|Holdings|Group)\b|[A-Z]{2,}(?: [A-Z][a-z]+)?\b)/;
const BORING = /(tax|fair value|lease|derivative|goodwill|impair|pension|hedg|accounting standard|ASU|IFRS|deferred|amortiz|stock-based|warrant)/i;
for (const f of readdirSync('.cache/supply').filter((n) => n.endsWith('.txt')).sort()) {
  const rank = Number(f.slice(0, 4));
  if (rank < a || rank > b) continue;
  const txt = readFileSync(`.cache/supply/${f}`, 'utf8');
  const [h1, h2] = txt.split('\n');
  console.log(`=== ${f.slice(0, -4)} | ${h1.split('|').slice(2).join('|').trim()} | ${h2}`);
  const props = (txt.split('--- PROPERTIES ---')[1] ?? '').split('--- RELEVANT')[0].replace(/\s+/g, ' ').slice(0, 300);
  if (props.trim()) console.log(`P: ${props}`);
  const body = txt.split('--- RELEVANT PARAGRAPHS ---')[1] ?? '';
  const seen = new Set();
  let n = 0;
  for (const s of body.replace(/\n/g, ' ').split(/(?<=[.;])\s+(?=[A-Z(•])/)) {
    if (s.length < 40 || BORING.test(s) || !CUE.test(s) || !NAME.test(s.slice(1))) continue;
    const k = s.slice(0, 80);
    if (seen.has(k)) continue;
    seen.add(k);
    console.log(`- ${s.slice(0, 330)}`);
    if (++n >= 14) break;
  }
}
