import { describe, expect, it } from 'vitest';
import { applyMessage, category, darkShips, pack, ZoneCounter, zoneOf, type Vessel } from './ais';

const pos = (mmsi: number, lat: number, lon: number, extra: Record<string, unknown> = {}) => ({
  MessageType: 'PositionReport',
  MetaData: { MMSI: mmsi, ShipName: 'NORDIC ACE   ' },
  Message: { PositionReport: { Latitude: lat, Longitude: lon, Sog: 12.3, Cog: 90.1, TrueHeading: 511, ...extra } },
});
const stat = (mmsi: number, type: number, name = 'GOLAR SPIRIT@@@') => ({
  MessageType: 'ShipStaticData',
  MetaData: { MMSI: mmsi },
  Message: { ShipStaticData: { Type: type, Name: name, Destination: 'ROTTERDAM@@', MaximumStaticDraught: 14.2, ImoNumber: 9123456, CallSign: 'ABCD ' } },
});

describe('ais', () => {
  it('merges position and static data', () => {
    const m = new Map<number, Vessel>();
    applyMessage(m, pos(1, 26, 56), 1000);
    applyMessage(m, stat(1, 84), 2000);
    expect(m.get(1)).toMatchObject({ lat: 26, lon: 56, sog: 12.3, hdg: null, name: 'GOLAR SPIRIT', dest: 'ROTTERDAM', type: 84, draught: 14.2, imo: 9123456, t: 1000 });
  });
  it('rejects bad positions and sentinel values', () => {
    const m = new Map<number, Vessel>();
    expect(applyMessage(m, pos(2, 91, 0), 1)).toBeNull();
    applyMessage(m, pos(3, 1, 1, { Sog: 102.3, Cog: 360 }), 1);
    expect(m.get(3)).toMatchObject({ sog: null, cog: null });
  });
  it('categorizes by AIS type with a gas-name heuristic', () => {
    expect(category({ type: 80 })).toBe('tanker');
    expect(category({ type: 84, name: 'ARCTIC LNG 2' })).toBe('lng_lpg');
    expect(category({ type: 70 })).toBe('cargo');
    expect(category({ type: 30 })).toBe('other');
  });
  it('finds chokepoints', () => {
    expect(zoneOf(26.5, 56.3)?.id).toBe('hormuz');
    expect(zoneOf(0, 0)).toBeNull();
  });
  it('counts each ship once per 24 h per zone', () => {
    const c = new ZoneCounter();
    c.observe('hormuz', 1, 0);
    c.observe('hormuz', 1, 1000);
    c.observe('hormuz', 2, 2000);
    expect(c.counts(3000)).toEqual({ hormuz: 2 });
    expect(c.counts(86_400_000 + 1500)).toEqual({ hormuz: 1 });
  });
  it('flags dark tankers only after the relay has watched long enough', () => {
    const v: Vessel = { mmsi: 9, lat: 26.5, lon: 56.3, sog: 0, cog: 0, hdg: 0, t: 10 * 60_000, type: 80 };
    expect(darkShips([v], 30 * 60_000, 0)).toHaveLength(0);
    expect(darkShips([v], 80 * 60_000, 0)[0]).toMatchObject({ zone: 'Strait of Hormuz', silentMin: 70 });
    expect(darkShips([{ ...v, type: 70 }], 80 * 60_000, 0)).toHaveLength(0);
  });
  it('packs compactly', () => {
    expect(pack({ mmsi: 1, lat: 1.123456, lon: 2.98765, sog: 1, cog: 2, hdg: null, t: 5000, type: 80 })).toEqual([1, 1.1235, 2.9877, 1, 2, null, 80, 5]);
  });
});
