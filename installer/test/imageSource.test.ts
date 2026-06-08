import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifySha256 } from '../src/main/imageSource.js';

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
