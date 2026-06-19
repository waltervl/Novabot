import { describe, expect, it } from 'vitest';
import { mowerDisplayName } from '../mowerDisplay';

describe('mowerDisplayName', () => {
  it('uses the nickname when set', () => {
    expect(mowerDisplayName({ sn: 'LFIN123', nickname: 'Maaier Ramon' })).toBe('Maaier Ramon');
  });
  it('falls back to the SN when nickname is empty/whitespace/null', () => {
    expect(mowerDisplayName({ sn: 'LFIN123', nickname: '   ' })).toBe('LFIN123');
    expect(mowerDisplayName({ sn: 'LFIN123', nickname: null })).toBe('LFIN123');
    expect(mowerDisplayName({ sn: 'LFIN123', nickname: undefined })).toBe('LFIN123');
  });
});
