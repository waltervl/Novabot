import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifySha256, parseSha256Sidecar } from '../src/main/imageSource.js';

describe('verifySha256', () => {
  let dir: string;
  let filePath: string;
  let expected: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'opennova-imgsrc-'));
    filePath = join(dir, 'sample.bin');
    const content = 'hello';
    writeFileSync(filePath, content);
    expected = createHash('sha256').update(content).digest('hex');
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('resolves true when the hash matches', async () => {
    await expect(verifySha256(filePath, expected)).resolves.toBe(true);
  });

  it('matches case-insensitively (uppercase expected hash)', async () => {
    await expect(verifySha256(filePath, expected.toUpperCase())).resolves.toBe(true);
  });

  it('resolves false when the hash does not match', async () => {
    await expect(verifySha256(filePath, 'deadbeef')).resolves.toBe(false);
  });
});

describe('parseSha256Sidecar', () => {
  const hex = 'a'.repeat(64);

  it('extracts the digest from sha256sum-style "<hex>  <filename>"', () => {
    expect(parseSha256Sidecar(`${hex}  2026-04-21-raspios-trixie-arm64-lite.img.xz`)).toBe(hex);
  });

  it('extracts a bare digest with trailing whitespace/newline', () => {
    expect(parseSha256Sidecar(`${hex}\n`)).toBe(hex);
  });

  it('lowercases the digest', () => {
    expect(parseSha256Sidecar('A'.repeat(64))).toBe(hex);
  });

  it('throws on an empty sidecar (must not silently disable verification)', () => {
    expect(() => parseSha256Sidecar('')).toThrow(/Malformed sha256 sidecar/);
  });

  it('throws when the first token is not 64 hex chars', () => {
    expect(() => parseSha256Sidecar('deadbeef  file.img.xz')).toThrow(/Malformed sha256 sidecar/);
    expect(() => parseSha256Sidecar(`${'z'.repeat(64)}  file`)).toThrow(/Malformed sha256 sidecar/);
  });
});
