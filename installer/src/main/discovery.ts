/**
 * Discover the booted Raspberry Pi by polling the OpenNova health endpoint.
 *
 * After flashing, the Pi boots, joins the network and brings up the OpenNova
 * server, which exposes `GET http://<host>/api/setup/health`. A running server
 * answers with JSON whose `server` field is the literal string `'running'`
 * (e.g. `{"server":"running","mqtt":"running"}`). We poll one or more candidate
 * hosts (mDNS name first, an optional IP fallback after) until one answers
 * "running", a caller-supplied timeout elapses, or an `AbortSignal` fires.
 *
 * The polling is fully driven by an injectable `fetchFn` so the module is unit
 * testable with zero real network traffic; production callers omit it and get
 * the global `fetch`.
 */

/** Minimal shape of the JSON returned by `/api/setup/health`. */
export interface HealthBody {
  /** `'running'` once the server is fully up; anything else means not ready. */
  server?: string;
  mqtt?: string;
  [key: string]: unknown;
}

/** Minimal Response shape we read — `ok`, optional `status`, and `json()`. */
export interface FetchResponseLike {
  ok: boolean;
  status?: number;
  json(): Promise<unknown>;
}

/** Injectable fetch: takes a URL, resolves a Response-like object. */
export type FetchFn = (url: string) => Promise<FetchResponseLike>;

/** Options for {@link waitForPi}. */
export interface WaitForPiOptions {
  /** Hosts to probe, in priority order. Defaults to `['opennova.local']`. */
  hosts?: string[];
  /** Give up after this many milliseconds. Defaults to 120000. */
  timeoutMs?: number;
  /** Delay between poll rounds, in milliseconds. Defaults to 2000. */
  intervalMs?: number;
  /** Fetch implementation. Defaults to the global `fetch`. */
  fetchFn?: FetchFn;
  /** Cancels the wait; rejects promptly when aborted. */
  signal?: AbortSignal;
}

/** The host that answered "running", together with its parsed health body. */
export interface PiDiscovery {
  host: string;
  body: HealthBody;
}

const DEFAULT_HOSTS = ['opennova.local'];
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_INTERVAL_MS = 2_000;

/** Build the health URL for a host. */
function healthUrl(host: string): string {
  return `http://${host}/api/setup/health`;
}

/**
 * Probe a single host once. Resolves the parsed body when the host is up AND
 * reports `server === 'running'`; resolves `null` for every "not ready yet"
 * outcome — a thrown fetch (host/DNS not up), a non-ok HTTP status, an
 * unparseable body, or a body whose `server` is not `'running'`. It never
 * throws, so a single bad host cannot abort the whole wait.
 */
async function probe(fetchFn: FetchFn, host: string): Promise<HealthBody | null> {
  try {
    const res = await fetchFn(healthUrl(host));
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as HealthBody;
    if (body !== null && typeof body === 'object' && body.server === 'running') {
      return body;
    }
    return null;
  } catch {
    return null;
  }
}

/** An `Error` that reads as an abort, matching the platform `AbortError`. */
function abortError(): Error {
  const err = new Error('waitForPi aborted');
  err.name = 'AbortError';
  return err;
}

/**
 * Poll `hosts` until one answers "running". Tries every host in order within
 * each round and resolves as soon as any is ready; otherwise waits `intervalMs`
 * and rounds again. Rejects on `timeoutMs` or when `signal` aborts. Cleans up
 * its timers on every exit path so no interval/timeout is ever left dangling.
 */
export function waitForPi(options: WaitForPiOptions = {}): Promise<PiDiscovery> {
  const hosts = options.hosts && options.hosts.length > 0 ? options.hosts : DEFAULT_HOSTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const fetchFn: FetchFn = options.fetchFn ?? ((url: string) => fetch(url));
  const signal = options.signal;

  return new Promise<PiDiscovery>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    let settled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (pollTimer !== undefined) clearTimeout(pollTimer);
      if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
      if (signal !== undefined) signal.removeEventListener('abort', onAbort);
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const onAbort = () => finish(() => reject(abortError()));

    deadlineTimer = setTimeout(
      () =>
        finish(() =>
          reject(
            new Error(
              `Timed out after ${timeoutMs}ms waiting for OpenNova on: ${hosts.join(', ')}`,
            ),
          ),
        ),
      timeoutMs,
    );

    signal?.addEventListener('abort', onAbort);

    const round = async () => {
      for (const host of hosts) {
        if (settled) return;
        const body = await probe(fetchFn, host);
        if (settled) return;
        if (body !== null) {
          finish(() => resolve({ host, body }));
          return;
        }
      }
      if (settled) return;
      pollTimer = setTimeout(() => {
        void round();
      }, intervalMs);
    };

    void round();
  });
}
