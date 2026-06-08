import { describe, it, expect } from 'vitest';
import { isSafeTarget } from '../src/main/drives.js';

const mk = (o: Partial<any>) => ({ isSystem: false, isRemovable: true, isReadOnly: false, size: 64e9, ...o });

describe('isSafeTarget', () => {
  it('accepts a normal removable 64GB card', () => expect(isSafeTarget(mk({}))).toBe(true));
  it('rejects system disk', () => expect(isSafeTarget(mk({ isSystem: true }))).toBe(false));
  it('rejects non-removable', () => expect(isSafeTarget(mk({ isRemovable: false }))).toBe(false));
  it('rejects too large (likely external drive)', () => expect(isSafeTarget(mk({ size: 1e12 }))).toBe(false));
  it('rejects too small', () => expect(isSafeTarget(mk({ size: 2e9 }))).toBe(false));
  it('rejects read-only', () => expect(isSafeTarget(mk({ isReadOnly: true }))).toBe(false));
  it('rejects unknown/zero size', () => expect(isSafeTarget(mk({ size: 0 }))).toBe(false));
  it('rejects missing flags safely (undefined removable -> not safe)', () => expect(isSafeTarget(mk({ isRemovable: undefined }))).toBe(false));
});
