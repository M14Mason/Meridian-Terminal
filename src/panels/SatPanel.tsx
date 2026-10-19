// SAT: Sentinel-2 true-colour images of ports and storage hubs (Copernicus Data Space, via the proxy).
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useData } from '../data/useData';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

interface Site { id: string; name: string; lat: number; lon: number; km: number }
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function Img({ site, date, label }: { site: string; date: string; label: string }) {
  const [state, setState] = useState<{ key: string; url: string | null; err: string | null }>({ key: '', url: null, err: null });
  const key = `${site}:${date}`;
  useEffect(() => {
    let url: string | null = null;
    let live = true;
    api<Blob>(`/api/sat/${site}?date=${date}`, { blob: true })
      .then((b) => { url = URL.createObjectURL(b); if (live) setState({ key, url, err: null }); })
      .catch((e: unknown) => { if (live) setState({ key, url: null, err: e instanceof Error ? e.message : 'failed' }); });
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [site, date, key]);
  const cur = state.key === key ? state : { url: null, err: null };
  return (
    <figure style={{ margin: 0, flex: '1 1 280px', minWidth: 0 }}>
      <figcaption className="muted">{label}: best scene in the 20 days to {date}</figcaption>
      {cur.err ? <p className="down">{cur.err}</p> : cur.url ? <img src={cur.url} alt={`Satellite image, ${label}`} style={{ width: '100%', imageRendering: 'auto', border: '1px solid var(--border)' }} /> : <p className="muted">Loading image (first request can take 10 to 20 seconds)...</p>}
    </figure>
  );
}

export default function SatPanel(_: PanelProps) {
  const st = useData('sat:sites', async () => ({ data: await api<Site[]>('/api/sat/sites'), fetchedAt: Date.now(), fromCache: false }), { source: 'Copernicus Data Space' });
  const [site, setSite] = useState('cushing');
  const [now] = useState(() => Date.now());
  const [date, setDate] = useState(() => iso(now));
  const [cmp, setCmp] = useState(() => iso(now - 90 * 86_400_000));
  const s = st.data?.find((x) => x.id === site);
  return (
    <div>
      <div className="toolbar">
        <select value={site} onChange={(e) => setSite(e.target.value)} aria-label="Site">{(st.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <label className="muted">Date <input type="date" value={date} max={iso(now)} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
        <label className="muted">Compare <input type="date" value={cmp} max={iso(now)} onChange={(e) => e.target.value && setCmp(e.target.value)} /></label>
      </div>
      <DataStatus state={st} />
      {s && <p className="muted">{s.name}: {s.lat.toFixed(3)}, {s.lon.toFixed(3)}, about {s.km * 2} km across. <a href={`https://browser.dataspace.copernicus.eu/?lat=${s.lat}&lng=${s.lon}&zoom=13`} target="_blank" rel="noreferrer noopener">Open in Copernicus Browser</a></p>}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Img site={site} date={date} label="Now" />
        <Img site={site} date={cmp} label="Compare" />
      </div>
      <div className="disclaimer">Contains modified Copernicus Sentinel data, processed by the Copernicus Data Space Ecosystem. 10 m resolution, a new pass about every 5 days, clouds permitting: you can see tank farms, ship queues and parking lots, not individual barrels. Free monthly processing quota; images are cached for a week.</div>
    </div>
  );
}
