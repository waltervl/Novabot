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

  // Boundary lock-in: a future flip of <= / >= to < / > must fail a test.
  it('accepts exactly the lower bound (4GB)', () => expect(isSafeTarget(mk({ size: 4e9 }))).toBe(true));
  it('accepts exactly the upper bound (512GB)', () => expect(isSafeTarget(mk({ size: 512e9 }))).toBe(true));
  it('rejects just below the lower bound', () => expect(isSafeTarget(mk({ size: 4e9 - 1 }))).toBe(false));
  it('rejects just above the upper bound', () => expect(isSafeTarget(mk({ size: 512e9 + 1 }))).toBe(false));

  // Adversarial inputs: non-boolean truthy / non-finite must not slip through.
  it('rejects NaN / Infinity / negative size', () => {
    expect(isSafeTarget(mk({ size: NaN }))).toBe(false);
    expect(isSafeTarget(mk({ size: Infinity }))).toBe(false);
    expect(isSafeTarget(mk({ size: -64e9 }))).toBe(false);
  });
  it('rejects non-boolean truthy flags (1 / "true")', () => {
    expect(isSafeTarget(mk({ isRemovable: 1 }))).toBe(false);
    expect(isSafeTarget(mk({ isSystem: 'false' }))).toBe(false);
  });
  it('rejects undefined isSystem and undefined isReadOnly (default-deny)', () => {
    expect(isSafeTarget(mk({ isSystem: undefined }))).toBe(false);
    expect(isSafeTarget(mk({ isReadOnly: undefined }))).toBe(false);
  });
});
