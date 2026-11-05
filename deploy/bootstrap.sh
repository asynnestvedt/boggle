#!/bin/sh
set -eu

# Run as root on a fresh Ubuntu 24.04 instance after uploading /tmp/woggle.tar.gz.
# DNS for this hostname must point at the instance before Caddy can issue a certificate.
hostname="${1:?Pass the public game hostname}"
case "$hostname" in *[!a-zA-Z0-9.-]*|'') echo 'Invalid hostname' >&2; exit 1;; esac
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends ca-certificates curl xz-utils caddy ufw
if [ ! -x /opt/woggle-node/bin/node ]; then
    curl -fsSL https://nodejs.org/dist/v22.15.0/node-v22.15.0-linux-x64.tar.xz -o /tmp/woggle-node.tar.xz
    mkdir -p /opt/woggle-node
    tar -xJf /tmp/woggle-node.tar.xz -C /opt/woggle-node --strip-components=1
    rm /tmp/woggle-node.tar.xz
fi
id woggle >/dev/null 2>&1 || useradd --system --home /var/lib/woggle --shell /usr/sbin/nologin woggle
mkdir -p /opt/woggle /var/lib/woggle
tar -xzf /tmp/woggle.tar.gz -C /opt/woggle
cd /opt/woggle
PATH="/opt/woggle-node/bin:$PATH" npm ci --omit=dev --no-audit --no-fund
chown woggle:woggle /var/lib/woggle
chmod 700 /var/lib/woggle
if [ ! -f /etc/woggle.env ]; then
    cat > /etc/woggle.env <<EOF
NODE_ENV=production
PORT=3000
APP_URL=https://$hostname
DATA_DIR=/var/lib/woggle
TRUST_PROXY_HOPS=1
RESET_EMAIL_DISABLED=true
EOF
    chmod 600 /etc/woggle.env
fi
cat > /etc/systemd/system/woggle.service <<'EOF'
[Unit]
Description=Woggle game server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=woggle
Group=woggle
WorkingDirectory=/opt/woggle
EnvironmentFile=/etc/woggle.env
ExecStart=/opt/woggle-node/bin/node /opt/woggle/server/index.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/woggle

[Install]
WantedBy=multi-user.target
EOF
cat > /etc/caddy/Caddyfile <<EOF
$hostname {
    reverse_proxy 127.0.0.1:3000
}
EOF
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
systemctl daemon-reload
systemctl enable --now woggle
systemctl enable caddy
systemctl restart caddy
systemctl is-active woggle
