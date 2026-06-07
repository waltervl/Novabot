#!/usr/bin/env bash
# rs-exec.sh — run ONE shell command inside a user's OpenNova container via the
# remote-support relay (the "option B" exec endpoint), self-authenticated.
#
#   Usage:  tools/remote-support/rs-exec.sh <SN> "<shell command>"
#   Env:    RELAY_URL   relay base URL (default http://192.168.0.247:8080)
#           TIMEOUT_MS  per-command timeout, 1000..60000 (default 55000)
#
# Auth (full story in docs/reference/REMOTE-EXEC-CLI.md):
#   POST /api/remote-support/operator/:sn/exec is admin-JWT gated (isOperator =
#   userRepo.isAdmin). We MINT an admin JWT locally from data/.jwt_secret + the
#   admin row in data/novabot.db. That token validates on .247 because .247 runs
#   the SAME jwt secret + admin account as this repo's data dir (migration copy).
#   No token needs to be pasted by anyone.
#
# Requirements for the target to answer:
#   - The user toggled Remote Support ON  → their container's agent is dialed
#     into the relay (toggle == consent). Verify with rs-agents.sh first.
#   - exec runs in the SERVER CONTAINER (node:20-alpine), NOT on the mower.
#     Container has: bash, sqlite3, ssh, sshpass, ping, nc  — but NO curl.
#     To reach the user's MOWER, ssh from the container:
#       sshpass -p 'novabot' ssh -o StrictHostKeyChecking=no root@<mower-ip>
#     (mower IP: device_registry.last_ip in the container DB, e.g. David =
#      192.168.10.196; charger 192.168.10.124.)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SN="${1:?usage: rs-exec.sh <SN> \"<command>\"}"
CMD="${2:?usage: rs-exec.sh <SN> \"<command>\"}"
RELAY_URL="${RELAY_URL:-http://192.168.0.247:8080}"
TIMEOUT_MS="${TIMEOUT_MS:-55000}"

ADMIN_UID="$(sqlite3 "$ROOT/data/novabot.db" "SELECT app_user_id FROM users WHERE is_admin=1 ORDER BY id LIMIT 1;")"
ADMIN_EMAIL="$(sqlite3 "$ROOT/data/novabot.db" "SELECT email FROM users WHERE is_admin=1 ORDER BY id LIMIT 1;")"
TOKEN="$(node -e '
const jwt=require(process.argv[1]+"/server/node_modules/jsonwebtoken");
const fs=require("fs");
const secret=(process.env.JWT_SECRET||fs.readFileSync(process.argv[1]+"/data/.jwt_secret","utf8")).trim();
process.stdout.write(jwt.sign({userId:process.argv[2],email:process.argv[3]},secret,{expiresIn:"30d"}));
' "$ROOT" "$ADMIN_UID" "$ADMIN_EMAIL")"

BODY="$(node -e 'process.stdout.write(JSON.stringify({command:process.argv[1],timeoutMs:Number(process.argv[2])}))' "$CMD" "$TIMEOUT_MS")"

curl -s -m $(( TIMEOUT_MS/1000 + 12 )) -X POST "$RELAY_URL/api/remote-support/operator/$SN/exec" \
  -H "Authorization: $TOKEN" -H 'content-type: application/json' -d "$BODY" \
| node -e 'let d="";process.stdin.on("data",x=>d+=x).on("end",()=>{try{const j=JSON.parse(d);
    if(j.ok===false){process.stderr.write("[REQ-ERR] "+(j.error||d)+"\n");process.exit(2)}
    if(j.stdout)process.stdout.write(j.stdout);
    if(j.stderr)process.stderr.write("[stderr] "+j.stderr+"\n");
    if(j.timedOut)process.stderr.write("[TIMED OUT after "+'"$TIMEOUT_MS"'+"ms]\n");
    process.exit(j.code||0);
  }catch(e){process.stdout.write(d);process.exit(0)}})'
