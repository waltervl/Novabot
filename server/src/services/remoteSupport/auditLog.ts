import fs from 'node:fs';
import path from 'node:path';

interface Options {
  maxBytes?: number;
  maxFilesPerSn?: number;
}

/** Captures every byte that crosses the relay for one session and writes
 *  it to /data/remote-support-logs/<sn>-<iso>.log so the user can review
 *  exactly what Ramon did during a support session. Rotates per session
 *  rather than per file — each new pty spawn opens a fresh file with the
 *  current timestamp. */
export class AuditLog {
  private fd: number | null = null;
  private path: string;
  private bytesWritten = 0;
  private rotateAt: number;
  private rotation = 0;
  private snBase: string;

  constructor(private dir: string, sn: string, opts: Options = {}) {
    fs.mkdirSync(dir, { recursive: true });
    this.snBase = sn;
    this.rotateAt = opts.maxBytes ?? 10 * 1024 * 1024;
    this.path = this.makePath();
    this.fd = fs.openSync(this.path, 'a');
  }

  private makePath(): string {
    const iso = new Date().toISOString().replace(/[:.]/g, '-');
    const suffix = this.rotation === 0 ? '' : `.${this.rotation}`;
    return path.join(this.dir, `${this.snBase}-${iso}${suffix}.log`);
  }

  appendIn(data: Buffer | string): void { this.write('<<', data); }
  appendOut(data: Buffer | string): void { this.write('>>', data); }

  private write(marker: string, data: Buffer | string): void {
    if (this.fd === null) return;
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const line = Buffer.concat([
      Buffer.from(`${marker} `),
      buf,
      buf.length > 0 && buf[buf.length - 1] !== 0x0a ? Buffer.from('\n') : Buffer.alloc(0),
    ]);
    fs.writeSync(this.fd, line);
    this.bytesWritten += line.length;
    if (this.bytesWritten >= this.rotateAt) this.rotate();
  }

  private rotate(): void {
    if (this.fd !== null) fs.closeSync(this.fd);
    this.rotation += 1;
    this.bytesWritten = 0;
    this.path = this.makePath();
    this.fd = fs.openSync(this.path, 'a');
  }

  close(): void {
    if (this.fd !== null) {
      fs.closeSync(this.fd);
      this.fd = null;
    }
  }
}

/** Drop everything past the newest N files for this SN. Called on session
 *  start so audit logs never grow unbounded. */
export function pruneAuditLogs(dir: string, sn: string, keep: number): number {
  if (!fs.existsSync(dir)) return 0;
  const entries = fs.readdirSync(dir)
    .filter((f) => f.startsWith(`${sn}-`) && f.endsWith('.log'))
    .map((f) => ({ f, full: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  const toDelete = entries.slice(keep);
  for (const e of toDelete) {
    try { fs.unlinkSync(e.full); } catch { /* already gone */ }
  }
  return toDelete.length;
}
