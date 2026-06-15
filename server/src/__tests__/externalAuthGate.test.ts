import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  isInternalIp,
  normalizeIp,
  pickGateClientIp,
  externalAuthGate,
  gateAllowsWithoutAuth,
  authGateMode,
} from '../middleware/externalAuthGate.js';

describe('normalizeIp', () => {
  it('strips IPv4-mapped IPv6 prefix', () => {
    expect(normalizeIp('::ffff:192.168.0.5')).toBe('192.168.0.5');
  });
  it('strips brackets around IPv6', () => {
    expect(normalizeIp('[::1]')).toBe('::1');
  });
  it('handles empty / null', () => {
    expect(normalizeIp(undefined)).toBe('');
    expect(normalizeIp(null)).toBe('');
  });
});

describe('isInternalIp', () => {
  it('treats loopback as internal', () => {
    expect(isInternalIp('127.0.0.1')).toBe(true);
    expect(isInternalIp('::1')).toBe(true);
  });
  it('treats RFC1918 ranges as internal', () => {
    expect(isInternalIp('10.1.2.3')).toBe(true);
    expect(isInternalIp('172.16.0.1')).toBe(true);
    expect(isInternalIp('172.31.255.255')).toBe(true);
    expect(isInternalIp('192.168.0.10')).toBe(true);
    expect(isInternalIp('192.168.3.2')).toBe(true); // WireGuard VPN subnet
  });
  it('treats link-local / unique-local as internal', () => {
    expect(isInternalIp('169.254.1.1')).toBe(true);
    expect(isInternalIp('fe80::1')).toBe(true);
    expect(isInternalIp('fd00::abcd')).toBe(true);
  });
  it('treats IPv4-mapped private addresses as internal', () => {
    expect(isInternalIp('::ffff:192.168.0.5')).toBe(true);
  });
  it('treats public addresses as external', () => {
    expect(isInternalIp('8.8.8.8')).toBe(false);
    expect(isInternalIp('1.2.3.4')).toBe(false);
    expect(isInternalIp('2606:4700:4700::1111')).toBe(false);
  });
  it('does NOT treat 172.15/172.32 as internal (boundary)', () => {
    expect(isInternalIp('172.15.0.1')).toBe(false);
    expect(isInternalIp('172.32.0.1')).toBe(false);
  });
  it('fails closed on empty / garbage', () => {
    expect(isInternalIp('')).toBe(false);
    expect(isInternalIp('not-an-ip')).toBe(false);
    expect(isInternalIp('999.999.999.999')).toBe(false);
  });
  it('honours DASHBOARD_TRUSTED_IP_PREFIXES', () => {
    const prev = process.env.DASHBOARD_TRUSTED_IP_PREFIXES;
    process.env.DASHBOARD_TRUSTED_IP_PREFIXES = '100.64.,203.0.113.7';
    try {
      expect(isInternalIp('100.64.0.1')).toBe(true);
      expect(isInternalIp('203.0.113.7')).toBe(true);
      expect(isInternalIp('203.0.113.8')).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.DASHBOARD_TRUSTED_IP_PREFIXES;
      else process.env.DASHBOARD_TRUSTED_IP_PREFIXES = prev;
    }
  });
});

describe('pickGateClientIp', () => {
  it('uses the rightmost X-Forwarded-For entry (proxy-appended)', () => {
    // Client tried to spoof a private IP on the left; proxy appended the real one.
    expect(pickGateClientIp('192.168.0.99, 8.8.8.8', '172.17.0.1')).toBe('8.8.8.8');
  });
  it('uses the single XFF entry when only one', () => {
    expect(pickGateClientIp('192.168.0.5', '172.17.0.1')).toBe('192.168.0.5');
  });
  it('handles array XFF headers', () => {
    expect(pickGateClientIp(['10.0.0.1', '8.8.8.8'], undefined)).toBe('8.8.8.8');
  });
  it('falls back to the socket peer when no XFF', () => {
    expect(pickGateClientIp(undefined, '192.168.0.7')).toBe('192.168.0.7');
  });
  it('returns empty string when nothing is available', () => {
    expect(pickGateClientIp(undefined, undefined)).toBe('');
  });
});

describe('authGateMode / gateAllowsWithoutAuth', () => {
  beforeEach(() => { delete process.env.DASHBOARD_PUBLIC_AUTH; });
  afterEach(() => { delete process.env.DASHBOARD_PUBLIC_AUTH; });

  it('defaults to external-only', () => {
    expect(authGateMode()).toBe('external');
    expect(gateAllowsWithoutAuth('192.168.0.5')).toBe(true);   // internal skips
    expect(gateAllowsWithoutAuth('8.8.8.8')).toBe(false);      // external needs auth
  });
  it('off mode lets everyone through', () => {
    process.env.DASHBOARD_PUBLIC_AUTH = 'off';
    expect(authGateMode()).toBe('off');
    expect(gateAllowsWithoutAuth('8.8.8.8')).toBe(true);
    expect(gateAllowsWithoutAuth('192.168.0.5')).toBe(true);
  });
  it('all mode requires auth from everyone (incl. internal)', () => {
    process.env.DASHBOARD_PUBLIC_AUTH = 'all';
    expect(authGateMode()).toBe('all');
    expect(gateAllowsWithoutAuth('192.168.0.5')).toBe(false);
    expect(gateAllowsWithoutAuth('127.0.0.1')).toBe(false);
  });
  it('is case-insensitive / trims', () => {
    process.env.DASHBOARD_PUBLIC_AUTH = '  OFF ';
    expect(authGateMode()).toBe('off');
  });
});

describe('externalAuthGate middleware', () => {
  const makeReq = (xff: string | undefined, remoteAddress: string) => ({
    headers: xff ? { 'x-forwarded-for': xff } : {},
    socket: { remoteAddress },
    method: 'GET',
    originalUrl: '/api/dashboard/devices',
  }) as any;

  const makeRes = () => {
    const res: any = {};
    res.statusCode = 200;
    res.status = vi.fn().mockImplementation((c: number) => { res.statusCode = c; return res; });
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => { delete process.env.DASHBOARD_PUBLIC_AUTH; });
  afterEach(() => { delete process.env.DASHBOARD_PUBLIC_AUTH; });

  it('passes internal traffic through without auth', () => {
    const next = vi.fn();
    const res = makeRes();
    externalAuthGate(makeReq(undefined, '192.168.0.50'), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(); // no error
    expect(res.json).not.toHaveBeenCalled();
  });

  it('passes internal traffic that arrives via the proxy (XFF private)', () => {
    const next = vi.fn();
    const res = makeRes();
    externalAuthGate(makeReq('192.168.0.50', '172.17.0.1'), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('rejects external traffic with no token (401 envelope)', () => {
    const next = vi.fn();
    const res = makeRes();
    externalAuthGate(makeReq('8.8.8.8', '172.17.0.1'), res, next);
    // authMiddleware short-circuits with a 401 envelope; next() is NOT called.
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledTimes(1);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(false);
    expect(payload.code).toBe(401);
  });

  it('is fully bypassed when DASHBOARD_PUBLIC_AUTH=off', () => {
    process.env.DASHBOARD_PUBLIC_AUTH = 'off';
    const next = vi.fn();
    const res = makeRes();
    externalAuthGate(makeReq('8.8.8.8', '172.17.0.1'), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('requires auth even for internal traffic when DASHBOARD_PUBLIC_AUTH=all', () => {
    process.env.DASHBOARD_PUBLIC_AUTH = 'all';
    const next = vi.fn();
    const res = makeRes();
    externalAuthGate(makeReq(undefined, '192.168.0.50'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledTimes(1);
    expect(res.json.mock.calls[0][0].code).toBe(401);
  });
});
