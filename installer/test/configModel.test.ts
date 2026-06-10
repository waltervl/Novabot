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

  it('defers the Docker/OpenNova install to a post-network systemd service', () => {
    const g = generateFiles({ ...base, connectionPath: 'opennova-app' });
    expect(g.firstrunSh).toMatch(/^#!\/bin\/bash/);
    // The first boot stays lightweight and ALWAYS completes.
    expect(g.firstrunSh).toContain('set +e');
    expect(g.firstrunSh).toMatch(/exit 0\s*$/);
    // It MUST remove the first-boot hook, or the Pi reboots on every boot (loop).
    expect(g.firstrunSh).toContain('rm -f /boot/firmware/firstrun.sh');
    expect(g.firstrunSh).toMatch(/sed -i .*cmdline\.txt/);
    // It installs + enables a service that runs the heavy install AFTER network.
    expect(g.firstrunSh).toContain('opennova-setup.service');
    expect(g.firstrunSh).toContain('After=network-online.target');
    expect(g.firstrunSh).toContain('/var/lib/opennova/installed'); // run-once marker
    // The actual Docker/OpenNova install lives in that deferred service.
    expect(g.firstrunSh).toContain('docker-ce');
    expect(g.firstrunSh).toContain('hostname -I');
    expect(g.firstrunSh).toContain('docker compose up -d');
  });

  it('wifi config writes a NetworkManager keyfile profile; ethernet does not', () => {
    const wifi = generateFiles({ ...base, network: { type: 'wifi', ssid: 'Home', password: 'secret12', country: 'NL' }, connectionPath: 'opennova-app' });
    // A keyfile written directly (NOT nmcli, which fails in the first-boot context).
    expect(wifi.firstrunSh).toContain('opennova-wifi.nmconnection');
    expect(wifi.firstrunSh).toContain('ssid=Home');
    expect(wifi.firstrunSh).toContain('key-mgmt=wpa-psk');
    expect(wifi.firstrunSh).not.toContain('nmcli');
    expect(generateFiles({ ...base, connectionPath: 'opennova-app' }).firstrunSh).not.toContain('nmconnection');
  });

  it('cmdlineAppend triggers firstrun once then reboots', () => {
    const g = generateFiles({ ...base, connectionPath: 'opennova-app' });
    // Bookworm/Trixie mount the boot partition at /boot/firmware (matches RPi Imager).
    expect(g.cmdlineAppend).toContain('systemd.run=/boot/firmware/firstrun.sh');
    expect(g.cmdlineAppend).toContain('systemd.run_success_action=reboot');
  });

  it('writes the Wi-Fi password verbatim into the NM keyfile (no shell quoting)', () => {
    const g = generateFiles({
      ...base,
      network: { type: 'wifi', ssid: 'Home', password: "p'wnpass", country: 'NL' },
      connectionPath: 'opennova-app',
    });
    // Keyfile values are literal to end-of-line, so the quote is NOT shell-escaped.
    expect(g.firstrunSh).toContain("psk=p'wnpass");
  });

  it('REJECTS Wi-Fi credentials with newlines / control chars (heredoc injection)', () => {
    // A crafted SSID that would close the heredoc and inject a root command.
    expect(() =>
      generateFiles({
        ...base,
        network: { type: 'wifi', ssid: 'Home\nNMCONN\nrm -rf /', password: 'secret12', country: 'NL' },
        connectionPath: 'opennova-app',
      }),
    ).toThrow(/newlines or control characters/i);
    // Same guard on the password.
    expect(() =>
      generateFiles({
        ...base,
        network: { type: 'wifi', ssid: 'Home', password: 'secret12\nrm -rf /', country: 'NL' },
        connectionPath: 'opennova-app',
      }),
    ).toThrow(/newlines or control characters/i);
  });

  it('REJECTS an out-of-range Wi-Fi password (WPA needs 8–63 chars)', () => {
    expect(() =>
      generateFiles({
        ...base,
        network: { type: 'wifi', ssid: 'Home', password: 'short', country: 'NL' },
        connectionPath: 'opennova-app',
      }),
    ).toThrow(/8.63 characters/);
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
