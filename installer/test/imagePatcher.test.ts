import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readBootPartitionOffset } from '../src/main/imagePatcher.js';

/**
 * Build a 512-byte MBR with one partition entry. `type` is the partition type
 * byte, `lbaStart`/`sectors` the little-endian u32 fields, and `sig` toggles the
 * 0x55AA boot signature.
 */
function mkMbr(opts: { type: number; lbaStart: number; sectors: number; sig?: boolean }): Buffer {
  const mbr = Buffer.alloc(512);
  const base = 446; // first partition entry
  mbr[base + 4] = opts.type;
  mbr.writeUInt32LE(opts.lbaStart, base + 8);
  mbr.writeUInt32LE(opts.sectors, base + 12);
  if (opts.sig !== false) {
    mbr[510] = 0x55;
    mbr[511] = 0xaa;
  }
  return mbr;
}

describe('readBootPartitionOffset', () => {
  let dir: string;
  const write = (name: string, buf: Buffer): string => {
    const p = join(dir, name);
    writeFileSync(p, buf);
    return p;
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'opennova-mbr-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns the byte offset of a FAT32 (0x0c) partition', () => {
    // The real Pi image: boot partition starts at LBA 16384 -> 8388608 bytes.
    const p = write('fat32.img', mkMbr({ type: 0x0c, lbaStart: 16384, sectors: 1048576 }));
    expect(readBootPartitionOffset(p)).toBe(16384 * 512);
  });

  it('accepts other FAT type bytes (0x0b)', () => {
    const p = write('fat0b.img', mkMbr({ type: 0x0b, lbaStart: 2048, sectors: 100000 }));
    expect(readBootPartitionOffset(p)).toBe(2048 * 512);
  });

  it('throws when the MBR boot signature is missing', () => {
    const p = write('nosig.img', mkMbr({ type: 0x0c, lbaStart: 16384, sectors: 1048576, sig: false }));
    expect(() => readBootPartitionOffset(p)).toThrow(/boot signature/i);
  });

  it('throws when there is no FAT partition (e.g. only a Linux 0x83 entry)', () => {
    const p = write('nofat.img', mkMbr({ type: 0x83, lbaStart: 16384, sectors: 1048576 }));
    expect(() => readBootPartitionOffset(p)).toThrow(/no FAT boot partition/i);
  });

  it('ignores a FAT-typed entry with zero sectors', () => {
    const p = write('zerosec.img', mkMbr({ type: 0x0c, lbaStart: 16384, sectors: 0 }));
    expect(() => readBootPartitionOffset(p)).toThrow(/no FAT boot partition/i);
  });
});
