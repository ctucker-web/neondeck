import { describe, expect, it } from 'vitest';
import { pickNext, readPad, type Box } from './spatial';

const box = (left: number, top: number, w = 100, h = 100): Box => ({
  left,
  top,
  right: left + w,
  bottom: top + h,
});
const c = (item: string, b: Box) => ({ item, box: b });

describe('pickNext', () => {
  const from = box(200, 200);

  it('moves to the nearest item in the pressed direction', () => {
    const cands = [c('near', box(320, 200)), c('far', box(440, 200)), c('left', box(80, 200))];
    expect(pickNext(from, cands, 'right')).toBe('near');
    expect(pickNext(from, cands, 'left')).toBe('left');
  });

  it('returns null when nothing lies in that direction', () => {
    expect(pickNext(from, [c('left', box(80, 200))], 'right')).toBeNull();
    expect(pickNext(from, [], 'up')).toBeNull();
  });

  it('prefers an aligned item over a closer diagonal one', () => {
    const cands = [c('diagonal', box(330, 310)), c('below', box(200, 400))];
    expect(pickNext(from, cands, 'down')).toBe('below');
  });

  it('does not drop diagonally off the end of a row', () => {
    expect(pickNext(from, [c('below-right', box(340, 380))], 'right')).toBeNull();
    expect(pickNext(from, [c('far-right', box(600, 320))], 'right')).toBe('far-right');
  });

  it('falls back to any target below when nothing is within the cone', () => {
    expect(pickNext(from, [c('far-left-below', box(-400, 320))], 'down')).toBe('far-left-below');
  });

  it('ignores items that overlap the current one on the travel axis', () => {
    // Same row, so it is not "below".
    expect(pickNext(from, [c('beside', box(320, 220))], 'down')).toBeNull();
  });

  it('reaches a side rail from any row', () => {
    const rail = c('rail', box(0, 0, 80, 1000));
    expect(pickNext(from, [rail, c('above', box(200, 80))], 'left')).toBe('rail');
  });

  it('picks the overlapping item when the row below is scrolled', () => {
    const cands = [c('a', box(-150, 320, 300, 100)), c('b', box(170, 320, 300, 100)), c('c', box(490, 320, 300, 100))];
    expect(pickNext(from, cands, 'down')).toBe('b');
  });
});

describe('readPad', () => {
  const none = Array<boolean>(16).fill(false);
  const press = (i: number) => none.map((_, n) => n === i);

  it('maps the D-pad, A, and B', () => {
    expect(readPad(press(12), [0, 0])).toBe('up');
    expect(readPad(press(15), [0, 0])).toBe('right');
    expect(readPad(press(0), [0, 0])).toBe('select');
    expect(readPad(press(1), [0, 0])).toBe('back');
  });
  it('maps the left stick past a dead zone', () => {
    expect(readPad(none, [0.2, -0.3])).toBeNull();
    expect(readPad(none, [-0.9, 0])).toBe('left');
    expect(readPad(none, [0, 0.8])).toBe('down');
  });
});
