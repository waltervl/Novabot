/**
 * Pure selector for the object-detection cadence level driven from the existing
 * `obstacle_avoidance_sensitivity` setting (1 = off, 2 = occasional, 3 = frequent).
 * Side-effect-free so it can be unit-tested without the mapSync/broker graph,
 * mirroring `coveragePlannerRadius.ts` / `paraRepush.ts`.
 */
export const OBSTACLE_DETECTION_KEY = 'obstacle_avoidance_sensitivity';

/** Extract the cadence level (1..3) from device_settings rows, or null if unset/invalid. */
export function selectObstacleDetectionLevel(
  rows: { key: string; value: string }[],
): number | null {
  const row = rows.find((r) => r.key === OBSTACLE_DETECTION_KEY);
  if (!row) return null;
  const n = Number(row.value);
  if (row.value.trim() === '' || !Number.isFinite(n)) return null;
  return Math.max(1, Math.min(3, Math.round(n)));
}
