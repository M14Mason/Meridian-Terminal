// SPLC chart view: suppliers on the left, customers on the right, partners on top, peers along the bottom,
// all wired to the company in the center (classic terminal supply chain layout). Pure SVG, so it is crisp,
// works on phones and needs no WebGL.
import { useEffect, useRef, useState } from 'react';
import { heatColor } from '../../shared/heat';

export interface Tile { id: string; label: string; ticker: string | null; line: string; share: number | null; conf: number; chg: number | null; impact?: number; crit?: string | null }

const TW = 178;
const TH = 34;
const GAP = 4;
const MAX = 22;

function TileBox({ x, y, t, onPick, selected, w = TW }: { x: number; y: number; t: Tile; onPick: (t: Tile) => void; selected: boolean; w?: number }) {
  const fill = t.impact != null && t.impact > 0.001 ? heatColor(-Math.min(1, t.impact * 4 + 0.2)) : t.chg == null ? '#2b2f36' : heatColor(Math.max(-1, Math.min(1, t.chg / 3)));
  // Truncate to the tile width (about 6.6 px per character at these font sizes).
  const room = Math.floor((w - (t.crit ? 86 : 24)) / 6.6);
  const fit = (x: string, n: number) => (x.length > n ? `${x.slice(0, Math.max(3, n - 1))}…` : x);
  const name = fit(t.label, room);
  const sub = fit(t.line, Math.floor((w - 26) / 6));
  return (
    <g transform={`translate(${x},${y})`} style={{ cursor: 'pointer' }} onClick={() => onPick(t)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onPick(t)} aria-label={`${t.label}. ${t.line}`}>
      <rect width={w} height={TH} fill={fill} stroke={selected ? '#ffffff' : t.crit ? '#ff433d' : '#000000'} strokeWidth={selected || t.crit ? 2 : 1} />
      {t.crit && <><rect width={5} height={TH} fill="#ff433d" /><text x={w - 22} y={13} fill="#ffdddd" fontSize={9} fontWeight={700} textAnchor="end">CRITICAL</text></>}
      <text x={t.crit ? 9 : 4} y={13} fill="#ffffff" fontSize={11} fontWeight={600}>{name}</text>
      <text x={t.crit ? 9 : 4} y={27} fill="#f0f0f0" fontSize={10} opacity={0.92}>{sub}</text>
      <circle cx={w - 9} cy={TH / 2} r={6} fill="none" stroke="#ffffff" strokeWidth={1} opacity={0.8} />
      <text x={w - 9} y={TH / 2 + 3.5} fill="#ffffff" fontSize={9} textAnchor="middle">i</text>
    </g>
  );
}

export function SupplyChart({ center, suppliers, customers, partners, peers, selected, onPick }: {
  center: { ticker: string; name: string; lines: string[] };
  suppliers: Tile[]; customers: Tile[]; partners: Tile[]; peers: Tile[];
  selected: string | null; onPick: (t: Tile) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(760);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(360, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Narrow panels and phones: company on top, suppliers and customers in two columns below, then partners and peers.
  if (w < 640) {
    const cw2 = (w - 12) / 2;
    const ch0 = 50 + center.lines.length * 13;
    const headY = ch0 + 30;
    const colTop = headY + 14;
    const L2 = suppliers.slice(0, MAX), R2 = customers.slice(0, MAX);
    const rows2 = Math.max(L2.length, R2.length);
    const extraTop = colTop + rows2 * (TH + GAP) + 18;
    const rest = [...partners.slice(0, 6), ...peers];
    const h2 = extraTop + (rest.length ? 16 + Math.ceil(rest.length / 2) * (TH + GAP) : 0);
    return (
      <div ref={box} style={{ width: '100%' }}>
        <svg width={w} height={h2} role="img" aria-label={`Supply chain of ${center.name}: ${suppliers.length} suppliers, ${customers.length} customers. The table lists the same data.`} style={{ display: 'block', background: '#000' }}>
          <g transform="translate(4,4)">
            <rect width={w - 8} height={ch0} fill="#a61d1d" stroke="#ffffff" />
            <text x={6} y={18} fill="#fff" fontSize={13} fontWeight={700}>{center.name.length > 34 ? `${center.name.slice(0, 33)}…` : center.name}</text>
            <text x={6} y={33} fill="#ffd27a" fontSize={11}>{center.ticker} US</text>
            {center.lines.map((l, i) => <text key={i} x={6} y={48 + i * 13} fill="#f0f0f0" fontSize={10}>{l}</text>)}
          </g>
          <line x1={w / 2} y1={ch0 + 4} x2={w / 2} y2={headY - 18} stroke="#3fa7a0" />
          <line x1={cw2 / 2 + 4} y1={headY - 18} x2={w - cw2 / 2 - 4} y2={headY - 18} stroke="#3fa7a0" />
          <text x={4} y={headY} fill="#ccc" fontSize={11}>{suppliers.length} Suppliers</text>
          <text x={w - 4} y={headY} fill="#ccc" fontSize={11} textAnchor="end">{customers.length} Customers</text>
          {L2.map((t, i) => <TileBox key={t.id} x={4} y={colTop + i * (TH + GAP)} t={t} w={cw2} onPick={onPick} selected={selected === t.id} />)}
          {R2.map((t, i) => <TileBox key={t.id} x={8 + cw2} y={colTop + i * (TH + GAP)} t={t} w={cw2} onPick={onPick} selected={selected === t.id} />)}
          {rest.length > 0 && <text x={4} y={extraTop} fill="#ccc" fontSize={11}>{partners.length ? `${Math.min(6, partners.length)} Partners, ` : ''}{peers.length} Peers</text>}
          {rest.map((t, i) => <TileBox key={t.id} x={4 + (i % 2) * (cw2 + 4)} y={extraTop + 8 + Math.floor(i / 2) * (TH + GAP)} t={t} w={cw2} onPick={onPick} selected={selected === t.id} />)}
        </svg>
      </div>
    );
  }
  const tw = Math.min(TW, Math.floor((w - 260) / 2));
  const L = suppliers.slice(0, MAX);
  const R = customers.slice(0, MAX);
  const P = partners.slice(0, 6);
  const top = P.length ? TH + 30 : 10;
  const rows = Math.max(L.length, R.length, 6);
  const colH = rows * (TH + GAP);
  const peersY = top + colH + 28;
  const h = peersY + (peers.length ? TH + 28 : 0);
  const midY = top + colH / 2;
  const cx = w / 2;
  const cw = Math.min(220, w - 2 * tw - 2 * 70);
  const ch = 58 + center.lines.length * 13;
  const hubL = tw + (cx - cw / 2 - tw) / 2;
  const hubR = w - hubL;
  const yOf = (i: number, n: number) => top + (colH - n * (TH + GAP)) / 2 + i * (TH + GAP);
  const line = '#3fa7a0';
  return (
    <div ref={box} style={{ width: '100%', overflowX: 'auto' }}>
      <svg width={w} height={h} role="img" aria-label={`Supply chain of ${center.name}: ${suppliers.length} suppliers, ${customers.length} customers. The table lists the same data.`} style={{ display: 'block', background: '#000' }}>
        {/* Wires: tiles to hubs, hubs to center */}
        {L.map((t, i) => <line key={`l${t.id}`} x1={tw} y1={yOf(i, L.length) + TH / 2} x2={hubL} y2={midY} stroke={line} strokeWidth={0.8} opacity={0.7} />)}
        {R.map((t, i) => <line key={`r${t.id}`} x1={w - tw} y1={yOf(i, R.length) + TH / 2} x2={hubR} y2={midY} stroke={line} strokeWidth={0.8} opacity={0.7} />)}
        {L.length > 0 && <line x1={hubL} y1={midY} x2={cx - cw / 2} y2={midY} stroke={line} />}
        {R.length > 0 && <line x1={hubR} y1={midY} x2={cx + cw / 2} y2={midY} stroke={line} />}
        {P.map((t, i) => { const px = cx + (i - (P.length - 1) / 2) * (tw + 6); return <line key={`p${t.id}`} x1={px} y1={10 + TH} x2={cx} y2={midY - ch / 2} stroke={line} strokeWidth={0.8} opacity={0.7} />; })}
        {peers.length > 0 && <line x1={cx} y1={midY + ch / 2} x2={cx} y2={peersY - 14} stroke={line} />}
        {peers.length > 0 && <rect x={cx - 5} y={peersY - 19} width={10} height={10} fill="#555" />}
        {peers.length > 0 && <text x={cx + 10} y={peersY - 10} fill="#ccc" fontSize={11}>{peers.length} Peers</text>}

        {/* Hubs */}
        {L.length > 0 && <><rect x={hubL - 6} y={midY - 6} width={12} height={12} fill="#555" /><text x={hubL} y={midY - 12} fill="#ccc" fontSize={11} textAnchor="middle">{suppliers.length} Suppliers</text></>}
        {R.length > 0 && <><rect x={hubR - 6} y={midY - 6} width={12} height={12} fill="#555" /><text x={hubR} y={midY - 12} fill="#ccc" fontSize={11} textAnchor="middle">{customers.length} Customers</text></>}

        {/* Center company */}
        <g transform={`translate(${cx - cw / 2},${midY - ch / 2})`}>
          <rect width={cw} height={ch} fill="#a61d1d" stroke="#ffffff" strokeWidth={1} />
          <text x={6} y={18} fill="#ffffff" fontSize={13} fontWeight={700}>{center.name.length > 26 ? `${center.name.slice(0, 25)}…` : center.name}</text>
          <text x={6} y={34} fill="#ffd27a" fontSize={11}>{center.ticker} US</text>
          {center.lines.map((l, i) => <text key={i} x={6} y={50 + i * 13} fill="#f0f0f0" fontSize={10}>{l}</text>)}
        </g>

        {/* Tiles */}
        {P.map((t, i) => <TileBox key={t.id} x={cx + (i - (P.length - 1) / 2) * (tw + 6) - tw / 2} y={10} t={t} w={tw} onPick={onPick} selected={selected === t.id} />)}
        {L.map((t, i) => <TileBox key={t.id} x={0} y={yOf(i, L.length)} t={t} w={tw} onPick={onPick} selected={selected === t.id} />)}
        {R.map((t, i) => <TileBox key={t.id} x={w - tw} y={yOf(i, R.length)} t={t} w={tw} onPick={onPick} selected={selected === t.id} />)}
        {peers.map((t, i) => { const pw = Math.min(tw, (w - 8) / peers.length - 4); return <TileBox key={t.id} x={4 + i * (pw + 4)} y={peersY} t={t} w={pw} onPick={onPick} selected={selected === t.id} />; })}
        {suppliers.length > MAX && <text x={4} y={top + colH + 14} fill="#aaa" fontSize={10}>+{suppliers.length - MAX} more in the table</text>}
        {customers.length > MAX && <text x={w - 4} y={top + colH + 14} fill="#aaa" fontSize={10} textAnchor="end">+{customers.length - MAX} more in the table</text>}
      </svg>
    </div>
  );
}
