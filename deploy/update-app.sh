#!/bin/sh
set -eu
export PATH="/opt/woggle-node/bin:$PATH"
archive="${1:?Pass an application archive}"
release=$(mktemp -d /opt/woggle-release-XXXXXXXX)
tar -xzf "$archive" -C "$release"
cd "$release"
npm ci --omit=dev --no-audit --no-fund
chmod -R go-w "$release"
node --check server/index.js
node --check server/lib/letterlight.js
install -d -m 700 /var/backups/woggle
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="/var/backups/woggle/boggle-$stamp.sqlite"
node -e 'const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync("/var/lib/woggle/boggle.sqlite");db.exec("PRAGMA busy_timeout=5000");db.exec("VACUUM INTO " + "\x27" + process.argv[1].replaceAll("\x27", "\x27\x27") + "\x27");db.close()' "$backup"
chmod 600 "$backup"
systemctl stop woggle
previous="/opt/woggle-previous-$stamp"
mv /opt/woggle "$previous"
mv "$release" /opt/woggle
if ! systemctl start woggle || ! systemctl is-active --quiet woggle; then
    systemctl stop woggle || true
    mv /opt/woggle "/opt/woggle-failed-$stamp"
    mv "$previous" /opt/woggle
    systemctl start woggle
    echo 'Update failed; the previous app was restored.' >&2
    exit 1
fi
echo "Service active; database backup: $backup; previous release: $previous"
