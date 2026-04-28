import { describe, it, expect, afterEach } from 'vitest';
import mdns from 'multicast-dns';
import { startMdnsAdvertiser, stopMdnsAdvertiser } from '../../services/mdnsAdvertiser.js';

// Use a non-5353 port so tests don't fight macOS mDNSResponder which
// squats on the standard port on dev machines. Production code keeps
// the 5353 default — Linux containers don't have this conflict.
const TEST_PORT = 15353;

describe('mDNS advertiser', () => {
  afterEach(() => {
    stopMdnsAdvertiser();
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
});
