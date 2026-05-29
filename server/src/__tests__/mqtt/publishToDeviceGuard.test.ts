import { describe, it, expect, beforeEach } from 'vitest';
import {
  isGoToChargeBlocked, markFrameUnvalidated, clearFrameUnvalidated,
} from '../../services/frameValidation.js';

const SN = 'LFIN_GUARD_0001';

describe('isGoToChargeBlocked (publishToDevice guard predicate)', () => {
  beforeEach(() => { clearFrameUnvalidated(SN); });

  it('blocks go_to_charge while frame unvalidated', () => {
    markFrameUnvalidated(SN);
    expect(isGoToChargeBlocked(SN, { go_to_charge: {} })).toBe(true);
  });

  it('does not block go_to_charge when frame is validated', () => {
    expect(isGoToChargeBlocked(SN, { go_to_charge: {} })).toBe(false);
  });

  it('allows auto_recharge while frame unvalidated', () => {
    markFrameUnvalidated(SN);
    expect(isGoToChargeBlocked(SN, { auto_recharge: { cmd_num: 1 } })).toBe(false);
  });

  it('allows go_pile while frame unvalidated', () => {
    markFrameUnvalidated(SN);
    expect(isGoToChargeBlocked(SN, { go_pile: {} })).toBe(false);
  });
});
