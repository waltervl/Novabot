# Firmware auto-continues coverage after recharge — AUTHORITATIVE (binary-verified)

**Status: PROVEN from the robot_decision binary + live logs + the stock-app blutter
decompile. Do not re-litigate this. If you think "the server has to resume the
mower after charging", you are wrong — read this first.**

Verified 2026-07-02 against the live binary on LFIN2230700238
(`/root/novabot/install/compound_decision/lib/compound_decision/robot_decision`,
6.3 MB, non-stripped, symbols present) and the stock Novabot app v2.4.0 blutter
decompile (`research/blutter_output_v2.4.0`).

## TL;DR

The **firmware itself** leaves the dock and resumes the coverage task once the
battery is full again — there is **no** cloud/server/app command needed for the
normal case. The stock app additionally exposes a **manual** "Continue" button.
Our server-side `autoResume.ts` is a **redundant re-implementation** of the manual
path and is being removed.

## The firmware auto-continue path (binary evidence)

`RobotDecision::coverContinueDeal()` (symbol `_ZN13RobotDecision17coverContinueDealEv`,
addr `0x93b68`) internally calls:

- `RobotDecision::quitPileDeal()` (`0x87a00`) — **leave the charging pile**
- `RobotDecision::coverStartDeal()` (`0x91a28`) — **restart the coverage task**
  (the `navigate_through_coverage_paths` NTCP action)
- `RobotDecision::updateWorkStatus(56, …)` — set work_status 56 = "continue status"

It is **battery-gated inside the function**: it logs either
`"Cover task continue, power: %d%%"` (proceeds) or
`"Power is poor, please charging and start again after enough power!"` (aborts).
The threshold is `full_battery_power: 96` in
`install/compound_decision/share/compound_decision/config/robot_decision.yaml`
(`low_battery_power: 20` is the return threshold).

### Who calls it — internal monitors, NOT an MQTT command

`bl 0x93b68 <coverContinueDeal>` cross-references (objdump) resolve to these
callers, all of which are internal state-machine loops driven by the mower's own
state, not by an incoming Dart/Send_mqtt command:

- `RobotDecision::monitorCoverageWorking()` (`0x95d00`)
- `RobotDecision::checkSystemStatus()` (`0x95fd0`) — gates on work_status `0x88`
  (136) + a state byte at object offset `+0x384 == 0xf`, then calls continue
- `RobotDecision::executeTaskLoop()` (`0x96210`)
- `RobotDecision::monitorErrorStatus()` (`0x94990`)
- `RobotDecision::monitorErrorHandle()` (`0x95118`)

### Live-log proof

`robot_decision_*.log` on LFIN2230700238 shows `coverContinueDeal`'s own log line
firing with no preceding app command, e.g.:

```
[..] Mode:COVERAGE Work:QUIT_PILE_INIT Prev work:RECOVER_ERROR_STOP Recharge: WAIT
[..] Cover task continue, power: 97%
```

(Here it is recovering from an error/slip; the same function is the recharge
auto-continue path — the battery gate + `quitPileDeal`+`coverStartDeal` are shared.)

## The hard precondition — a PROPER AutoCharging dock

The continue only becomes reachable after the mower **docks via the
`automatic_recharge_msgs::action::AutoCharging` action** and the result callback
runs:

- `RobotDecision::chargingResultCallback(...)` (`0x6a330`)
- `RobotDecision::rechargeFinishedDeal()` (`0x8cfa0`) — "Deal with recharge finished event"

These set the internal state (the `+0x384` / recharge flags) that the monitor
loops check before calling `coverContinueDeal`. **A manual push onto the dock does
NOT run the AutoCharging action**, so `rechargeFinishedDeal` never fires, the state
is never set, and the firmware never auto-continues. This is the root of issue #30
(see below).

## The stock app (blutter decompile) — a MANUAL override only

In `flutter_novabot/pages/home_page/view/mower_status/online_view.dart`:

- `_clickContinue()` (offset ~1544) sends `"resume_navigation"` (PP string
  `pp+0x45a28`) — the manual "Continue" button, shown based on work_status.
- Firmware MQTT handler for it: `"Receiving  cov continue command!!!"`.

So the app does **not** drive the auto-resume; it only offers a manual button. The
auto-resume is entirely the firmware's job.

## Issue #30 (mower "forgot" it had more to mow after a battery recharge)

1. Battery hit `low_battery_power` (20%) mid-coverage → firmware drove to the dock.
2. **Auto-dock failed in the dark** — the ArUco dock-approach LED was at the stock
   `brightness_adjustment_value: 1`, so the camera couldn't see the dock marker.
3. User pushed the mower onto the dock manually → the `AutoCharging` action never
   ran → `rechargeFinishedDeal` never fired → the continue-precondition state was
   never set → `coverContinueDeal` never fired → no auto-continue.
4. App showed "Start" (no resumable state) → user tapped it → fresh
   `start_navigation` → coverage planner reset → map shows "nothing cut".

**Fix = night-docking, not a resume feature.** LED brightness `1 → 255` is now baked
into `research/build_custom_firmware.sh` (survives OTA) and applied live on
LFIN2230700238 + LFIN1231000211. With a working auto-dock, the firmware's own
auto-continue takes over. See `docs/reference/NIGHT-DOCKING.md`.

## Consequence for the codebase

`server/src/services/autoResume.ts` re-implemented the manual `resume_navigation`
path server-side (detecting dock + battery ≥ threshold from the msg field). Its
header comment claimed "stock OEM firmware … does NOT auto-leave the dock after
charging" — that claim is **false** (this document is the disproof). It is
redundant with the firmware and is being removed; the manual app button remains as
the user override.
