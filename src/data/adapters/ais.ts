// Client for the proxy's AIS relay (section 14). Live WebSocket with a signed ticket, auto
// reconnect with backoff, and the stored snapshot as a fallback when live is not available.
import type { Packed } from '../../../shared/ais';
import { PROXY_URL } from '../../config';
import { api } from '../../lib/api';
import { report } from '../health';
import { up, type Fetched } from '../client';

export interface StaticInfo { n?: string; d?: string; dr?: number; i?: number; cs?: string }
export interface AisFrame {
  type: 'full' | 'delta';
  at: number;
  status: 'idle' | 'connecting' | 'live' | 'error' | 'no-key' | 'budget';
  /** Upstream messages today (UTC) and the relay's daily cap. */
  today?: number;
  budget?: number;
  compression: boolean | null;
  upSince: number;
  msgs: number;
  vessels: Packed[];
  statics: Record<string, StaticInfo>;
  zones: Record<string, number>;
  dark: { mmsi: number; name: string; zone: string; silentMin: number; lat: number; lon: number }[];
  error?: string;
}

export type ViewMsg = { view: 'tankers' | 'chokepoints' | 'all'; bbox?: [number, number, number, number] };

export function connectAis(initial: ViewMsg, onFrame: (f: AisFrame) => void, onState: (s: 'connecting' | 'open' | 'closed') => void) {
  let ws: WebSocket | null = null;
  let view = initial;
  let stopped = false;
  let tries = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const open = async () => {
    if (stopped) return;
    onState('connecting');
    try {
      const { ticket } = await api<{ ticket: string }>('/api/ais/ticket');
      const base = PROXY_URL.replace(/^http/, 'ws').replace(/\/$/, '');
      ws = new WebSocket(`${base}/api/ais/ws?ticket=${encodeURIComponent(ticket)}`);
      ws.onopen = () => {
        tries = 0;
        onState('open');
        ws?.send(JSON.stringify({ type: 'view', ...view }));
      };
      ws.onmessage = (e) => {
        try {
          const f = JSON.parse(String(e.data)) as AisFrame;
          onFrame(f);
          report('aisstream', { ok: f.status === 'live', error: f.status === 'live' ? undefined : f.error ?? f.status });
        } catch {
          // ignore
        }
      };
      ws.onclose = () => {
        onState('closed');
        retry();
      };
      ws.onerror = () => ws?.close();
    } catch {
      onState('closed');
      retry();
    }
  };
  const retry = () => {
    if (stopped) return;
    tries++;
    timer = setTimeout(() => void open(), Math.min(60_000, 2000 * 2 ** tries));
  };
  void open();
  return {
    setView(v: ViewMsg) {
      view = v;
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'view', ...v }));
    },
    close() {
      stopped = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    },
  };
}

export const snapshot = () => api<Partial<AisFrame> & { at: number; source: string; vessels: Packed[] }>('/api/ais/snapshot');

export interface PortWatchRow { date: string; portname: string; n_tanker: number; n_total: number }

/** IMF PortWatch daily transits for the last `days`. Official, keyless, lags about a week. */
export async function portwatch(days = 45): Promise<Fetched<PortWatchRow[]>> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const r = await up<{ features: { attributes: PortWatchRow }[] }>(
    'portwatch',
    '/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query',
    { where: `date >= DATE '${since}'`, outFields: 'date,portname,n_tanker,n_total', orderByFields: 'date DESC', resultRecordCount: 2000, f: 'json' },
    { maxAgeMs: 6 * 3600_000, priority: 2 },
  );
  return { ...r, data: (r.data.features ?? []).map((f) => f.attributes) };
}

// Flag state from the MMSI's first three digits (Maritime Identification Digits, ITU). Partial list.
const MID: Record<string, string> = {
  '201': 'Albania', '205': 'Belgium', '209': 'Cyprus', '210': 'Cyprus', '212': 'Cyprus', '211': 'Germany', '218': 'Germany', '219': 'Denmark', '220': 'Denmark', '224': 'Spain', '225': 'Spain',
  '226': 'France', '227': 'France', '228': 'France', '229': 'Malta', '215': 'Malta', '248': 'Malta', '249': 'Malta', '256': 'Malta', '230': 'Finland', '231': 'Faroe Islands', '232': 'United Kingdom', '233': 'United Kingdom', '234': 'United Kingdom', '235': 'United Kingdom',
  '236': 'Gibraltar', '237': 'Greece', '239': 'Greece', '240': 'Greece', '241': 'Greece', '244': 'Netherlands', '245': 'Netherlands', '246': 'Netherlands', '247': 'Italy', '250': 'Ireland', '257': 'Norway', '258': 'Norway', '259': 'Norway',
  '261': 'Poland', '265': 'Sweden', '266': 'Sweden', '271': 'Turkiye', '273': 'Russia', '304': 'Antigua and Barbuda', '305': 'Antigua and Barbuda', '308': 'Bahamas', '309': 'Bahamas', '311': 'Bahamas', '310': 'Bermuda', '316': 'Canada',
  '319': 'Cayman Islands', '338': 'United States', '366': 'United States', '367': 'United States', '368': 'United States', '369': 'United States', '351': 'Panama', '352': 'Panama', '353': 'Panama', '354': 'Panama', '355': 'Panama', '356': 'Panama', '357': 'Panama',
  '370': 'Panama', '371': 'Panama', '372': 'Panama', '373': 'Panama', '374': 'Panama', '412': 'China', '413': 'China', '414': 'China', '416': 'Taiwan', '419': 'India', '422': 'Iran', '431': 'Japan', '432': 'Japan', '440': 'South Korea', '441': 'South Korea',
  '445': 'North Korea', '447': 'Kuwait', '461': 'Oman', '466': 'Qatar', '470': 'UAE', '471': 'UAE', '403': 'Saudi Arabia', '477': 'Hong Kong', '503': 'Australia', '525': 'Indonesia', '533': 'Malaysia', '538': 'Marshall Islands', '548': 'Philippines',
  '563': 'Singapore', '564': 'Singapore', '565': 'Singapore', '566': 'Singapore', '567': 'Thailand', '574': 'Vietnam', '577': 'Vanuatu', '620': 'Comoros', '636': 'Liberia', '637': 'Liberia', '657': 'Nigeria', '667': 'Sierra Leone', '677': 'Tanzania', '710': 'Brazil', '725': 'Chile', '775': 'Venezuela',
};
export const flagOf = (mmsi: number) => MID[String(mmsi).slice(0, 3)] ?? 'Unknown';
