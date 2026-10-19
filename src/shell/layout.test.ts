import { describe, expect, it } from 'vitest';
import { COLS, EMPTY_LAYOUT, findSlot, reduce, sanitizeLayout, type Action, type Layout } from './layout';

const run = (...actions: Action[]) => actions.reduce(reduce, EMPTY_LAYOUT as Layout);

describe('layout reducer', () => {
  it('opens frames in free slots without overlap', () => {
    const l = run(
      { type: 'open', code: 'GP', security: 'AAPL', size: { w: 24, h: 10 }, id: 'a' },
      { type: 'open', code: 'N', size: { w: 24, h: 10 }, newFrame: true, id: 'b' },
    );
    expect(l.frames).toHaveLength(2);
    expect(l.frames[0]).toMatchObject({ x: 0, y: 0 });
    expect(l.frames[1]).toMatchObject({ x: 24, y: 0 });
  });

  it('runs a command in the focused frame by default', () => {
    const l = run({ type: 'open', code: 'GP', security: 'AAPL', id: 'a' }, { type: 'open', code: 'DES', security: 'MSFT' });
    expect(l.frames).toHaveLength(1);
    expect(l.panels.a).toMatchObject({ code: 'DES', security: 'MSFT' });
  });

  it('does not replace a locked frame', () => {
    let l = run({ type: 'open', code: 'GP', id: 'a' });
    l = reduce(l, { type: 'toggle', frameId: l.frames[0]!.id, flag: 'locked' });
    l = reduce(l, { type: 'open', code: 'N' });
    expect(l.frames).toHaveLength(2);
    expect(l.panels.a?.code).toBe('GP');
  });

  it('snaps and clamps move and resize', () => {
    let l = run({ type: 'open', code: 'GP', size: { w: 10, h: 10 } });
    const id = l.frames[0]!.id;
    l = reduce(l, { type: 'move', frameId: id, x: 45.6, y: -3 });
    expect(l.frames[0]).toMatchObject({ x: COLS - 10, y: 0 });
    l = reduce(l, { type: 'resize', frameId: id, w: 1, h: 1 });
    expect(l.frames[0]).toMatchObject({ w: 6, h: 4 });
  });

  it('stacks panels as tabs and unstacks them', () => {
    let l = run({ type: 'open', code: 'GP', id: 'a' }, { type: 'open', code: 'N', newFrame: true, id: 'b' });
    const target = l.frames[0]!.id;
    l = reduce(l, { type: 'stack', panelId: 'b', targetFrameId: target });
    expect(l.frames).toHaveLength(1);
    expect(l.frames[0]).toMatchObject({ tabs: ['a', 'b'], active: 'b' });
    l = reduce(l, { type: 'unstack', panelId: 'a', id: 'f2' });
    expect(l.frames).toHaveLength(2);
  });

  it('closing the last tab removes the frame and refocuses', () => {
    let l = run({ type: 'open', code: 'GP', id: 'a' }, { type: 'open', code: 'N', newFrame: true, id: 'b' });
    l = reduce(l, { type: 'close', panelId: 'b' });
    expect(l.frames).toHaveLength(1);
    expect(l.focused).toBe(l.frames[0]!.id);
    expect(l.panels.b).toBeUndefined();
  });

  it('maximize is exclusive', () => {
    let l = run({ type: 'open', code: 'GP' }, { type: 'open', code: 'N', newFrame: true });
    const [f1, f2] = l.frames.map((f) => f.id) as [string, string];
    l = reduce(l, { type: 'toggle', frameId: f1, flag: 'maximized' });
    l = reduce(l, { type: 'toggle', frameId: f2, flag: 'maximized' });
    expect(l.frames.filter((f) => f.maximized).map((f) => f.id)).toEqual([f2]);
  });

  it('linked panels follow the same security', () => {
    let l = run(
      { type: 'open', code: 'GP', security: 'AAPL', id: 'a' },
      { type: 'open', code: 'CN', newFrame: true, id: 'b' },
      { type: 'open', code: 'N', newFrame: true, id: 'c' },
    );
    l = reduce(l, { type: 'setLink', panelId: 'a', link: 'red' });
    l = reduce(l, { type: 'setLink', panelId: 'b', link: 'red' });
    expect(l.panels.b?.security).toBe('AAPL');
    l = reduce(l, { type: 'setSecurity', panelId: 'a', security: 'NVDA' });
    expect(l.panels.b?.security).toBe('NVDA');
    expect(l.panels.c?.security).toBeUndefined();
  });

  it('duplicates into a new frame', () => {
    let l = run({ type: 'open', code: 'GP', security: 'AAPL', id: 'a' });
    l = reduce(l, { type: 'duplicate', panelId: 'a', id: 'a2' });
    expect(l.panels.a2).toMatchObject({ code: 'GP', security: 'AAPL' });
    expect(l.frames).toHaveLength(2);
  });

  it('findSlot falls below when the row is full', () => {
    expect(findSlot([{ id: 'f', x: 0, y: 0, w: COLS, h: 5, tabs: ['a'], active: 'a', minimized: false, maximized: false, locked: false, z: 1 }], 10, 5)).toEqual({ x: 0, y: 5 });
  });

  it('sanitizes stored layouts', () => {
    expect(sanitizeLayout(null)).toBeNull();
    const l = run({ type: 'open', code: 'GP', id: 'a' });
    const broken = { ...l, frames: [...l.frames, { ...l.frames[0]!, id: 'ghost', tabs: ['missing'] }] };
    expect(sanitizeLayout(broken)?.frames).toHaveLength(1);
  });
});

describe('maximized frames', () => {
  it('opening a new frame restores a maximized one so the new frame is visible', () => {
    let l = reduce(EMPTY_LAYOUT, { type: 'open', code: 'GP', security: 'AAPL', newFrame: true });
    const first = l.frames[0]!.id;
    l = reduce(l, { type: 'toggle', frameId: first, flag: 'maximized' });
    expect(l.frames[0]!.maximized).toBe(true);
    l = reduce(l, { type: 'open', code: 'SET', newFrame: true });
    expect(l.frames.every((f) => !f.maximized)).toBe(true);
    expect(l.focused).toBe(l.frames[1]!.id);
  });
});
