// SOCL: cashtag mentions sampled live from the public Bluesky Jetstream (no account, read only).
import { useEffect, useMemo, useRef, useState } from 'react';
import { cashtags } from '../../shared/cashtags';
import { tickers } from '../data/adapters/sec';
import { useData } from '../data/useData';
import type { PanelProps } from '../shell/types';

const HOSTS = ['jetstream2.us-east.bsky.network', 'jetstream1.us-east.bsky.network'];

interface Tally { n: number; samples: string[] }

export default function SocialPanel({ run }: PanelProps) {
  const known = useData('socl:tickers', async () => ({ data: new Set((await tickers()).map((t) => t.ticker)), fetchedAt: Date.now(), fromCache: false }));
  const [secs, setSecs] = useState(180);
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(0);
  const [posts, setPosts] = useState(0);
  const [tally, setTally] = useState<Record<string, Tally>>({});
  const [err, setErr] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!running) return;
    const started = performance.now();
    const acc: Record<string, Tally> = {};
    let n = 0;
    let host = 0;
    const open = () => {
      const s = new WebSocket(`wss://${HOSTS[host]}/subscribe?wantedCollections=app.bsky.feed.post`);
      ws.current = s;
      s.onmessage = (ev) => {
        try {
          const m = JSON.parse(ev.data as string) as { kind?: string; commit?: { operation?: string; record?: { text?: string } } };
          const text = m.kind === 'commit' && m.commit?.operation === 'create' ? m.commit.record?.text : undefined;
          if (!text) return;
          n++;
          for (const t of cashtags(text)) {
            const cur = (acc[t] ??= { n: 0, samples: [] });
            cur.n++;
            if (cur.samples.length < 3) cur.samples.push(text.slice(0, 220));
          }
        } catch {
          // ignore malformed frames
        }
      };
      s.onerror = () => {
        if (host + 1 < HOSTS.length) {
          host++;
          open();
        } else setErr('Could not reach the Bluesky Jetstream.');
      };
    };
    open();
    const tick = setInterval(() => {
      const el = (performance.now() - started) / 1000;
      setLeft(Math.max(0, Math.ceil(secs - el)));
      setPosts(n);
      setTally({ ...acc });
      if (el >= secs) setRunning(false);
    }, 1000);
    return () => {
      clearInterval(tick);
      ws.current?.close();
      ws.current = null;
    };
  }, [running, secs]);

  const rows = useMemo(() => Object.entries(tally).sort((a, b) => b[1].n - a[1].n).slice(0, 60), [tally]);
  return (
    <div>
      <div className="toolbar">
        {[60, 180, 600].map((s) => <button key={s} aria-pressed={secs === s} disabled={running} onClick={() => setSecs(s)}>{s}S</button>)}
        <button onClick={() => { setErr(null); if (!running) { setTally({}); setPosts(0); setLeft(secs); } setRunning((r) => !r); }}>{running ? `STOP (${left}s)` : 'SAMPLE'}</button>
        <span className="muted">{posts.toLocaleString()} posts scanned</span>
      </div>
      {err && <p className="down">{err}</p>}
      <table className="grid-table">
        <thead><tr><th>Cashtag</th><th className="num">Mentions</th><th>Example</th></tr></thead>
        <tbody>{rows.map(([t, v]) => <tr key={t}><td>{known.data?.has(t) ? <button className="link-btn" onClick={() => run(`${t} GP`)}>${t}</button> : <span className="muted">${t}</span>}</td><td className="num">{v.n}</td><td style={{ whiteSpace: 'normal', maxWidth: 420 }} className="muted">{v.samples[0]}</td></tr>)}</tbody>
      </table>
      {!rows.length && !running && <p className="muted">Press SAMPLE to listen to all new public Bluesky posts for a short window and count $TICKER cashtags.</p>}
      <div className="disclaimer">Live sample of the public Bluesky firehose (Jetstream). Uses about 20 KB per second while sampling, so it only runs when you press SAMPLE. Cashtags are rare there (often a handful per minute), so use 3 to 10 minute windows. Small, noisy audience; bots exist; not representative of investors. No stability promise from Bluesky. Not financial advice.</div>
    </div>
  );
}
