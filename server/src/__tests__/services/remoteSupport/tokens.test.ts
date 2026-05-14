import { describe, it, expect } from 'vitest';
import { parseAgentQuery, encodeAgentQuery } from '../../../services/remoteSupport/tokens.js';

const VALID_TOKEN = 'a'.repeat(64);
const SN = 'LFIN2231000656';

describe('agent query credential', () => {
  it('round-trips encode → parse', () => {
    const url = '/api/remote-support/agent?' + encodeAgentQuery({ sn: SN, instanceToken: VALID_TOKEN });
    const result = parseAgentQuery(url);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cred.sn).toBe(SN);
      expect(result.cred.instanceToken).toBe(VALID_TOKEN);
    }
  });

  it('rejects missing sn', () => {
    const result = parseAgentQuery(`/api/remote-support/agent?token=${VALID_TOKEN}`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missing-sn');
  });

  it('rejects missing token', () => {
    const result = parseAgentQuery(`/api/remote-support/agent?sn=${SN}`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missing-token');
  });

  it('rejects non-hex token', () => {
    const result = parseAgentQuery(`/api/remote-support/agent?sn=${SN}&token=not-hex-XYZ`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed-token');
  });

  it('rejects short token', () => {
    const result = parseAgentQuery(`/api/remote-support/agent?sn=${SN}&token=abc`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed-token');
  });
});
