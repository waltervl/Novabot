# Remote Support Tunnel — Design

**Goal:** give Ramon a controlled, auditable shell into a user's OpenNova
container (and, via that container, the user's mower) so he can
troubleshoot live issues without juggling jumphosts, port-forwards or
share-screen sessions.

**Trigger:** real demand — multiple users in one week needed mqtt_node /
pos.json / firmware diagnosis, every session began with 30 min of ssh
plumbing.

**Out of scope:** generic multi-tenant SaaS support (this is for Ramon
only); persistent VPN; mower-side shell daemon (mower is reached via the
container's existing ssh access).

---

## Architecture

Two WebSocket hops, relay sits in the middle:

```
┌─ Ramon's browser ─────┐    ┌─ Central relay ────────┐    ┌─ User's container ─────┐
│ Admin → Remote        │ WS │ opennova.ramon         │ WS │ /api/remote-support    │
│ Support tab           │◄──►│ vanbruggen.nl          │◄──►│ /agent (outbound)      │
│ Terminal (xterm.js)   │    │ Token broker + pipe    │    │ pty → /bin/bash (root) │
└───────────────────────┘    └────────────────────────┘    └────────────────────────┘
                                                              ↕
                                                            ssh root@<mower-ip>
```

User container opens an OUTBOUND WebSocket — no firewall punch needed.
Ramon's browser opens an INBOUND WebSocket to the same relay. The relay
identifies them as `agent <SN>` and `operator <SN>`, brokers the
approve handshake, then pipes raw bytes between the two for the lifetime
of the session.

The container has root on its own filesystem and already holds the
mower's ssh credentials (it does `read_map_files` etc. via custom-firmware
extended_commands.py), so Ramon reaches the mower from inside the shell
with `ssh root@<mower-ip>` the same way he does today.

---

## Components

### 1. User-side agent (`server/src/services/remoteSupportAgent.ts`)

Lives inside the user's OpenNova container.

- Reads `/data/.remote_support_enabled` flag (set by the admin toggle)
  on startup + on file change.
- When enabled, opens an outbound WSS to
  `wss://opennova.ramonvanbruggen.nl/api/remote-support/agent` with the
  mower SN + an HMAC-signed device token as auth.
- Holds the socket open (heartbeat every 20 s). Reconnects with backoff
  on drop.
- On receiving a `pending-request` frame from the relay:
  - Writes a one-shot notification into Socket.io so the admin tab shows
    a banner.
  - Waits up to 60 s for the user's `approve` / `deny` reply.
- On approve, spawns `/bin/bash -i` via `node-pty` (rows/cols from the
  approve message), wires pty.stdout/stderr → WS and WS → pty.stdin.
- Writes every byte (in + out) to
  `/data/remote-support-logs/<sn>-<iso>.log` for the user's later
  inspection.
- On any of {WS close, kill-button, hard 30-min timeout, agent disabled
  via toggle}, kills the pty + flushes the log + closes the socket.

### 2. Central relay (`server/src/routes/remoteSupportRelay.ts`)

Runs on `opennova.ramonvanbruggen.nl` (Ramon's own central instance, not
shipped to users).

- `GET /api/remote-support/agent` (WebSocket) — authenticates the agent
  by SN + signed token, registers in `agents: Map<sn, WebSocket>`.
- `GET /api/remote-support/operator/:sn` (WebSocket) — authenticated by
  Ramon's admin JWT. Sends `request-session` to the matching agent.
- Per-SN state machine: `IDLE → REQUESTED → APPROVED → ACTIVE → CLOSED`.
  Only one operator session at a time per SN.
- After approve: drops state-machine messages and forwards every byte
  verbatim between the two sockets.
- Closes both sides on disconnect, denial, hard timeout, or admin kill.
- Holds nothing in persistent storage — restart of the relay drops all
  in-flight sessions (safe, sessions are short-lived).

### 3. Ramon's operator UI (`server/src/routes/adminPage.ts` — new tab)

- "Remote Support" card with:
  - List of online agents (SN + last-seen ts) pulled from
    `GET /api/remote-support/active-agents`.
  - Input field to enter an SN manually (in case the agent only just
    connected and isn't in the list yet).
  - "Request Session" button → opens WS to
    `/api/remote-support/operator/:sn`, shows "Waiting for user
    approval…" until the relay reports the agent answered.
  - On approve: replaces the placeholder with an xterm.js terminal.
  - "End Session" button → closes the WS.

### 4. User's UI (`adminPage.ts`, same page, different card)

- "Remote Support" card mirrored on the user side:
  - Toggle "Allow Remote Support: ON / OFF" — writes
    `/data/.remote_support_enabled`.
  - Auto-off countdown — 4 hours after toggle ON, automatically flips
    OFF unless reset.
  - Banner on incoming request: "Ramon van Bruggen requests remote
    support" + Approve / Deny / Always-deny-30min buttons.
  - During an active session: live timer + big red "Kill Session"
    button.
  - Audit log viewer: list of `<sn>-<iso>.log` files with size + a
    download link.

---

## Data flow per session

```
T+0    User toggles ON                 agent opens outbound WS
T+1    User shares SN with Ramon       out-of-band (Discord / mail / etc.)
T+2    Ramon enters SN in admin        operator WS → relay → request-session
                                        frame → agent
T+3    Agent shows banner in admin     user clicks Approve
T+4    Agent spawns pty + sends ack    relay flips to ACTIVE, starts piping
T+5    Bytes flow in both directions   xterm.js renders, log file grows
…
T+30m  Hard timeout                    agent kills pty, both sides close
       OR user kills via red button
       OR Ramon ends session
```

---

## Security

- Outbound-only from the user side. No inbound port forwarding,
  no listener on the user's container.
- The agent's device-token is HMAC'd with a server-side secret
  (`REMOTE_SUPPORT_SECRET`) so a stolen agent URL alone can't be replayed.
- Approval is mandatory per session. The relay refuses to wire bytes
  until it receives the agent's `approve` frame.
- Default OFF for the agent. The toggle has to be explicitly enabled
  by the user; it auto-flips OFF after 4 hours so a "I forgot to turn it
  off" can't linger forever.
- Hard 30-minute session cap. Renewable only via a new request +
  approval, not by the operator unilaterally.
- Audit log is owned by the user — written to their disk, not
  forwarded to the central relay.
- Kill switch is a single button in the user's admin and an
  `/api/remote-support/kill` endpoint behind their JWT — works even if
  the operator is mid-keystroke.

---

## Schaal & dependencies

- `node-pty` — new npm dep. Already commonly used + has prebuilt
  binaries for arm64/amd64 (matches our docker target). Adds ~1 MB to
  the image.
- `xterm.js` + `xterm-addon-fit` — frontend deps loaded via CDN like
  Leaflet already is (no build-step change).
- `ws` — already in use by Socket.io; we use the same lib directly for
  the relay routes.
- No new DB tables. Agent registry is in-memory in the relay; tokens
  are signed not stored.
- Audit logs are plain text files under `/data/remote-support-logs/`,
  rotated by size (10 MB cap) and capped to 50 newest per SN.

---

## Testing

- **Unit:** state machine transitions (IDLE → REQUESTED → APPROVED →
  ACTIVE → CLOSED) with mock WebSockets, including timeout, deny, and
  disconnect paths.
- **Integration:** spin up an in-process relay + a mock agent + a mock
  operator, drive a full approve → byte-pipe → disconnect cycle, assert
  the bytes round-trip correctly and the audit log captured them.
- **Resize handling:** assert agent honours xterm resize events
  (`cols`/`rows` propagated to pty).
- **Manual smoke:** real session against a test container, run
  `ssh root@<test-mower-ip>` from inside, type a long-running command
  (`tail -f`), exit cleanly.

---

## Open follow-ups (out of scope for this spec)

- Email / push notification when the user's admin tab isn't open at
  request time. Punt — assume the user is at their machine when they
  ask for help.
- Multi-operator support (multiple support engineers). Not needed yet.
- Replay / playback of audit logs as an animated terminal. Nice-to-have
  but not a blocker.
