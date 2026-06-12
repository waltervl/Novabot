// Human labels for the mower's numeric work_status codes. Mirrors
// WORK_STATUS_LABELS in server/src/mqtt/sensorData.ts so the dashboard never
// shows a bare number when the socket snapshot carries the raw code.
const WORK_STATUS_LABELS: Record<number, string> = {
  0: 'Idle',
  1: 'Sensor init',
  2: 'GPS init',
  3: 'Localization init',
  9: 'Ready',
  10: 'Leaving dock',
  20: 'Mapping work zone',
  21: 'Mapping obstacle',
  22: 'Mapping channel',
  23: 'Mapping channel→station',
  24: 'Auto-mapping work zone',
  25: 'Auto-mapping obstacle',
  26: 'Mapping stop record',
  27: 'Mapping edit',
  28: 'Auto-erase mapping',
  29: 'Auto-erase failed',
  30: 'Auto-erase success',
  31: 'Setting charger pose',
  50: 'Returning to dock',
  51: 'Aligning dock',
  52: 'Visual search dock',
  70: 'Finished once',
  71: 'Failed once',
  72: 'Cancelled',
  73: 'Start requested',
  74: 'Start warning',
  80: 'Localization error',
  81: 'LoRa error',
  82: 'Slipping',
  83: 'Out of map',
  84: 'Recovering',
  85: 'Low power',
  86: 'Time limit',
  87: 'User stopped',
  88: 'User recharge',
  100: 'Mowing',
  101: 'Edge cutting',
  102: 'Re-covering missed',
  103: 'Driving',
  110: 'Patrolling',
  120: 'Avoiding obstacle',
  150: 'Edge cutting',
  200: 'Deleting child map',
  201: 'Deleting obstacle',
  202: 'Deleting channel',
  203: 'Map load error',
  250: 'Driving',
};

/**
 * Turn a work_status value into a readable label. The value can arrive as a raw
 * numeric code ("100") or already translated ("Mowing" / "State 90"); both are
 * handled — a non-numeric value passes through untouched, a known code maps to
 * its label, an unknown code falls back to "State N".
 */
export function workStatusLabel(raw: string | number | null | undefined): string {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  const n = parseInt(s, 10);
  // Only treat it as a code when the WHOLE string is the number (so "State 90"
  // or "Idle" pass through unchanged).
  if (Number.isNaN(n) || String(n) !== s) return s;
  return WORK_STATUS_LABELS[n] ?? `State ${n}`;
}
