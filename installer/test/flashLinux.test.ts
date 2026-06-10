import { describe, it, expect } from 'vitest';
import { parseDdBytes } from '../src/main/flashLinux.js';

describe('parseDdBytes (GNU dd status=progress)', () => {
  it('returns null before any progress line', () => {
    expect(parseDdBytes('')).toBeNull();
    expect(parseDdBytes('0+0 records in\n')).toBeNull();
  });

  it('parses a dd progress line', () => {
    const text = '1234567890 bytes (1.2 GB, 1.1 GiB) copied, 5 s, 247 MB/s';
    expect(parseDdBytes(text)).toBe(1234567890);
  });

  it('returns the latest value as dd overwrites the line', () => {
    const text = [
      '524288000 bytes (524 MB, 500 MiB) copied, 2 s, 262 MB/s',
      '1572864000 bytes (1.6 GB, 1.5 GiB) copied, 6 s, 262 MB/s',
      '3221225472 bytes (3.2 GB, 3.0 GiB) copied, 12 s, 268 MB/s',
    ].join('\r');
    expect(parseDdBytes(text)).toBe(3221225472);
  });
});
