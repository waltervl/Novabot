/**
 * MQTT command helpers — mirrors the OpenNova mobile app's payload conventions exactly.
 *
 * Reference: app/src/components/StartMowSheet.tsx, app/src/screens/HomeScreen.tsx
 */

/**
 * Convert user-facing cm value (3..9) to the firmware wire enum (0..7)
 * accepted by start_navigation.cutterhigh and start_run.cutterhigh.
 *
 * Per CLAUDE.md cutting-height-mapping: cutterhigh = cm − 2.
 * Clamps to 0..7. mm input: divide by 10 first.
 */
export function cmToCutterhigh(cm: number): number {
  return Math.min(7, Math.max(0, Math.round(cm) - 2));
}

export function mmToCutterhigh(mm: number): number {
  return cmToCutterhigh(Math.round(mm / 10));
}

/**
 * Map a work-map slot to the firmware `area` weight: slot N → 10^N
 * (map0=1, map1=10, map2=100). `area` is a DECIMAL POSITIONAL BITMASK — the
 * firmware (robot_decision) mows every map whose decimal digit is non-zero, so
 * multiple maps sum (11 = map0+map1, 111 = all three) and mow in one task with
 * no docking between zones. Proof: research/documents/multi-map-area-bitmask-decode.md.
 * (Was idx 2+ → 200, which was wrong — map2 is 100.)
 * ponytail: slots 0-9 only (10^slot must fit uint32); real setups have ≤3 maps.
 */
export function workIndexToArea(idx: number): number {
  return Math.pow(10, Math.max(0, idx));
}

export function workMapSlotIndex(
  map: { canonicalName?: string | null } | null | undefined,
  fallbackIdx: number,
): number {
  const match = map?.canonicalName?.match(/^map(\d+)(?:$|[_t])/);
  if (match) return parseInt(match[1], 10);
  return Math.max(0, fallbackIdx);
}

export function workMapToArea(
  map: { canonicalName?: string | null } | null | undefined,
  fallbackIdx: number,
): number {
  return workIndexToArea(workMapSlotIndex(map, fallbackIdx));
}

/**
 * Bitmask `area` for a set of selected work maps: sum of each map's 10^slot.
 * One start_navigation with this value mows them all natively (see workIndexToArea).
 */
export function workMapsToArea(
  maps: Array<{ canonicalName?: string | null }>,
): number {
  return maps.reduce((sum, m, idx) => sum + workMapToArea(m, idx), 0);
}

/** Sequential cmd number used by start/stop_navigation. */
export function nextCmdNum(): number {
  return Date.now() % 100000;
}
