// Test-only helper: parse a P5 (binary) PGM and diff two PGMs, reporting the
// first divergent pixel + region. Handles the ROS map_saver header which
// includes a `# CREATOR: ...` comment line between the magic and the dims.
export interface Pgm { width: number; height: number; max: number; data: Buffer; }

export function parsePgm(buf: Buffer): Pgm {
  if (buf.subarray(0, 2).toString('ascii') !== 'P5') throw new Error('not a P5 PGM');
  let i = 2;
  const tok: number[] = [];
  while (tok.length < 3) {
    while (i < buf.length && /\s/.test(String.fromCharCode(buf[i]))) i++;
    if (buf[i] === 0x23) { while (i < buf.length && buf[i] !== 0x0a) i++; continue; } // comment line
    let n = 0; let seen = false;
    while (i < buf.length && buf[i] >= 0x30 && buf[i] <= 0x39) { n = n * 10 + (buf[i] - 0x30); i++; seen = true; }
    if (seen) tok.push(n);
  }
  i++; // single whitespace byte after maxval
  const [width, height, max] = tok;
  return { width, height, max, data: buf.subarray(i, i + width * height) };
}

export interface PgmDiff { equal: boolean; reason?: string; firstIdx?: number; x?: number; y?: number; a?: number; b?: number; }

export function diffPgm(aBuf: Buffer, bBuf: Buffer): PgmDiff {
  const a = parsePgm(aBuf);
  const b = parsePgm(bBuf);
  if (a.width !== b.width || a.height !== b.height) {
    return { equal: false, reason: `dims ${a.width}x${a.height} vs ${b.width}x${b.height}` };
  }
  if (a.data.length !== b.data.length) {
    return { equal: false, reason: `data length ${a.data.length} vs ${b.data.length}` };
  }
  for (let idx = 0; idx < a.data.length; idx++) {
    if (a.data[idx] !== b.data[idx]) {
      return {
        equal: false, reason: 'pixel mismatch', firstIdx: idx,
        x: idx % a.width, y: Math.floor(idx / a.width), a: a.data[idx], b: b.data[idx],
      };
    }
  }
  return { equal: true };
}
