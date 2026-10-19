import { useEffect, useRef, useState } from 'react';
import { heatColor, squarify } from '../../shared/heat';
import { categories } from '../data/adapters/coingecko';
import { useData } from '../data/useData';
import { fmtBig, fmtPct } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

// CRYP: crypto sector treemap. Size = sector market cap, color = 24h change. Sectors overlap.
export default function CryptoSectorsPanel(_: PanelProps) {
  const state = useData('cryp', categories, { source: 'CoinGecko', everyMs: 5 * 60_000 });
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const h = Math.max(240, Math.round(w * 0.55));
  const top = (state.data ?? []).filter((c) => (c.market_cap ?? 0) > 0).sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0)).slice(0, 30);
  const rects = squarify(top.map((c) => ({ value: c.market_cap ?? 0, data: c })), { x: 0, y: 0, w, h });
  return (
    <div>
      <DataStatus state={state} />
      <div ref={box}>
        <svg width={w} height={h} role="img" aria-label="Crypto sectors by market cap, colored by 24 hour change">
          {rects.map((r) => {
            const ch = r.data.market_cap_change_24h ?? 0;
            return (
              <g key={r.data.id}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={heatColor(Math.max(-1, Math.min(1, ch / 8)))} stroke="#000" strokeWidth={1} />
                <title>{`${r.data.name}: ${fmtBig(r.data.market_cap)} cap, ${fmtPct(ch)} 24h`}</title>
                {r.w > 60 && r.h > 26 && (
                  <>
                    <text x={r.x + 4} y={r.y + 13} fill="#f0f0f0" fontSize={11}>{r.data.name.length * 6.5 > r.w ? r.data.name.slice(0, Math.floor(r.w / 6.5)) : r.data.name}</text>
                    <text x={r.x + 4} y={r.y + 26} fill="#f0f0f0" fontSize={10} opacity={0.85}>{fmtPct(ch)}</text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="disclaimer">Source: CoinGecko categories (top 30 by market cap). Categories overlap, so sizes do not add up to the total market. Color scale saturates at plus or minus 8%.</div>
    </div>
  );
}
