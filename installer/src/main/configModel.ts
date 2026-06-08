import type { InstallerConfig, GeneratedFiles } from '../shared/types.js';

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
      TZ: \${TZ:-${cfg.timezone}}
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
  return `TZ=${cfg.timezone}\n`;
}

function firstrunSh(cfg: InstallerConfig): string {
  const wifi = cfg.network.type === 'wifi'
    ? `nmcli connection add type wifi ifname wlan0 con-name opennova-wifi ssid '${cfg.network.ssid}' \\
  802-11-wireless-security.key-mgmt wpa-psk 802-11-wireless-security.psk '${cfg.network.password}' || true
raspi-config nonint do_wifi_country '${cfg.network.country}' || true
nmcli connection up opennova-wifi || true
`
    : '';
  return `#!/bin/bash
set -e
exec > /var/log/opennova-firstrun.log 2>&1
hostnamectl set-hostname '${cfg.hostname}' || true
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
printf 'TZ=%s\\nTARGET_IP=%s\\n' '${cfg.timezone}' "$TARGET_IP" > .env
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
