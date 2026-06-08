import { describe, it, expect } from 'vitest';
import { generateFiles } from '../src/main/configModel.js';

const base = { hostname: 'opennova', network: { type: 'ethernet' } as const, timezone: 'Europe/Amsterdam' };

describe('generateFiles', () => {
  it('compose has host networking, latest image, TARGET_IP from env', () => {
    const g = generateFiles({ ...base, connectionPath: 'opennova-app' });
    expect(g.composeYml).toContain('image: rvbcrs/opennova:latest');
    expect(g.composeYml).toContain('network_mode: host');
    expect(g.composeYml).toContain('TARGET_IP: ${TARGET_IP');
  });

  it('opennova-app path does NOT enable DNS; novabot-app path DOES', () => {
    expect(generateFiles({ ...base, connectionPath: 'opennova-app' }).composeYml)
      .not.toMatch(/ENABLE_DNS:\s*"true"/);
    expect(generateFiles({ ...base, connectionPath: 'novabot-app' }).composeYml)
      .toMatch(/ENABLE_DNS:\s*"true"/);
  });

  it('firstrun installs docker and brings the stack up, auto-detecting TARGET_IP', () => {
    const g = generateFiles({ ...base, connectionPath: 'opennova-app' });
    expect(g.firstrunSh).toMatch(/^#!\/bin\/bash/);
    expect(g.firstrunSh).toContain('docker-ce');
    expect(g.firstrunSh).toContain('hostname -I');
    expect(g.firstrunSh).toContain('docker compose up -d');
  });

  it('wifi config produces an nmcli connection; ethernet does not', () => {
    const wifi = generateFiles({ ...base, network: { type: 'wifi', ssid: 'Home', password: 'secret', country: 'NL' }, connectionPath: 'opennova-app' });
    expect(wifi.firstrunSh).toContain('nmcli');
    expect(wifi.firstrunSh).toContain('Home');
    expect(generateFiles({ ...base, connectionPath: 'opennova-app' }).firstrunSh).not.toContain('nmcli');
  });

  it('cmdlineAppend triggers firstrun once then reboots', () => {
    const g = generateFiles({ ...base, connectionPath: 'opennova-app' });
    expect(g.cmdlineAppend).toContain('systemd.run=/boot/firstrun.sh');
    expect(g.cmdlineAppend).toContain('systemd.run_success_action=reboot');
  });

  it('safely escapes a single quote in the Wi-Fi password', () => {
    const g = generateFiles({
      ...base,
      network: { type: 'wifi', ssid: 'Home', password: "p'wn", country: 'NL' },
      connectionPath: 'opennova-app',
    });
    // The quote is closed, escaped, and reopened: p'\''wn wrapped in quotes.
    expect(g.firstrunSh).toContain("'p'\\''wn'");
    // And the raw, broken sequence must NOT appear.
    expect(g.firstrunSh).not.toContain("psk 'p'wn'");
  });

  it('safely escapes a single quote in the hostname', () => {
    const g = generateFiles({
      ...base,
      hostname: "ho'st",
      connectionPath: 'opennova-app',
    });
    expect(g.firstrunSh).toContain("'ho'\\''st'");
    expect(g.firstrunSh).not.toContain("set-hostname 'ho'st'");
  });

  it('sanitizes a malicious timezone before emitting it into YAML', () => {
    const g = generateFiles({
      ...base,
      timezone: 'Europe/Amsterdam"; rm -rf /',
      connectionPath: 'opennova-app',
    });
    // The TZ line keeps the legitimate part but strips the dangerous chars.
    const tzLine = g.composeYml
      .split('\n')
      .find((l) => l.includes('TZ:'));
    expect(tzLine).toBeDefined();
    expect(tzLine).toContain('Europe/Amsterdam');
    expect(tzLine).not.toContain('"');
    expect(tzLine).not.toContain(';');
    expect(tzLine).not.toContain(' rm');
  });
});
