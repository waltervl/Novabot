# App — Stop button during mowing

Status: design approved 2026-05-28

## Problem

While the mower is actively mowing, the action row in the home screen only offers **Pause** and **Home**. Home opens a dialog with two options ("End task & return" and "Pause & return"); both end the session and immediately dock the mower. There is no way to simply *halt the current session in place* without sending the mower back to the charger.

User wants: a third button that aborts the running session — blades off, mower stops where it is, session discarded so it cannot be resumed, but a fresh mowing session can be started afterwards.

## Solution

Add a red **Stop** button between Pause and Home in the `displayActivity === 'mowing'` action row in `app/src/screens/HomeScreen.tsx`.

### Behaviour

1. Tap → confirmation alert (destructive style):
   - Title: `stopMowing` — "Stop mowing?"
   - Body: `stopMowingDesc` — "The mower will halt where it is, blades will stop, and the current session ends. The mower won't return to the dock. You can start a new session afterwards."
   - Buttons: `cancel` + `stop` (destructive)

2. On confirm, send (in this order):
   - `stop_navigation { cmd_num }` — cancels the coverage task in `coverage_planner_server`, stops blades, drops session state so `resume_navigation` is no longer valid. Firmware transitions to IDLE.
   - `stop_boundary_follow` extended command — defensive cleanup of any lingering edge-cut goal handle (mirrors the existing "End task & return" path at `HomeScreen.tsx:2183`).

3. `setOptimisticActivity('idle')` so the UI immediately swaps to the idle action row (Start button visible).

### Out of scope (deliberate)

- **No `clear_error`** — clearing errors mid-session can hide a meaningful condition (e.g. PIN lock 151). The long-pause recovery flow needs it; a normal stop does not.
- **No `quit_mapping_mode`** — only relevant when stuck in mapping/error state.
- **No `go_pile` / `go_to_charge`** — that is exactly what we want to avoid; "End task & return" already covers the dock-me-back use case.

## Files touched

| File | Change |
|------|--------|
| `app/src/screens/HomeScreen.tsx` | Insert third `TouchableOpacity` in the mowing action row; new `onPress` with confirm + `stop_navigation` + `stop_boundary_follow`. Replace the existing "Stop-knop weggelaten" comment (regels 2162-2165) with a brief note explaining the new button. |
| `app/src/i18n/en.ts` | Add `stopMowing`, `stopMowingDesc`. (`stop` and `cancel` already exist.) |
| `app/src/i18n/nl.ts` | Same keys, Dutch. |
| `app/src/i18n/de.ts` | Same keys, German. |
| `app/src/i18n/fr.ts` | Same keys, French. |

No new types, no API client changes, no server changes, no firmware changes.

## Why this is safe

- `stop_navigation` is already invoked from five other places in `HomeScreen.tsx` (returning state, long-pause stop, error recovery). It is a well-understood, idempotent command documented in `docs/reference/MOWING-FLOW.md:89`.
- Confirmation popup prevents accidental mistaps mid-session.
- Optimistic UI flip to `idle` is reverted automatically by the next `report_state_robot` if the firmware does not actually go to IDLE — same pattern as the existing pause/home buttons.

## Verification plan

Manual test on Alain's mower (LFIN1231000211) via Expo hot reload:

1. Start mow session from idle.
2. Once `displayActivity === 'mowing'`, confirm three buttons visible (Pause / Stop / Home).
3. Tap Stop → confirm popup appears.
4. Tap Cancel → no command sent, state unchanged.
5. Restart, tap Stop → confirm → verify:
   - blades stop within ~1s
   - mower halts in place (no return-to-dock motion)
   - UI flips to idle action row
   - `resume_navigation` is no longer offered (no paused state)
   - Start button works → new session begins normally
6. Repeat with edge-cutting active to confirm `stop_boundary_follow` defensive cleanup does not regress edge-cut stop.

## Layout note

`styles.actionRow` lays out `styles.actionButton` children with `flex: 1`. Adding a third button divides the row into thirds automatically — verify visually during implementation; no style edits expected.
