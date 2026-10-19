// AIS logic shared by the proxy relay and the app (section 14). Pure, tested.

export interface Vessel {
  mmsi: number;
  lat: number;
  lon: number;
  sog: number | null; // knots
  cog: number | null; // degrees
  hdg: number | null; // degrees, null when 511 (not available)
  t: number; // last position time, ms
  name?: string;
  type?: number; // AIS ship type code
  dest?: string;
  draught?: number;
  imo?: number;
  callsign?: string;
}

/** AIS ship type 80 to 89 = tankers; 70 to 79 = cargo (14.1). AIS does not say crude vs products. */
export type Category = 'tanker' | 'lng_lpg' | 'cargo' | 'other';

export function category(v: Pick<Vessel, 'type' | 'name'>): Category {
  const t = v.type ?? 0;
  const gas = /\b(LNG|LPG|GAS)\b/i.test(v.name ?? '');
  if (t >= 80 && t <= 89) return gas ? 'lng_lpg' : 'tanker';
  if (gas && t >= 70 && t <= 89) return 'lng_lpg';
  if (t >= 70 && t <= 79) return 'cargo';
  return 'other';
}

interface Raw {
  MessageType?: string;
  MetaData?: { MMSI?: number; ShipName?: string; latitude?: number; longitude?: number; Latitude?: number; Longitude?: number; time_utc?: string };
  Message?: Record<string, Record<string, unknown>>;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Applies one AISStream message to the vessel map. Returns the touched vessel or null. */
export function applyMessage(vessels: Map<number, Vessel>, raw: Raw, now: number): Vessel | null {
  const mmsi = raw.MetaData?.MMSI;
  if (!mmsi || !raw.MessageType || !raw.Message) return null;
  const body = raw.Message[raw.MessageType];
  if (!body) return null;
  let v = vessels.get(mmsi);
  if (raw.MessageType === 'PositionReport' || raw.MessageType === 'StandardClassBPositionReport') {
    const lat = num(body.Latitude);
    const lon = num(body.Longitude);
    if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    const hdg = num(body.TrueHeading);
    const sog = num(body.Sog);
    const cog = num(body.Cog);
    v = { ...(v ?? { mmsi }), mmsi, lat, lon, sog: sog != null && sog < 102.3 ? sog : null, cog: cog != null && cog < 360 ? cog : null, hdg: hdg != null && hdg < 360 ? hdg : null, t: now };
    const name = raw.MetaData?.ShipName?.trim();
    if (name && !v.name) v.name = name;
    vessels.set(mmsi, v);
    return v;
  }
  if (raw.MessageType === 'ShipStaticData') {
    const base: Vessel = v ?? { mmsi, lat: NaN, lon: NaN, sog: null, cog: null, hdg: null, t: 0 };
    const name = typeof body.Name === 'string' ? body.Name.replace(/@+$/, '').trim() : base.name;
    const dest = typeof body.Destination === 'string' ? body.Destination.replace(/@+$/, '').trim() : base.dest;
    v = {
      ...base,
      name: name || base.name,
      type: num(body.Type) ?? base.type,
      dest: dest || undefined,
      draught: num(body.MaximumStaticDraught) ?? base.draught,
      imo: num(body.ImoNumber) || base.imo,
      callsign: typeof body.CallSign === 'string' ? body.CallSign.trim() || base.callsign : base.callsign,
    };
    vessels.set(mmsi, v);
    return v;
  }
  return null;
}

export interface Zone {
  id: string;
  name: string;
  /** [south, west, north, east] */
  box: [number, number, number, number];
  /** Name in IMF PortWatch, when it covers this chokepoint. */
  portwatch?: string;
}

// Approximate boxes around each chokepoint (14.5). Coarse on purpose: counts are indicative.
export const CHOKEPOINTS: Zone[] = [
  { id: 'hormuz', name: 'Strait of Hormuz', box: [25.6, 55.6, 27.2, 57.2], portwatch: 'Strait of Hormuz' },
  { id: 'suez', name: 'Suez Canal', box: [29.8, 32.2, 31.4, 32.7], portwatch: 'Suez Canal' },
  { id: 'babelmandeb', name: 'Bab el-Mandeb', box: [12.3, 42.9, 13.2, 43.7], portwatch: 'Bab el-Mandeb Strait' },
  { id: 'malacca', name: 'Strait of Malacca', box: [1.0, 102.5, 3.5, 104.5], portwatch: 'Malacca Strait' },
  { id: 'panama', name: 'Panama Canal', box: [8.8, -80.1, 9.5, -79.4], portwatch: 'Panama Canal' },
  { id: 'bosporus', name: 'Turkish Straits (Bosporus)', box: [40.95, 28.9, 41.3, 29.2], portwatch: 'Bosporus Strait' },
  { id: 'danish', name: 'Danish Straits (Oresund)', box: [55.4, 12.4, 56.2, 13.0], portwatch: 'Oresund Strait' },
  { id: 'gibraltar', name: 'Strait of Gibraltar', box: [35.8, -6.0, 36.2, -5.2], portwatch: 'Gibraltar Strait' },
  { id: 'goodhope', name: 'Cape of Good Hope', box: [-35.5, 17.5, -33.8, 20.5], portwatch: 'Cape of Good Hope' },
  { id: 'channel', name: 'English Channel (Dover)', box: [50.8, 1.2, 51.3, 1.9], portwatch: 'Dover Strait' },
  { id: 'taiwan', name: 'Taiwan Strait', box: [23.0, 118.8, 25.2, 120.6], portwatch: 'Taiwan Strait' },
  { id: 'lombok', name: 'Lombok Strait', box: [-8.9, 115.6, -8.3, 116.0], portwatch: 'Lombok Strait' },
  { id: 'sunda', name: 'Sunda Strait', box: [-6.3, 105.5, -5.7, 106.0], portwatch: 'Sunda Strait' },
];

export function inBox(lat: number, lon: number, b: Zone['box']): boolean {
  return lat >= b[0] && lat <= b[2] && lon >= b[1] && lon <= b[3];
}

export function zoneOf(lat: number, lon: number): Zone | null {
  return CHOKEPOINTS.find((z) => inBox(lat, lon, z.box)) ?? null;
}

/**
 * Rolling 24 h count of distinct tankers seen inside each chokepoint box. Each (zone, vessel)
 * counts once per 24 h, so a ship anchored in the box is not counted again and again.
 */
export class ZoneCounter {
  private seen = new Map<string, number>(); // `${zone}:${mmsi}` -> first seen ms

  observe(zone: string, mmsi: number, now: number): void {
    const k = `${zone}:${mmsi}`;
    const t = this.seen.get(k);
    if (t == null || now - t > 86_400_000) this.seen.set(k, now);
  }

  counts(now: number): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, t] of this.seen) {
      if (now - t > 86_400_000) {
        this.seen.delete(k);
        continue;
      }
      const z = k.slice(0, k.indexOf(':'));
      out[z] = (out[z] ?? 0) + 1;
    }
    return out;
  }
}

/**
 * Dark ships (14.6): tankers last seen inside a monitored zone that have been silent for more
 * than `gapMs`, counted only if the relay itself has been connected long enough to notice.
 */
export function darkShips(vessels: Iterable<Vessel>, now: number, relayUpSince: number, gapMs = 60 * 60_000): (Vessel & { zone: string; silentMin: number })[] {
  if (now - relayUpSince < gapMs) return [];
  const out: (Vessel & { zone: string; silentMin: number })[] = [];
  for (const v of vessels) {
    if (category(v) === 'other' || category(v) === 'cargo') continue;
    if (!Number.isFinite(v.lat) || v.t < relayUpSince) continue;
    const z = zoneOf(v.lat, v.lon);
    if (z && now - v.t > gapMs) out.push({ ...v, zone: z.name, silentMin: Math.round((now - v.t) / 60_000) });
  }
  return out;
}

/** Compact wire format: [mmsi, lat, lon, sog, cog, hdg, type, tSec]. */
export type Packed = [number, number, number, number | null, number | null, number | null, number, number];
export const pack = (v: Vessel): Packed => [v.mmsi, Math.round(v.lat * 1e4) / 1e4, Math.round(v.lon * 1e4) / 1e4, v.sog, v.cog, v.hdg, v.type ?? 0, Math.round(v.t / 1000)];
