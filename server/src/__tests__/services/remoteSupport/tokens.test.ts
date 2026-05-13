import { describe, it, expect } from 'vitest';
import { signAgentToken, verifyAgentToken } from '../../../services/remoteSupport/tokens.js';

const SECRET = 'unit-test-secret-32-chars-long!!';

describe('agent token signing', () => {
  it('round-trips a valid SN', () => {
    const token = signAgentToken('LFIN2231000656', SECRET);
    const result = verifyAgentToken(token, SECRET);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sn).toBe('LFIN2231000656');
  });

  it('rejects token signed with a different secret', () => {
    const token = signAgentToken('LFIN2231000656', SECRET);
    const result = verifyAgentToken(token, 'wrong-secret');
    expect(result.ok).toBe(false);
  });

  it('rejects tampered SN', () => {
    const token = signAgentToken('LFIN2231000656', SECRET);
    const tampered = token.replace('LFIN2231000656', 'LFIN9999999999');
    const result = verifyAgentToken(tampered, SECRET);
    expect(result.ok).toBe(false);
  });

  it('rejects expired tokens', () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    const token = signAgentToken('LFIN2231000656', SECRET, past);
    const result = verifyAgentToken(token, SECRET);
    expect(result.ok).toBe(false);
  });
});
