import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { unlink, open, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { XzReadableStream } from 'xz-decompress';

/**
 * Stream a file through sha256 and compare (case-insensitively) to the
 * expected hex digest. Returns a boolean — a mismatch is NOT an error, it is a
 * `false`. Only genuine I/O failures reject.
 */
export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  try {
    await pipeline(createReadStream(filePath), hash);
  } catch (err) {
    throw new Error(
      `Failed to read '${filePath}' while computing sha256: ${(err as Error).message}`,
    );
  }
  return hash.digest('hex').toLowerCase();
}

export async function verifySha256(filePath: string, expectedHex: string): Promise<boolean> {
  return (await sha256File(filePath)) === expectedHex.toLowerCase();
}

/**
 * Parse the first sha256 digest out of a `.sha256` sidecar file's contents. The
 * sidecar is `sha256sum`-style (`<hex>  <filename>`); we take the first
 * whitespace-delimited token and require exactly 64 hex chars. Throws on
 * anything malformed so an empty/garbled sidecar can never silently disable
 * verification (which would let an unverified image through). Pure + testable.
 */
export function parseSha256Sidecar(text: string): string {
  const token = text.trim().split(/\s+/)[0] ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(token)) {
    throw new Error(
      `Malformed sha256 sidecar (expected 64 hex chars, got '${token.slice(0, 80)}')`,
    );
  }
  return token.toLowerCase();
}

/**
 * Resolve the Raspberry Pi OS `_latest` endpoint to the concrete dated image URL
 * it 302-redirects to. We issue a HEAD (fetch follows redirects by default) so
 * we never pull the multi-hundred-MB body just to learn the URL; the resolved
 * address is read from `response.url`. Guarded so a redirect to anything that is
 * not an `.img.xz` is rejected rather than blindly downloaded.
 */
export async function resolveLatestImageUrl(latestUrl: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(latestUrl, { method: 'HEAD', redirect: 'follow' });
  } catch (err) {
    throw new Error(
      `Network error resolving latest image '${latestUrl}': ${(err as Error).message}`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `Failed to resolve latest image '${latestUrl}': HTTP ${response.status} ${response.statusText}`,
    );
  }
  if (!response.url.endsWith('.img.xz')) {
    throw new Error(`Unexpected latest image URL '${response.url}' (expected an .img.xz)`);
  }
  return response.url;
}

/**
 * Fetch the `.img.xz.sha256` sidecar for `imageUrl` and return the expected
 * lowercase hex digest. This is where integrity for the always-latest image
 * comes from: the digest is published by Raspberry Pi alongside each image and
 * fetched over HTTPS at download time, so there is no pinned hash to maintain.
 */
export async function fetchExpectedSha256(imageUrl: string): Promise<string> {
  const sidecarUrl = `${imageUrl}.sha256`;
  let response: Response;
  try {
    response = await fetch(sidecarUrl);
  } catch (err) {
    throw new Error(`Network error fetching checksum '${sidecarUrl}': ${(err as Error).message}`);
  }
  if (!response.ok) {
    throw new Error(
      `Failed to fetch checksum '${sidecarUrl}': HTTP ${response.status} ${response.statusText}`,
    );
  }
  return parseSha256Sidecar(await response.text());
}

/**
 * Decompress an `.img.xz` to a raw `.img` at `outPath`, STREAMING through a
 * WASM xz decoder. Streaming is mandatory here: a Raspberry Pi OS Lite image is
 * ~3.2 GB uncompressed, and materialising that in a single Buffer/ArrayBuffer
 * crashes the Electron main process (`v8::ArrayBuffer::NewBackingStore`
 * out-of-memory — the V8 memory cage refuses an allocation that large). The
 * WASM decoder (`xz-decompress`) keeps only a small window in memory (peak RSS
 * ~150 MB) and writes chunks straight to disk. Its WASM is base64-inlined, so it
 * works inside the packaged asar with no native module / ABI concerns.
 */
export async function decompressXz(xzPath: string, outPath: string): Promise<void> {
  const compressed = Readable.toWeb(createReadStream(xzPath)) as ReadableStream<Uint8Array>;
  const decompressed = new XzReadableStream(compressed);
  await pipeline(
    Readable.fromWeb(decompressed as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(outPath),
  );
}

/** Size of each ranged request. Small enough that AV/proxy middleboxes that
 *  corrupt one long stream still pass these through intact. */
const CHUNK_BYTES = 8 * 1024 * 1024;
/** Per-chunk network retries before giving up on a ranged download. */
const CHUNK_RETRIES = 5;

/**
 * Download a remote image to `destPath`. PREFERS a segmented (HTTP Range)
 * download: many small requests instead of one ~600 MB stream. A surprising
 * number of consumer setups (antivirus scanning large downloads, captive/proxy
 * middleboxes, some VPNs) silently corrupt a single long HTTPS transfer while
 * leaving small requests intact — the symptom is a complete, structurally-valid
 * file with the wrong checksum. Ranged requests route around that, and a bad
 * chunk is re-fetched on its own. Falls back to a single stream when the server
 * does not support ranges. Reports (bytesReceived, totalBytes|null).
 */
export async function downloadImage(
  url: string,
  destPath: string,
  onProgress?: (received: number, total: number | null) => void,
): Promise<void> {
  let total: number | null = null;
  let supportsRanges = false;
  try {
    const head = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (head.ok) {
      const len = Number(head.headers.get('content-length'));
      if (Number.isFinite(len) && len > 0) total = len;
      supportsRanges = (head.headers.get('accept-ranges') ?? '').toLowerCase().includes('bytes');
    }
  } catch {
    /* HEAD is best-effort; fall through to a streamed download */
  }

  if (total !== null && supportsRanges) {
    try {
      await downloadRanged(url, destPath, total, onProgress);
      return;
    } catch (err) {
      // Range path failed (e.g. a proxy ignored Range and returned 200) — fall
      // back to a single stream rather than aborting the whole build.
      await unlink(destPath).catch(() => {});
      void err;
    }
  }
  await downloadStreamed(url, destPath, total, onProgress);
}

/** Segmented download: write each `bytes=start-end` range at its offset. */
async function downloadRanged(
  url: string,
  destPath: string,
  total: number,
  onProgress?: (received: number, total: number | null) => void,
): Promise<void> {
  const fh = await open(destPath, 'w');
  try {
    let pos = 0;
    while (pos < total) {
      const end = Math.min(pos + CHUNK_BYTES, total) - 1;
      const chunk = await fetchRange(url, pos, end);
      await fh.write(chunk, 0, chunk.length, pos);
      pos += chunk.length;
      onProgress?.(pos, total);
    }
  } finally {
    await fh.close();
  }
  const { size } = await stat(destPath);
  if (size !== total) {
    throw new Error(`Ranged download size mismatch: ${size} of ${total} bytes`);
  }
}

/** Fetch one byte range as a Buffer, retrying transient failures. Throws (so
 *  the caller can fall back) if the server ignores Range and returns 200. */
async function fetchRange(url: string, start: number, end: number): Promise<Buffer> {
  const want = end - start + 1;
  let lastError = 'unknown error';
  for (let attempt = 1; attempt <= CHUNK_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
      if (res.status === 200) {
        // Range ignored — do NOT buffer a ~600 MB body; signal fallback.
        throw new Error('server ignored Range (returned 200)');
      }
      if (res.status !== 206) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length !== want) {
        throw new Error(`short chunk: ${buf.length} of ${want} bytes`);
      }
      return buf;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (lastError.includes('returned 200')) throw new Error(lastError);
    }
  }
  throw new Error(`range ${start}-${end} failed after ${CHUNK_RETRIES} tries: ${lastError}`);
}

/** Single-stream fallback for servers without Range support. */
async function downloadStreamed(
  url: string,
  destPath: string,
  total: number | null,
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

  let received = 0;
  const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  source.on('data', (chunk: Buffer) => {
    received += chunk.length;
    onProgress?.(received, total);
  });
  try {
    await pipeline(source, createWriteStream(destPath));
  } catch (err) {
    await unlink(destPath).catch(() => {});
    throw new Error(`Failed to write '${destPath}': ${(err as Error).message}`);
  }
  if (total !== null && received !== total) {
    await unlink(destPath).catch(() => {});
    throw new Error(`Incomplete download of '${url}': received ${received} of ${total} bytes`);
  }
}
