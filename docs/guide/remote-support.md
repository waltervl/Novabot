# Remote Support Setup

Ramon can shell into a user's OpenNova container (and from there to their mower)
with explicit per-session approval. This page documents how to enable both sides.

## On Ramon's central instance (opennova.ramonvanbruggen.nl)

Generate a shared secret:

    openssl rand -base64 32

Add to the central instance `.env`:

    REMOTE_SUPPORT_RELAY_ENABLED=true
    REMOTE_SUPPORT_SECRET=<paste secret>

Restart the container. The "Remote Support — Operator" card appears in the
admin page when the flag is on.

## On user containers

Add to their `.env`:

    REMOTE_SUPPORT_ENABLED=true
    REMOTE_SUPPORT_RELAY_URL=wss://opennova.ramonvanbruggen.nl/api/remote-support/agent
    REMOTE_SUPPORT_SECRET=<paste same secret as the central instance>

The secret is shared so the central relay can verify HMAC tokens signed by user
containers. Don't commit the `.env` to git.

## Per-session flow

1. User toggles "Allow Remote Support" ON in their admin page. The flag
   auto-flips OFF after 4 hours.
2. User shares their mower SN with Ramon out-of-band.
3. Ramon enters the SN on the operator card and clicks "Request Session".
4. The user's admin page shows an "Approve / Deny" banner. On Approve, a bash
   session opens in Ramon's browser.
5. Either side can hit the kill button. The session auto-closes after 30
   minutes regardless.
6. Every byte (in + out) is written to
   `/data/remote-support-logs/<sn>-<iso>.log` on the user's disk for their
   own inspection.

Automated coverage: the in-process e2e test
`server/src/__tests__/integration/remoteSupportE2E.test.ts` exercises the
agent → request → approve → byte-pipe path end-to-end against a mocked relay
hub. The runbook below covers what the automated test can't reach: a real pty
backed by the `node-pty` native binary, a real two-process TCP path between
agent and relay, the real browser xterm.js terminal, the on-disk audit log,
and the 30-minute hard-timeout.

## Manual smoke test runbook

Run this once after any change that touches `remoteSupport*` modules, the
audit-log writer, the relay hub, or the operator/admin UI. Each step builds
on the previous one — don't skip ahead.

### 1. Two-container local smoke

Goal: confirm a relay instance and an agent instance running on a single
machine can complete a full session.

Open two terminals from the repo root.

Terminal A — relay (operator side):

    cd server
    PORT=3000 \
    REMOTE_SUPPORT_RELAY_ENABLED=true \
    REMOTE_SUPPORT_SECRET=smoketest-secret \
    npm run dev

Terminal B — agent (user side):

    cd server
    PORT=3001 \
    REMOTE_SUPPORT_ENABLED=true \
    REMOTE_SUPPORT_RELAY_URL=ws://localhost:3000/api/remote-support/agent \
    REMOTE_SUPPORT_SECRET=smoketest-secret \
    npm run dev

In the agent instance admin page (`http://localhost:3001/admin`), toggle
"Allow Remote Support" ON. Confirm the flag persists on refresh.

In the relay instance admin page (`http://localhost:3000/admin`), find the
"Remote Support — Operator" card. Enter the mower SN from the agent DB and
click "Request Session".

The agent admin page should display the approve banner within a couple of
seconds. Click "Approve". A bash terminal should open in the operator
browser tab. Type `whoami` and `pwd` and confirm output renders.

### 2. Kill switch verification

While the session from step 1 is still live, click "Kill" on the **user**
(agent) side. The operator browser must show `[session closed]` (or the
equivalent terminal-closed message) within ~1s and stop accepting input.

Repeat with the kill button on the operator side and confirm the agent UI
flips the banner back to idle.

### 3. Audit log verification

Start a fresh session (repeat step 1 if needed). On the operator side type a
known string, e.g. `echo audit-marker-123`. Close the session.

On the agent host:

    ls -lt /data/remote-support-logs/ | head

Open the newest log file. Confirm:

- Lines prefixed with `<<` show operator keystrokes (`echo audit-marker-123`).
- Lines prefixed with `>>` show the pty's reply (the echoed text and the
  output `audit-marker-123`).
- The file ends with a `[session closed]` marker including a reason.

### 4. Hard-timeout verification

Start a fresh session and **do not** type anything on either side. Leave both
browser tabs open. After 30 minutes, both UIs must close the terminal on
their own. The newest audit log entry must contain
`reason=timeout` (or the equivalent label emitted by the close path).

If you don't want to wait 30 minutes during ad-hoc testing, temporarily set
`REMOTE_SUPPORT_SESSION_TIMEOUT_MS=60000` on the agent before `npm run dev`
and re-verify with a 1-minute timeout. Revert the override before the
sign-off below.

### 5. Sign-off

After all four checks pass on the same build, append a dated line to this
document under a `### Sign-off log` heading near the bottom, like so:

    - 2026-05-13 — Ramon — commit <sha> — all four checks green on macOS.

That history makes it obvious when remote-support last had a real-world run
rather than just unit-test coverage.

### Sign-off log

_(append entries above; oldest first)_
