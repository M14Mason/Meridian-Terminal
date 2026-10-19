#!/usr/bin/env node
// AIS snapshot fallback (BUILD_PROMPT 14.3). Runs in GitHub Actions: listens to AISStream for a
// few minutes, keeps tankers, and posts a compact snapshot to the proxy with the admin token.
// Never prints secrets. Env: AISSTREAM_API_KEY, MERIDIAN_ADMIN_TOKEN, PROXY_URL, LISTEN_SECONDS.
import { applyMessage, category, pack, ZoneCounter, zoneOf } from '../shared/ais.ts';

const key = process.env.AISSTREAM_API_KEY;
const admin = process.env.MERIDIAN_ADMIN_TOKEN;
const proxy = process.env.PROXY_URL;
const seconds = Number(process.env.LISTEN_SECONDS ?? 240);
if (!key || !admin || !proxy) {
  console.log('missing AISSTREAM_API_KEY, MERIDIAN_ADMIN_TOKEN or PROXY_URL; skipping');
  process.exit(0);
}

const vessels = new Map();
const zones = new ZoneCounter();
let msgs = 0;
const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
ws.addEventListener('open', () => {
  ws.send(JSON.stringify({ APIKey: key, BoundingBoxes: [[[-90, -180], [90, 180]]], FilterMessageTypes: ['PositionReport', 'ShipStaticData'] }));
});
ws.addEventListener('message', async (e) => {
  const text = typeof e.data === 'string' ? e.data : await e.data.text();
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return;
  }
  msgs++;
  const now = Date.now();
  const v = applyMessage(vessels, raw, now);
  if (v && Number.isFinite(v.lat) && category(v) !== 'other' && category(v) !== 'cargo') {
    const z = zoneOf(v.lat, v.lon);
    if (z) zones.observe(z.id, v.mmsi, now);
  }
});
ws.addEventListener('error', () => console.log('websocket error'));

await new Promise((r) => setTimeout(r, seconds * 1000));
ws.close();
const now = Date.now();
const tankers = [...vessels.values()].filter((v) => Number.isFinite(v.lat) && (category(v) === 'tanker' || category(v) === 'lng_lpg')).slice(0, 15000);
const body = JSON.stringify({
  at: now,
  source: 'actions',
  vessels: tankers.map(pack),
  statics: Object.fromEntries(tankers.map((v) => [v.mmsi, { n: v.name, d: v.dest, dr: v.draught, i: v.imo, cs: v.callsign }])),
  zones: zones.counts(now),
});
const res = await fetch(`${proxy.replace(/\/$/, '')}/api/ais/ingest`, { method: 'POST', headers: { authorization: `Bearer ${admin}`, 'content-type': 'application/json' }, body });
console.log(`messages ${msgs}, vessels ${vessels.size}, tankers with type ${tankers.length}, upload ${res.status}`);
if (!res.ok) process.exit(1);
