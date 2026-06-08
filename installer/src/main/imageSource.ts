import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

/**
 * Stream a file through sha256 and compare (case-insensitively) to the
 * expected hex digest. Returns a boolean — a mismatch is NOT an error, it is a
 * `false`. Only genuine I/O failures reject.
 */
export async function verifySha256(filePath: string, expectedHex: string): Promise<boolean> {
  const hash = createHash('sha256');
  try {
    await pipeline(createReadStream(filePath), hash);
  } catch (err) {
    throw new Error(
      `Failed to read '${filePath}' while verifying sha256: ${(err as Error).message}`,
    );
  }
  const actual = hash.digest('hex').toLowerCase();
  return actual === expectedHex.toLowerCase();
}

/**
 * Stream a remote image to `destPath`. Reports progress as (bytesReceived,
 * totalBytes|null) where total comes from the Content-Length header (null when
 * the server does not advertise it). Resolves only after the file is fully
 * written and flushed to disk; rejects (and removes the partial file) on any
 * network or filesystem failure.
 */
export async function downloadImage(
  url: string,
  destPath: string,
  onProgress?: (received: number, total: number | null) => void,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error(`Network error downloading '${url}': ${(err as Error).message}`);
  }

  if (!response.ok) {
    throw new Error(`Failed to download '${url}': HTTP ${response.status} ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error(`Failed to download '${url}': response has no body`);
  }

  const lengthHeader = response.headers.get('content-length');
  const total = lengthHeader !== null ? Number(lengthHeader) : null;
  const totalBytes = total !== null && Number.isFinite(total) ? total : null;

  let received = 0;
  // Wrap the web ReadableStream as a Node stream and tap progress as it flows.
  const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  source.on('data', (chunk: Buffer) => {
    received += chunk.length;
    onProgress?.(received, totalBytes);
  });

  try {
    await pipeline(source, createWriteStream(destPath));
  } catch (err) {
    await unlink(destPath).catch(() => {});
    throw new Error(`Failed to write '${destPath}': ${(err as Error).message}`);
  }
}
