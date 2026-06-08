import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitForPi } from '../src/main/discovery.js';
import type { HealthBody } from '../src/main/discovery.js';

/** Build a Response-like object exposing only what `waitForPi` reads. */
const okBody = (body: HealthBody) => ({ ok: true, json: async () => body });
const notOk = (status = 503) => ({ ok: false, status, json: async () => ({}) });

describe('waitForPi', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('resolves on the first poll when the single host reports running', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okBody({ server: 'running', mqtt: 'running' }));

    const result = await waitForPi({
      hosts: ['opennova.local'],
      timeoutMs: 1000,
      intervalMs: 10,
      fetchFn,
    });

    expect(result.host).toBe('opennova.local');
    expect(result.body).toEqual({ server: 'running', mqtt: 'running' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith('http://opennova.local/api/setup/health');
  });

  it('keeps polling through transient failures and resolves once running', async () => {
    const fetchFn = vi
      .fn()
      // poll 1: network throw (host not up yet / DNS not resolving)
      .mockRejectedValueOnce(new Error('ENOTFOUND'))
      // poll 2: non-ok HTTP status
      .mockResolvedValueOnce(notOk(502))
      // poll 3: ok but still starting
      .mockResolvedValueOnce(okBody({ server: 'starting' }))
      // poll 4: ready
      .mockResolvedValue(okBody({ server: 'running' }));

    const promise = waitForPi({
      hosts: ['opennova.local'],
      timeoutMs: 10000,
      intervalMs: 100,
      fetchFn,
    });

    // Drive the polling loop forward deterministically.
    await vi.advanceTimersByTimeAsync(400);

    const result = await promise;
    expect(result.host).toBe('opennova.local');
    expect(result.body).toEqual({ server: 'running' });
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('falls back to the second host in order when the first never becomes ready', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes('opennova.local')) {
        // first host is reachable but never ready
        return okBody({ server: 'starting' });
      }
      return okBody({ server: 'running' });
    });

    const promise = waitForPi({
      hosts: ['opennova.local', '192.168.0.50'],
      timeoutMs: 10000,
      intervalMs: 100,
      fetchFn,
    });

    await vi.advanceTimersByTimeAsync(0);
    const result = await promise;

    expect(result.host).toBe('192.168.0.50');
    expect(result.body).toEqual({ server: 'running' });
    // Both hosts are probed within a single poll round (first never ready).
    const urls = fetchFn.mock.calls.map((c) => c[0]);
    expect(urls).toContain('http://opennova.local/api/setup/health');
    expect(urls).toContain('http://192.168.0.50/api/setup/health');
  });

  it('rejects on timeout when no host ever reports ready', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okBody({ server: 'starting' }));

    const promise = waitForPi({
      hosts: ['opennova.local'],
      timeoutMs: 500,
      intervalMs: 100,
      fetchFn,
    });
    // Attach a rejection handler immediately so an unhandled rejection is not
    // reported while we advance the fake clock.
    const settled = expect(promise).rejects.toThrow(/timed out|timeout/i);

    await vi.advanceTimersByTimeAsync(600);
    await settled;
  });

  it('aborts promptly when the AbortSignal fires and stops polling', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okBody({ server: 'starting' }));
    const controller = new AbortController();

    const promise = waitForPi({
      hosts: ['opennova.local'],
      timeoutMs: 10000,
      intervalMs: 100,
      fetchFn,
      signal: controller.signal,
    });
    const settled = expect(promise).rejects.toThrow(/abort/i);

    await vi.advanceTimersByTimeAsync(250);
    const callsAtAbort = fetchFn.mock.calls.length;
    controller.abort();
    await settled;

    // No further polling happens after the abort.
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchFn.mock.calls.length).toBe(callsAtAbort);
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okBody({ server: 'running' }));
    const controller = new AbortController();
    controller.abort();

    await expect(
      waitForPi({
        hosts: ['opennova.local'],
        timeoutMs: 1000,
        intervalMs: 100,
        fetchFn,
        signal: controller.signal,
      }),
    ).rejects.toThrow(/abort/i);

    expect(fetchFn).not.toHaveBeenCalled();
  });
});
