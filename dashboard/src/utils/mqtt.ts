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
 * Map work-map index to firmware area enum used by start_navigation.area.
 * App pattern: idx 0 → 1, idx 1 → 10, idx 2+ → 200 (catch-all).
 */
export function workIndexToArea(idx: number): number {
  if (idx === 0) return 1;
  if (idx === 1) return 10;
  return 200;
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

/** Sequential cmd number used by start/stop_navigation. */
export function nextCmdNum(): number {
  return Date.now() % 100000;
}
