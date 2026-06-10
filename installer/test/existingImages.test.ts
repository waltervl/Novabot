import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listExistingImages } from '../src/main/ipc.js';

describe('listExistingImages', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'opennova-test-'));
    // Two valid images with different mtimes + some files that must be ignored.
    await writeFile(join(dir, 'opennova-old.img'), 'x');
    await writeFile(join(dir, 'opennova-new.img'), 'xx');
    await writeFile(join(dir, 'raspios.img'), 'x'); // wrong prefix
    await writeFile(join(dir, 'opennova-notes.txt'), 'x'); // wrong extension
    // Make "old" older than "new".
    const old = new Date(Date.now() - 60_000);
    await utimes(join(dir, 'opennova-old.img'), old, old);
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns only opennova-*.img files, newest first', async () => {
    const found = await listExistingImages(dir);
    expect(found.map((f) => f.name)).toEqual(['opennova-new.img', 'opennova-old.img']);
    expect(found[0].size).toBe(2);
    expect(found[0].path).toBe(join(dir, 'opennova-new.img'));
  });

  it('returns an empty list for a missing directory', async () => {
    const found = await listExistingImages(join(dir, 'does-not-exist'));
    expect(found).toEqual([]);
  });
});
