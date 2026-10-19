// AIS relay (14.2). One Durable Object holds the only AISStream connection (their limit is 3 per
// account, and browsers may not connect directly). It opens when a paired device opens the map,
// pushes compact updates every 3 s, and closes 60 s after the last device leaves.

import { DurableObject } from 'cloudflare:workers';
import { applyMessage, category, CHOKEPOINTS, darkShips, pack, ZoneCounter, zoneOf, type Vessel } from '../../shared/ais';
import type { Env } from './env';
import { log } from './log';

type View = { kind: 'tankers' | 'chokepoints' | 'all'; bbox?: [number, number, number, number] };

interface Client {
  ws: WebSocket;
  view: View;
  sentAt: number; // last broadcast time, for deltas
  /** Vessels whose static data (name, destination) this device already has, with the version sent. */
  knownStatic: Map<number, number>;
}

const MAX_VESSELS = 80_000;
const PUSH_MS = 3000;
const IDLE_CLOSE_MS = 60_000;
const SNAPSHOT_MS = 10 * 60_000;

/** WebSocket frames can be text, ArrayBuffer or Blob depending on the sender; normalize to a string. */
export async function toText(d: unknown): Promise<string> {
  if (typeof d === 'string') return d;
  if (d instanceof ArrayBuffer) return new TextDecoder().decode(d);
  if (d instanceof Blob) return d.text();
  return '';
}

export class AisHub extends DurableObject<Env> {
  private clients = new Set<Client>();
  private vessels = new Map<number, Vessel>();
  /** Last change of any kind (position or static) per vessel, so deltas include late type info. */
  private changed = new Map<number, number>();
  private staticAt = new Map<number, number>();
  private zones = new ZoneCounter();
  private upstream: WebSocket | null = null;
  private upSince = 0;
  private compression: boolean | null = null;
  private status: 'idle' | 'connecting' | 'live' | 'error' | 'no-key' = 'idle';
  private lastError = '';
  private msgCount = 0;
  /** Diagnostics: last frame that was not a ship message (first 300 chars), last close code and reason. */
  private lastRaw = '';
  private lastClose = '';
  private frames = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private idleSince = 0;
  private lastSnapshot = 0;

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.endsWith('/ws')) {
      if (req.headers.get('upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      server.accept();
      const c: Client = { ws: server, view: { kind: 'tankers' }, sentAt: 0, knownStatic: new Map() };
      this.clients.add(c);
      server.addEventListener('message', (e) => this.onClientMessage(c, e.data));
      server.addEventListener('close', () => this.clients.delete(c));
      server.addEventListener('error', () => this.clients.delete(c));
      void this.ensureUpstream();
      this.ensureTimer();
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname.endsWith('/debug')) {
      return new Response(JSON.stringify({ status: this.status, lastError: this.lastError, msgs: this.msgCount, frames: this.frames, compression: this.compression, upSince: this.upSince, clients: this.clients.size, vessels: this.vessels.size, lastRaw: this.lastRaw, lastClose: this.lastClose }), { headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/snapshot')) {
      // Latest stored snapshot, for devices when the live relay is down (14.3).
      const snap = await this.ctx.storage.get<string>('snapshot');
      return new Response(snap ?? JSON.stringify({ vessels: [], at: 0, source: 'none' }), { headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/ingest') && req.method === 'POST') {
      // Snapshot pushed by the optional GitHub Actions fallback. Auth checked by the Worker.
      const body = await req.text();
      if (body.length > 3_000_000) return new Response('too large', { status: 413 });
      await this.ctx.storage.put('snapshot', body);
      return new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }

  private onClientMessage(c: Client, data: unknown) {
    if (typeof data !== 'string' || data.length > 2000) return;
    try {
      const m = JSON.parse(data) as { type?: string; view?: string; bbox?: unknown };
      if (m.type === 'view' && (m.view === 'tankers' || m.view === 'chokepoints' || m.view === 'all')) {
        const b = Array.isArray(m.bbox) && m.bbox.length === 4 && m.bbox.every((x) => typeof x === 'number' && Number.isFinite(x)) ? (m.bbox as View['bbox']) : undefined;
        c.view = { kind: m.view, bbox: b };
        c.sentAt = 0; // full refresh for the new view
        c.knownStatic.clear();
      }
    } catch {
      // ignore malformed client messages
    }
  }

  private async ensureUpstream() {
    if (this.upstream || this.status === 'connecting') return;
    this.status = 'connecting';
    const keyRes = await this.env.VAULT.get(this.env.VAULT.idFromName('main')).resolveKey('AISSTREAM_API_KEY');
    const key = keyRes.ok ? keyRes.data : null;
    if (!key) {
      this.status = 'no-key';
      return;
    }
    try {
      // Ask for permessage-deflate: AISStream drops messages over a bandwidth cap on uncompressed connections (Sept 2026).
      const resp = await fetch('https://stream.aisstream.io/v0/stream', { headers: { Upgrade: 'websocket', 'Sec-WebSocket-Extensions': 'permessage-deflate' } });
      const ws = resp.webSocket;
      if (!ws) throw new Error(`upgrade failed ${resp.status}`);
      ws.accept();
      this.upstream = ws;
      // Must subscribe within 3 seconds. Global box; filtering by view happens here, per device.
      ws.send(JSON.stringify({ APIKey: key, BoundingBoxes: [[[-90, -180], [90, 180]]], FilterMessageTypes: ['PositionReport', 'ShipStaticData'] }));
      this.upSince = Date.now();
      this.status = 'live';
      // AISStream sends JSON inside binary frames (Blob) since late 2026; read them as text first.
      ws.addEventListener('message', (e) => void toText(e.data).then((t) => this.onUpstream(t)));
      ws.addEventListener('close', (e) => { this.lastClose = `${e.code} ${String(e.reason).slice(0, 120)}`; log('ais.closed', { code: e.code, reason: String(e.reason).slice(0, 120) }); this.dropUpstream('closed'); });
      ws.addEventListener('error', () => this.dropUpstream('error'));
      log('ais.connected', {});
    } catch (e) {
      this.status = 'error';
      this.lastError = e instanceof Error ? e.name : 'error';
      this.upstream = null;
    }
  }

  private dropUpstream(why: string) {
    this.upstream = null;
    if (this.status === 'live') this.status = why === 'closed' ? 'idle' : 'error';
    log('ais.dropped', { why });
  }

  private onUpstream(text: string) {
    this.frames++;
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      // Not JSON: AISStream sends some errors as plain text. Keep it for diagnostics and surface it.
      this.lastRaw = text.slice(0, 300);
      this.status = 'error';
      this.lastError = text.slice(0, 120);
      log('ais.nonjson', { text: text.slice(0, 120) });
      return;
    }
    const r = raw as { MessageType?: string; Message?: { SubscriptionConfirmation?: { CompressionEnabled?: boolean } }; error?: string };
    if (r.error) {
      this.status = 'error';
      this.lastError = `AISStream: ${String(r.error).slice(0, 120)}`;
      this.lastRaw = text.slice(0, 300);
      log('ais.error', { error: String(r.error).slice(0, 120) });
      return;
    }
    if (!r.MessageType) this.lastRaw = text.slice(0, 300);
    if (r.MessageType === 'SubscriptionConfirmation') {
      this.compression = Boolean(r.Message?.SubscriptionConfirmation?.CompressionEnabled);
      return;
    }
    this.msgCount++;
    const now = Date.now();
    const v = applyMessage(this.vessels, raw as never, now);
    if (v) {
      this.changed.set(v.mmsi, now);
      if (r.MessageType === 'ShipStaticData') this.staticAt.set(v.mmsi, now);
    }
    if (v && Number.isFinite(v.lat)) {
      const cat = category(v);
      if (cat === 'tanker' || cat === 'lng_lpg') {
        const z = zoneOf(v.lat, v.lon);
        if (z) this.zones.observe(z.id, v.mmsi, now);
      }
    }
    if (this.vessels.size > MAX_VESSELS) {
      // Evict the stalest tenth.
      const sorted = [...this.vessels.values()].sort((a, b) => a.t - b.t).slice(0, MAX_VESSELS / 10);
      for (const s of sorted) {
        this.vessels.delete(s.mmsi);
        this.changed.delete(s.mmsi);
        this.staticAt.delete(s.mmsi);
      }
    }
  }

  private ensureTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), PUSH_MS);
  }

  private wanted(c: Client, v: Vessel): boolean {
    if (!Number.isFinite(v.lat)) return false;
    const cat = category(v);
    if (c.view.kind === 'all') {
      const b = c.view.bbox;
      return !b || (v.lat >= b[0] && v.lat <= b[2] && (b[1] <= b[3] ? v.lon >= b[1] && v.lon <= b[3] : v.lon >= b[1] || v.lon <= b[3]));
    }
    if (cat !== 'tanker' && cat !== 'lng_lpg') return false;
    return c.view.kind === 'tankers' || zoneOf(v.lat, v.lon) !== null;
  }

  private async tick() {
    const now = Date.now();
    if (!this.clients.size) {
      this.idleSince ||= now;
      if (now - this.idleSince > IDLE_CLOSE_MS) {
        this.upstream?.close(1000, 'idle');
        this.upstream = null;
        this.status = 'idle';
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        await this.saveSnapshot(now);
      }
      return;
    }
    this.idleSince = 0;
    if (!this.upstream && this.status !== 'connecting' && this.status !== 'no-key') void this.ensureUpstream();
    const counts = this.zones.counts(now);
    const dark = darkShips(this.vessels.values(), now, this.upSince).slice(0, 50);
    for (const c of this.clients) {
      const since = c.sentAt;
      const updates = [];
      const statics: Record<number, { n?: string; d?: string; dr?: number; i?: number; cs?: string }> = {};
      let n = 0;
      for (const v of this.vessels.values()) {
        if (since !== 0 && (this.changed.get(v.mmsi) ?? 0) <= since) continue;
        if (!this.wanted(c, v)) continue;
        updates.push(pack(v));
        const st = this.staticAt.get(v.mmsi) ?? 0;
        if (c.knownStatic.get(v.mmsi) !== st && (v.name || v.dest)) {
          statics[v.mmsi] = { n: v.name, d: v.dest, dr: v.draught, i: v.imo, cs: v.callsign };
          c.knownStatic.set(v.mmsi, st);
        }
        if (++n >= 20_000) break;
      }
      c.sentAt = now;
      try {
        c.ws.send(
          JSON.stringify({
            type: since === 0 ? 'full' : 'delta',
            at: now,
            status: this.status,
            compression: this.compression,
            upSince: this.upSince,
            msgs: this.msgCount,
            vessels: updates,
            statics,
            zones: counts,
            dark: c.view.kind === 'all' ? [] : dark.map((d) => ({ mmsi: d.mmsi, name: d.name ?? '', zone: d.zone, silentMin: d.silentMin, lat: d.lat, lon: d.lon })),
            error: this.status === 'error' ? this.lastError : undefined,
          }),
        );
      } catch {
        this.clients.delete(c);
      }
    }
    if (now - this.lastSnapshot > SNAPSHOT_MS) await this.saveSnapshot(now);
  }

  /** One storage write every 10 minutes: tankers only, for the "snapshot, not live" mode. */
  private async saveSnapshot(now: number) {
    if (this.status !== 'live' && this.vessels.size === 0) return;
    this.lastSnapshot = now;
    const tankers = [...this.vessels.values()].filter((v) => Number.isFinite(v.lat) && (category(v) === 'tanker' || category(v) === 'lng_lpg')).slice(0, 15_000);
    await this.ctx.storage.put(
      'snapshot',
      JSON.stringify({
        at: now,
        source: 'relay',
        vessels: tankers.map(pack),
        statics: Object.fromEntries(tankers.map((v) => [v.mmsi, { n: v.name, d: v.dest, dr: v.draught, i: v.imo, cs: v.callsign }])),
        zones: this.zones.counts(now),
        zoneNames: Object.fromEntries(CHOKEPOINTS.map((z) => [z.id, z.name])),
      }),
    );
  }
}
