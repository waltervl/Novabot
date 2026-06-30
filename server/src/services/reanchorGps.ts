// Pure GPS helpers for the re-anchor stability gate. Kept separate from the
// dashboard orchestration so the spread/median math is unit-testable.

export interface LatLng {
  lat: number;
  lng: number;
}

/** Median lat and median lng of a window (independent per axis; robust to
 *  single-sample outliers). For an even window this returns the upper-middle
 *  element after sorting, which is fine for a tight cluster. */
export function medianGps(window: LatLng[]): LatLng {
  if (window.length === 0) return { lat: NaN, lng: NaN };
  const lat = window.map((p) => p.lat).sort((a, b) => a - b);
  const lng = window.map((p) => p.lng).sort((a, b) => a - b);
  const mid = Math.floor(window.length / 2);
  return { lat: lat[mid], lng: lng[mid] };
}

/** Max distance in METERS of any sample from the window's median position.
 *  Uses a local equirectangular approximation (fine for the few-metre spreads
 *  we care about): 1 deg lat ~= 111320 m, 1 deg lng ~= 111320 m * cos(lat). */
export function gpsSpreadMeters(window: LatLng[]): number {
  if (window.length < 2) return 0;
  const mid = medianGps(window);
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((mid.lat * Math.PI) / 180);
  let max = 0;
  for (const p of window) {
    const dy = (p.lat - mid.lat) * mPerDegLat;
    const dx = (p.lng - mid.lng) * mPerDegLng;
    const d = Math.hypot(dx, dy);
    if (d > max) max = d;
  }
  return max;
}
