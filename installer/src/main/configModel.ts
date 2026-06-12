import type { InstallerConfig, GeneratedFiles } from '../shared/types.js';

/**
 * Single-quote a string for safe use in a POSIX shell. Wrap in single quotes; a
 * literal single quote becomes '\'' (close, escaped quote, reopen). This makes
 * user-supplied values (Wi-Fi password, SSID, hostname, ...) injection-proof
 * even when they legitimately contain a `'` — which Wi-Fi passwords often do.
 * The returned value INCLUDES the surrounding quotes.
 */
function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Restrict a timezone to the IANA-safe charset so it can be emitted into
 * unquoted YAML / env files without breaking them. Anything outside
 * [A-Za-z0-9_/+-] (e.g. `}`, `:`, `#`, `"`, whitespace, newlines) is stripped.
 */
function sanitizeTimezone(tz: string): string {
  return tz.replace(/[^A-Za-z0-9_/+-]/g, '');
}

/**
 * Validate Wi-Fi credentials BEFORE they are interpolated into the generated
 * first-boot script. The SSID/PSK are written verbatim into a quoted heredoc
 * (`<<'NMCONN'`); a newline — or the heredoc terminator alone on its own line —
 * in either value would close the heredoc early and turn the remainder into
 * shell commands that run as ROOT on first boot. So we reject control characters
 * (which covers CR/LF, and thus a terminator on its own line) and enforce the
 * 802.11/WPA limits. Throws on anything unsafe; the build surfaces the message.
 */
function assertSafeWifi(ssid: string, password: string, country: string): void {
  const control = /[\u0000-\u001f\u007f]/;
  if (control.test(ssid) || control.test(password)) {
    throw new Error('Wi-Fi SSID and password must not contain newlines or control characters.');
  }
  const ssidBytes = Buffer.byteLength(ssid, 'utf8');
  if (ssidBytes < 1 || ssidBytes > 32) {
    throw new Error('Wi-Fi SSID must be 1–32 bytes.');
  }
  const isHex64 = /^[0-9a-fA-F]{64}$/.test(password);
  if (!isHex64 && (password.length < 8 || password.length > 63)) {
    throw new Error('Wi-Fi password must be 8–63 characters (or a 64-character hex key).');
  }
  if (!/^[A-Za-z]{2}$/.test(country)) {
    throw new Error('Wi-Fi country must be a 2-letter code.');
  }
}

/**
 * Validate SSH account details BEFORE they are interpolated into the first-boot
 * script. The username is restricted to a strict POSIX charset so it is safe to
 * use UNQUOTED in filesystem paths (`/home/<user>/.ssh`). The password is piped
 * to `chpasswd` and the key is appended to `authorized_keys`, so both must be
 * single-line — a newline in either would break chpasswd or inject an extra
 * authorized_keys entry (with attacker-chosen options). Throws on anything unsafe.
 */
function assertSafeSsh(username: string, password: string, publicKey?: string): void {
  if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(username)) {
    throw new Error(
      'SSH username must start with a lowercase letter or _ and contain only lowercase letters, digits, - or _ (max 32 chars).',
    );
  }
  if (username === 'root') {
    throw new Error('SSH username cannot be root.');
  }
  const control = /[\u0000-\u001f\u007f]/;
  const hasPw = password.length > 0;
  const key = publicKey?.trim() ?? '';
  if (!hasPw && !key) {
    throw new Error('SSH is enabled but no password or public key was provided.');
  }
  if (hasPw) {
    if (control.test(password)) {
      throw new Error('SSH password must not contain newlines or control characters.');
    }
    if (password.length < 8) {
      throw new Error('SSH password must be at least 8 characters.');
    }
  }
  if (key) {
    if (control.test(key)) {
      throw new Error('SSH public key must be a single line without control characters.');
    }
    const keyRe =
      /^(ssh-ed25519|ssh-rsa|ssh-dss|ecdsa-sha2-nistp(256|384|521)|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com) [A-Za-z0-9+/=]+( \S.*)?$/;
    if (!keyRe.test(key)) {
      throw new Error('SSH public key is not a valid OpenSSH key line (e.g. "ssh-ed25519 AAAA... comment").');
    }
  }
}

/**
 * First-boot SSH setup. Returns the shell block that enables `sshd` and — when
 * the installer supplied SSH details — creates the login account. Returns an
 * empty string when SSH is explicitly disabled. Legacy callers that pass no
 * `ssh` block get ONLY the daemon enabled (the historical behaviour), so the
 * account-creation path is strictly additive.
 */
function sshSetup(cfg: InstallerConfig): string {
  const ssh = cfg.ssh;
  const enabled = ssh?.enabled ?? true;
  if (!enabled) {
    return '';
  }

  // Enable the daemon on the normal boot whenever SSH is on.
  let out = `# ── SSH access ───────────────────────────────────────────────────────────────
systemctl enable ssh 2>/dev/null || ln -sf /lib/systemd/system/ssh.service /etc/systemd/system/multi-user.target.wants/ssh.service 2>/dev/null || true
`;

  if (ssh) {
    assertSafeSsh(ssh.username, ssh.password, ssh.publicKey);
    const u = ssh.username; // validated charset → safe to interpolate unquoted in paths
    const hasPw = ssh.password.length > 0;
    const key = ssh.publicKey?.trim() ?? '';

    out += `id -u ${shQuote(u)} >/dev/null 2>&1 || useradd -m -s /bin/bash ${shQuote(u)}
for g in sudo users adm netdev plugdev; do usermod -aG "$g" ${shQuote(u)} 2>/dev/null || true; done
`;
    if (hasPw) {
      out += `printf '%s:%s\\n' ${shQuote(u)} ${shQuote(ssh.password)} | chpasswd
`;
    } else {
      // Key-only: lock the password so password auth can't log in with an empty secret.
      out += `passwd -l ${shQuote(u)} 2>/dev/null || true
`;
    }
    if (key) {
      out += `install -d -m 0700 /home/${u}/.ssh
printf '%s\\n' ${shQuote(key)} >> /home/${u}/.ssh/authorized_keys
chmod 600 /home/${u}/.ssh/authorized_keys
chown -R ${shQuote(u)}:${shQuote(u)} /home/${u}/.ssh
`;
    }
  }
  return out;
}

function composeYml(cfg: InstallerConfig): string {
  const dns = cfg.connectionPath === 'novabot-app'
    ? '      ENABLE_DNS: "true"\n      UPSTREAM_DNS: "1.1.1.1"\n'
    : '';
  return `services:
  opennova:
    image: rvbcrs/opennova:latest
    container_name: opennova
    restart: unless-stopped
    network_mode: host
    environment:
      TZ: \${TZ:-${sanitizeTimezone(cfg.timezone)}}
      PORT: 80
      DB_PATH: /data/novabot.db
      STORAGE_PATH: /data/storage
      FIRMWARE_PATH: /data/firmware
      ENABLE_TLS: "true"
      ENABLE_DASHBOARD: "true"
      ENABLE_MDNS: "true"
      TARGET_IP: \${TARGET_IP:?set TARGET_IP}
      RENDER_BASE_URL: "http://\${TARGET_IP}"
${dns}    volumes:
      - ./data:/data
`;
}

function envFile(cfg: InstallerConfig): string {
  return `TZ=${sanitizeTimezone(cfg.timezone)}\n`;
}

/**
 * The heavy, network-dependent OpenNova install. This is written to the rootfs
 * by `firstrun.sh` and run LATER by `opennova-setup.service` — AFTER the system
 * is fully up and online — NOT in the early first-boot init. So if the install
 * is slow or fails, it can never block or brick the boot: the Pi is reachable
 * regardless, and this just brings the container up when it can.
 */
function setupSh(cfg: InstallerConfig): string {
  return `#!/bin/bash
# OpenNova install — runs ONCE, after network-online.target (see the
# opennova-setup.service unit). NEVER put this in the first-boot init path.
exec >> /var/log/opennova-setup.log 2>&1
echo "=== opennova-setup started $(date -u 2>/dev/null) ==="

# Mirror the log onto the FAT boot partition so it is readable by simply popping
# the SD into any computer (no ext4 tooling needed) if something goes wrong.
BOOTDIR=/boot/firmware; [ -d "$BOOTDIR" ] || BOOTDIR=/boot
trap 'cp -f /var/log/opennova-setup.log "$BOOTDIR/opennova-setup.log" 2>/dev/null || true' EXIT

# network-online.target can fire before DNS/routing actually work (especially on
# Wi-Fi); wait until the Docker registry is genuinely reachable before starting.
for i in $(seq 1 30); do
  if curl -fsS --max-time 5 https://download.docker.com/ >/dev/null 2>&1; then break; fi
  echo "waiting for internet ($i/30)..."; sleep 10
done

set -ex
# Docker (official Debian repo)
apt-get update
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<SRC
Types: deb
URIs: https://download.docker.com/linux/debian
Suites: $(. /etc/os-release && echo "$VERSION_CODENAME")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
SRC
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

# OpenNova
install -d -o "$(logname 2>/dev/null || echo opennova)" /home/opennova/opennova/data || mkdir -p /home/opennova/opennova/data
cd /home/opennova/opennova
TARGET_IP="$(hostname -I | awk '{print $1}')"
printf 'TZ=%s\\nTARGET_IP=%s\\n' ${shQuote(sanitizeTimezone(cfg.timezone))} "$TARGET_IP" > .env
cat > docker-compose.yml <<'COMPOSE'
${composeYml(cfg)}COMPOSE
docker compose pull
docker compose up -d

# Mark complete so the oneshot never runs again on later boots.
install -d /var/lib/opennova && touch /var/lib/opennova/installed
echo "=== opennova-setup finished OK $(date -u 2>/dev/null) ==="
`;
}

/**
 * The systemd unit that runs {@link setupSh} once, after the network is online.
 * `Restart=on-failure` retries within the same uptime; the `installed` marker +
 * `ConditionPathExists=!` stop it re-running once it has succeeded.
 */
const SETUP_SERVICE = `[Unit]
Description=OpenNova first-boot installation (Docker + container)
After=network-online.target
Wants=network-online.target
ConditionPathExists=!/var/lib/opennova/installed

[Service]
Type=oneshot
ExecStart=/usr/local/lib/opennova/setup.sh
RemainAfterExit=yes
TimeoutStartSec=0
Restart=on-failure
RestartSec=120

[Install]
WantedBy=multi-user.target
`;

/**
 * The LIGHTWEIGHT first-boot script. It only does fast, local config (hostname,
 * Wi-Fi, SSH) and then installs the deferred {@link setupSh} service, so the
 * first boot ALWAYS completes. `set +e` + `exit 0` guarantee success, which lets
 * the firstboot `systemd.run_success_action=reboot` reboot cleanly into a normal
 * boot where `opennova-setup.service` takes over once the network is up.
 */
function firstrunSh(cfg: InstallerConfig): string {
  // Reject unsafe Wi-Fi credentials BEFORE interpolating them into the script.
  if (cfg.network.type === 'wifi') {
    assertSafeWifi(cfg.network.ssid, cfg.network.password, cfg.network.country);
  }
  // Write the NetworkManager connection profile FILE directly. `nmcli` needs the
  // NM daemon, which is NOT running in the early first-boot context, so it
  // silently fails there and Wi-Fi never gets configured. NM reads this keyfile
  // on the normal boot and connects. The SSID/PSK are written verbatim (keyfile
  // values are literal to end-of-line; no shell quoting applies inside the quoted
  // heredoc). `cfg80211.ieee80211_regdom`/raspi-config set the country so Wi-Fi
  // is not rfkill-blocked.
  const wifi = cfg.network.type === 'wifi'
    ? `install -d -m 0700 /etc/NetworkManager/system-connections
cat > /etc/NetworkManager/system-connections/opennova-wifi.nmconnection <<'NMCONN'
[connection]
id=opennova-wifi
type=wifi
interface-name=wlan0
autoconnect=true

[wifi]
mode=infrastructure
ssid=${cfg.network.ssid}

[wifi-security]
key-mgmt=wpa-psk
psk=${cfg.network.password}

[ipv4]
method=auto

[ipv6]
method=auto
NMCONN
chmod 600 /etc/NetworkManager/system-connections/opennova-wifi.nmconnection
raspi-config nonint do_wifi_country ${shQuote(cfg.network.country)} 2>/dev/null || true
`
    : '';
  return `#!/bin/bash
# LIGHTWEIGHT first-boot config — must ALWAYS let the boot complete. The heavy,
# network-dependent install is deferred to opennova-setup.service (runs after
# network-online.target), so it can never block or break the first boot.
exec > /var/log/opennova-firstrun.log 2>&1
set +e

hostnamectl set-hostname ${shQuote(cfg.hostname)} 2>/dev/null || echo ${shQuote(cfg.hostname)} > /etc/hostname
${wifi}
${sshSetup(cfg)}
# Install the deferred OpenNova setup service (runs after the network is up).
install -d /usr/local/lib/opennova
cat > /usr/local/lib/opennova/setup.sh <<'OPENNOVA_SETUP'
${setupSh(cfg)}OPENNOVA_SETUP
chmod +x /usr/local/lib/opennova/setup.sh
cat > /etc/systemd/system/opennova-setup.service <<'OPENNOVA_UNIT'
${SETUP_SERVICE}OPENNOVA_UNIT
ln -sf /etc/systemd/system/opennova-setup.service /etc/systemd/system/multi-user.target.wants/opennova-setup.service 2>/dev/null || true

# CRITICAL: remove the first-boot hook so the NEXT boot is a normal boot. The
# systemd.run mechanism does NOT clean up after itself — without this the Pi
# re-runs firstrun.sh and reboots on EVERY boot (a boot loop). This mirrors
# exactly what Raspberry Pi Imager's own firstrun.sh does.
rm -f /boot/firmware/firstrun.sh
sed -i 's| systemd[.][^ ]*||g' /boot/firmware/cmdline.txt

exit 0
`;
}

// On Bookworm/Trixie the FAT boot partition is mounted at /boot/firmware, so the
// first-boot script lives there at runtime — this matches the path Raspberry Pi
// Imager itself writes. (Older releases used /boot.)
const CMDLINE_APPEND =
  ' systemd.run=/boot/firmware/firstrun.sh systemd.run_success_action=reboot init=/usr/lib/raspberrypi-sys-mods/firstboot';

export function generateFiles(cfg: InstallerConfig): GeneratedFiles {
  return {
    firstrunSh: firstrunSh(cfg),
    envFile: envFile(cfg),
    composeYml: composeYml(cfg),
    cmdlineAppend: CMDLINE_APPEND,
  };
}
