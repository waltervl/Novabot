import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import mdns from 'multicast-dns';
import { startMdnsAdvertiser, stopMdnsAdvertiser } from '../../services/mdnsAdvertiser.js';

// Use a non-5353 port so tests don't fight macOS mDNSResponder which
// squats on the standard port on dev machines. Production code keeps
// the 5353 default — Linux containers don't have this conflict.
const TEST_PORT = 15353;

describe('mDNS advertiser', () => {
  let savedEnableMdns: string | undefined;
  beforeEach(() => {
    // startMdnsAdvertiser() bails out when ENABLE_MDNS is "false"/"0". A
    // developer's local server/.env may set that (to silence the advertiser
    // during dev) — force it OFF here so these tests reliably exercise the
    // advertiser answering queries, independent of the ambient environment.
    savedEnableMdns = process.env.ENABLE_MDNS;
    delete process.env.ENABLE_MDNS;
  });
  afterEach(() => {
    stopMdnsAdvertiser();
    if (savedEnableMdns === undefined) delete process.env.ENABLE_MDNS;
    else process.env.ENABLE_MDNS = savedEnableMdns;
  });

  it('answers A query for opennova.local with the configured IP', async () => {
    startMdnsAdvertiser({ ip: '10.99.0.42', hostnames: ['opennova.local'], ttl: 60, port: TEST_PORT });

    const client = mdns({ port: 0, multicast: false });
    const reply = await new Promise<{ name: string; data: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 1000);
      client.on('response', (packet) => {
        const a = packet.answers?.find((x) => x.name === 'opennova.local' && x.type === 'A');
        if (a) {
          clearTimeout(timer);
          resolve({ name: a.name, data: (a as { data: string }).data });
        }
      });
      // @types/multicast-dns lacks the 3-arg unicast overload — cast to any
      (client.query as any)({ questions: [{ name: 'opennova.local', type: 'A' }] }, undefined, {
        address: '127.0.0.1', port: TEST_PORT,
      });
    });
    client.destroy();

    expect(reply.name).toBe('opennova.local');
    expect(reply.data).toBe('10.99.0.42');
  });

  it('answers for the legacy opennovabot.local hostname too', async () => {
    startMdnsAdvertiser({ ip: '10.99.0.42', hostnames: ['opennova.local', 'opennovabot.local'], ttl: 60, port: TEST_PORT });

    const client = mdns({ port: 0, multicast: false });
    const reply = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 1000);
      client.on('response', (packet) => {
        const a = packet.answers?.find((x) => x.name === 'opennovabot.local' && x.type === 'A');
        if (a) { clearTimeout(timer); resolve((a as { data: string }).data); }
      });
      // @types/multicast-dns lacks the 3-arg unicast overload — cast to any
      (client.query as any)({ questions: [{ name: 'opennovabot.local', type: 'A' }] }, undefined, {
        address: '127.0.0.1', port: TEST_PORT,
      });
    });
    client.destroy();

    expect(reply).toBe('10.99.0.42');
  });

  it('ignores queries for unrelated hostnames', async () => {
    startMdnsAdvertiser({ ip: '10.99.0.42', hostnames: ['opennova.local'], ttl: 60, port: TEST_PORT });

    const client = mdns({ port: 0, multicast: false });
    const replied = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 500);
      client.on('response', (packet) => {
        const a = packet.answers?.find((x) => x.name === 'somebody-else.local');
        if (a) { clearTimeout(timer); resolve(true); }
      });
      // @types/multicast-dns lacks the 3-arg unicast overload — cast to any
      (client.query as any)({ questions: [{ name: 'somebody-else.local', type: 'A' }] }, undefined, {
        address: '127.0.0.1', port: TEST_PORT,
      });
    });
    client.destroy();

    expect(replied).toBe(false);
  });

  it('answers SRV query with the configured http port + bundles the A record', async () => {
    startMdnsAdvertiser({
      ip: '10.99.0.42',
      hostnames: ['opennova.local'],
      ttl: 60,
      port: TEST_PORT,
      httpPort: 8080,
      srvName: '_opennova-http._tcp.local',
    });

    const client = mdns({ port: 0, multicast: false });
    const reply = await new Promise<{
      srv: { port: number; target: string };
      a: string | null;
    }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 1000);
      client.on('response', (packet) => {
        const srv = packet.answers?.find(
          (x) => x.name === '_opennova-http._tcp.local' && x.type === 'SRV',
        );
        if (srv) {
          clearTimeout(timer);
          const a = packet.answers?.find((x) => x.name === 'opennova.local' && x.type === 'A');
          resolve({
            srv: (srv as { data: { port: number; target: string } }).data,
            a: a ? (a as { data: string }).data : null,
          });
        }
      });
      // @types/multicast-dns lacks the 3-arg unicast overload — cast to any
      (client.query as any)(
        { questions: [{ name: '_opennova-http._tcp.local', type: 'SRV' }] },
        undefined,
        { address: '127.0.0.1', port: TEST_PORT },
      );
    });
    client.destroy();

    expect(reply.srv.port).toBe(8080);
    expect(reply.srv.target).toBe('opennova.local');
    expect(reply.a).toBe('10.99.0.42');
  });

  it('uses HTTP_PORT env var as default when httpPort option not supplied', async () => {
    process.env.HTTP_PORT = '9090';
    startMdnsAdvertiser({ ip: '10.99.0.42', hostnames: ['opennova.local'], ttl: 60, port: TEST_PORT });
    delete process.env.HTTP_PORT;

    const client = mdns({ port: 0, multicast: false });
    const port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 1000);
      client.on('response', (packet) => {
        const srv = packet.answers?.find((x) => x.type === 'SRV');
        if (srv) { clearTimeout(timer); resolve((srv as { data: { port: number } }).data.port); }
      });
      (client.query as any)(
        { questions: [{ name: '_opennova-http._tcp.local', type: 'SRV' }] },
        undefined,
        { address: '127.0.0.1', port: TEST_PORT },
      );
    });
    client.destroy();

    expect(port).toBe(9090);
  });
});
