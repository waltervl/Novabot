import { describe, it, expect, beforeEach } from 'vitest';
import {
  isFrameNavBlocked, markFrameUnvalidated, clearFrameUnvalidated,
} from '../../services/frameValidation.js';

const SN = 'LFIN_GUARD_0001';

describe('isFrameNavBlocked (publishToDevice guard predicate)', () => {
  beforeEach(() => { clearFrameUnvalidated(SN); });

  it('blocks frame-nav commands while frame unvalidated', () => {
    markFrameUnvalidated(SN);
    expect(isFrameNavBlocked(SN, { go_to_charge: {} })).toBe(true);
    expect(isFrameNavBlocked(SN, { start_navigation: { area: 1 } })).toBe(true);
    expect(isFrameNavBlocked(SN, { start_run: { area: 1 } })).toBe(true);
  });

  it('does not block when the frame is validated', () => {
    expect(isFrameNavBlocked(SN, { go_to_charge: {} })).toBe(false);
    expect(isFrameNavBlocked(SN, { start_navigation: {} })).toBe(false);
  });

  it('allows auto_recharge and go_pile even while unvalidated', () => {
    markFrameUnvalidated(SN);
    expect(isFrameNavBlocked(SN, { auto_recharge: { cmd_num: 1 } })).toBe(false);
    expect(isFrameNavBlocked(SN, { go_pile: {} })).toBe(false);
  });
});
