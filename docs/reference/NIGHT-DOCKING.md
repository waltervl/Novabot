# Night-docking — ArUco dock LED brightness (AUTHORITATIVE)

## Problem

The mower docks by driving toward an ArUco marker on the charging station, seen
through its front camera (`auto_recharge_server`). In the dark the marker is
invisible unless the mower's own approach LED is bright enough. At the stock
setting the auto-dock fails at night: the mower circles, gives up, and reports a
docking failure.

This is not cosmetic. A failed auto-dock cascades into issue #30: the firmware's
own auto-continue-after-recharge (`RobotDecision::coverContinueDeal`) only fires
after a **proper `AutoCharging` dock**. If the user rescues a stranded mower by
pushing it onto the dock manually, the AutoCharging action never runs, so the
firmware never auto-resumes the interrupted coverage. See
`research/documents/firmware-auto-continue-after-recharge.md`.

## The knob

```
install/automatic_recharge/share/automatic_recharge/launch/automatic_recharge_launch.py
  "brightness_adjustment_value": 1     ← stock (too dim for night)
  "brightness_adjustment_value": 255   ← fix (full brightness)
```

Range is 0..255. The node reads this parameter **at launch** (via
`/tmp/launch_params_<hash>`), not at runtime, so a change only takes effect after
`auto_recharge_server` is restarted (a reboot is the simplest trigger).

## Why it kept reverting

Every OEM OTA re-extracts the stock launch file and resets the value to `1`. Hand
edits on the mower did not survive. The durable fix is to bake it into our custom
firmware build so every custom OTA ships `255`.

## The durable fix

`research/build_custom_firmware.sh` patches the value to `255` at build time
(section "Night-docking fix"), right after the log_manager URL rewrite:

```bash
RECHARGE_LAUNCH="$NOVABOT_ROOT/install/automatic_recharge/share/automatic_recharge/launch/automatic_recharge_launch.py"
sed -i '' 's/"brightness_adjustment_value": 1,/"brightness_adjustment_value": 255,/g' "$RECHARGE_LAUNCH"
rm -f .../launch/__pycache__/*.pyc   # drop stale bytecode so the launch is re-read
```

Because it is applied to the extracted firmware root before repackaging into the
custom `.deb`, every custom firmware flash carries the fix and it survives OTA.

## Applying to a running mower right now (interim)

Until a mower gets a fresh custom-firmware flash, set it live:

```bash
F=/root/novabot/install/automatic_recharge/share/automatic_recharge/launch/automatic_recharge_launch.py
sed -i 's/"brightness_adjustment_value": 1,/"brightness_adjustment_value": 255,/g' "$F"
rm -f /root/novabot/install/automatic_recharge/share/automatic_recharge/launch/__pycache__/*.pyc
# effective after auto_recharge_server restart / reboot
```

Applied live on LFIN2230700238 (.244) and LFIN1231000211 (.100) on 2026-07-02.

## Verify

```bash
grep -o 'brightness_adjustment_value": [0-9]*' \
  /root/novabot/install/automatic_recharge/share/automatic_recharge/launch/automatic_recharge_launch.py
# expect: brightness_adjustment_value": 255
```

**Always re-check after an OEM OTA** — if it reads `1` again, the mower was flashed
with stock firmware and needs the custom build.
