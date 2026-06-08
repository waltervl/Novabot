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

function firstrunSh(cfg: InstallerConfig): string {
  const wifi = cfg.network.type === 'wifi'
    ? `nmcli connection add type wifi ifname wlan0 con-name opennova-wifi ssid ${shQuote(cfg.network.ssid)} \\
  802-11-wireless-security.key-mgmt wpa-psk 802-11-wireless-security.psk ${shQuote(cfg.network.password)} || true
raspi-config nonint do_wifi_country ${shQuote(cfg.network.country)} || true
nmcli connection up opennova-wifi || true
`
    : '';
  return `#!/bin/bash
set -e
exec > /var/log/opennova-firstrun.log 2>&1
hostnamectl set-hostname ${shQuote(cfg.hostname)} || true
${wifi}
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
systemctl enable docker

# OpenNova
install -d -o "$(logname 2>/dev/null || echo opennova)" /home/opennova/opennova/data || mkdir -p /home/opennova/opennova/data
cd /home/opennova/opennova
TARGET_IP="$(hostname -I | awk '{print $1}')"
printf 'TZ=%s\\nTARGET_IP=%s\\n' ${shQuote(sanitizeTimezone(cfg.timezone))} "$TARGET_IP" > .env
cat > docker-compose.yml <<'COMPOSE'
${composeYml(cfg)}COMPOSE
docker compose pull
docker compose up -d
`;
}

const CMDLINE_APPEND =
  ' systemd.run=/boot/firstrun.sh systemd.run_success_action=reboot init=/usr/lib/raspberrypi-sys-mods/firstboot';

export function generateFiles(cfg: InstallerConfig): GeneratedFiles {
  return {
    firstrunSh: firstrunSh(cfg),
    envFile: envFile(cfg),
    composeYml: composeYml(cfg),
    cmdlineAppend: CMDLINE_APPEND,
  };
}
