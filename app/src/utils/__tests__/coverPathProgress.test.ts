import { describe, expect, it } from 'vitest';
import { parseFinishedAreas, prefixedAreaId, parseCoveringPoints } from '../coverPathProgress';

describe('parseFinishedAreas', () => {
  it('splits the space-separated list and emits both prefixed and bare ids', () => {
    expect(parseFinishedAreas(' 0 1 2 ', '1')).toEqual(['1_0', '0', '1_1', '1', '1_2', '2']);
  });
  it('returns bare ids when no mapId is given', () => {
    expect(parseFinishedAreas('0 1', undefined)).toEqual(['0', '1']);
  });
  it('returns undefined for empty/missing input', () => {
    expect(parseFinishedAreas(undefined, '1')).toBeUndefined();
    expect(parseFinishedAreas('', '1')).toBeUndefined();
  });
});

describe('prefixedAreaId', () => {
  it('prefixes with the map id', () => {
    expect(prefixedAreaId('14', '1')).toBe('1_14');
  });
  it('returns the raw id when no map id', () => {
    expect(prefixedAreaId('14', undefined)).toBe('14');
    expect(prefixedAreaId('14', '')).toBe('14');
  });
  it('returns undefined when raw is missing', () => {
    expect(prefixedAreaId(undefined, '1')).toBeUndefined();
  });
});

describe('parseCoveringPoints', () => {
  it('parses comma-separated "x y" pairs into points', () => {
    expect(parseCoveringPoints('2.48 -1.62,2.49 -1.63')).toEqual([
      { x: 2.48, y: -1.62 },
      { x: 2.49, y: -1.63 },
    ]);
  });
  it('skips malformed chunks', () => {
    expect(parseCoveringPoints('1 2,garbage,3 4')).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
  });
  it('returns undefined when nothing parses', () => {
    expect(parseCoveringPoints('')).toBeUndefined();
    expect(parseCoveringPoints('nope')).toBeUndefined();
  });
});
