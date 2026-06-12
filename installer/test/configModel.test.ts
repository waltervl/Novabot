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

describe('generateFiles — SSH', () => {
  const sshBase = { ...base, connectionPath: 'opennova-app' as const };

  it('legacy callers (no ssh block) still just enable the daemon, no account', () => {
    const g = generateFiles(sshBase);
    expect(g.firstrunSh).toContain('systemctl enable ssh');
    expect(g.firstrunSh).not.toContain('useradd');
    expect(g.firstrunSh).not.toContain('chpasswd');
  });

  it('creates the account with a password and adds it to sudo', () => {
    const g = generateFiles({
      ...sshBase,
      ssh: { enabled: true, username: 'opennova', password: 'hunter2pass' },
    });
    expect(g.firstrunSh).toContain('systemctl enable ssh');
    expect(g.firstrunSh).toContain("useradd -m -s /bin/bash 'opennova'");
    expect(g.firstrunSh).toMatch(/printf '%s:%s\\n' 'opennova' 'hunter2pass' \| chpasswd/);
    expect(g.firstrunSh).toContain('usermod -aG "$g" \'opennova\'');
    expect(g.firstrunSh).not.toContain('passwd -l');
  });

  it('installs a public key when provided', () => {
    const key = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIabc123 me@host';
    const g = generateFiles({
      ...sshBase,
      ssh: { enabled: true, username: 'opennova', password: 'hunter2pass', publicKey: key },
    });
    expect(g.firstrunSh).toContain('install -d -m 0700 /home/opennova/.ssh');
    expect(g.firstrunSh).toContain(`printf '%s\\n' '${key}' >> /home/opennova/.ssh/authorized_keys`);
  });

  it('key-only (no password) LOCKS the account password', () => {
    const key = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIabc123 me@host';
    const g = generateFiles({
      ...sshBase,
      ssh: { enabled: true, username: 'opennova', password: '', publicKey: key },
    });
    expect(g.firstrunSh).toContain("passwd -l 'opennova'");
    expect(g.firstrunSh).not.toContain('chpasswd');
    expect(g.firstrunSh).toContain('authorized_keys');
  });

  it('disabled SSH emits no enable and no account', () => {
    const g = generateFiles({
      ...sshBase,
      ssh: { enabled: false, username: 'opennova', password: 'hunter2pass' },
    });
    expect(g.firstrunSh).not.toContain('systemctl enable ssh');
    expect(g.firstrunSh).not.toContain('useradd');
  });

  it('REJECTS an unsafe username', () => {
    expect(() =>
      generateFiles({ ...sshBase, ssh: { enabled: true, username: 'Bad User', password: 'hunter2pass' } }),
    ).toThrow(/username/i);
    expect(() =>
      generateFiles({ ...sshBase, ssh: { enabled: true, username: 'root', password: 'hunter2pass' } }),
    ).toThrow(/root/i);
  });

  it('REJECTS a too-short password and a newline-laden one', () => {
    expect(() =>
      generateFiles({ ...sshBase, ssh: { enabled: true, username: 'opennova', password: 'short' } }),
    ).toThrow(/at least 8/i);
    expect(() =>
      generateFiles({
        ...sshBase,
        ssh: { enabled: true, username: 'opennova', password: 'good\npass\nrm -rf /' },
      }),
    ).toThrow(/control characters/i);
  });

  it('REJECTS a bogus public key (authorized_keys injection guard)', () => {
    expect(() =>
      generateFiles({
        ...sshBase,
        ssh: { enabled: true, username: 'opennova', password: '', publicKey: 'not-a-real-key' },
      }),
    ).toThrow(/valid OpenSSH key/i);
  });

  it('REJECTS enabling SSH with neither a password nor a key', () => {
    expect(() =>
      generateFiles({ ...sshBase, ssh: { enabled: true, username: 'opennova', password: '' } }),
    ).toThrow(/no password or public key/i);
  });
});
