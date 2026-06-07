#!/usr/bin/env bash
# rs-agents.sh — list the OpenNova containers currently dialed into the relay
# (i.e. users who toggled Remote Support ON). Self-authenticated, same admin-JWT
# mint as rs-exec.sh. See docs/reference/REMOTE-EXEC-CLI.md.
#
#   Usage:  tools/remote-support/rs-agents.sh
#   Env:    RELAY_URL  (default http://192.168.0.247:8080)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RELAY_URL="${RELAY_URL:-http://192.168.0.247:8080}"
ADMIN_UID="$(sqlite3 "$ROOT/data/novabot.db" "SELECT app_user_id FROM users WHERE is_admin=1 ORDER BY id LIMIT 1;")"
ADMIN_EMAIL="$(sqlite3 "$ROOT/data/novabot.db" "SELECT email FROM users WHERE is_admin=1 ORDER BY id LIMIT 1;")"
TOKEN="$(node -e '
const jwt=require(process.argv[1]+"/server/node_modules/jsonwebtoken");
const fs=require("fs");
const secret=(process.env.JWT_SECRET||fs.readFileSync(process.argv[1]+"/data/.jwt_secret","utf8")).trim();
process.stdout.write(jwt.sign({userId:process.argv[2],email:process.argv[3]},secret,{expiresIn:"30d"}));
' "$ROOT" "$ADMIN_UID" "$ADMIN_EMAIL")"
curl -s -m 15 -H "Authorization: $TOKEN" "$RELAY_URL/api/remote-support/active-agents"
echo
