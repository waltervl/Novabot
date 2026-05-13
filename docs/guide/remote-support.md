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
