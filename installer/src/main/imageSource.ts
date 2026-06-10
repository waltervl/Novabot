import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { XzReadableStream } from 'xz-decompress';

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
