/**
 * Coordinate conversion utilities.
 *
 * The database stores map data in local meters with charger at origin (0,0).
 * Leaflet needs GPS (lat/lng). These functions convert between the two systems
 * using the charger's GPS position as the reference point.
 */

export type GpsPoint = { lat: number; lng: number };
export type LocalPoint = { x: number; y: number };

const DEG_TO_M = 111320; // meters per degree latitude

/** Convert local meters (charger=0,0) to GPS coordinates. */
export function localToGps(p: LocalPoint, chargerGps: GpsPoint): GpsPoint {
  const cosLat = Math.cos(chargerGps.lat * Math.PI / 180);
  return {
    lat: chargerGps.lat + p.y / DEG_TO_M,
    lng: chargerGps.lng + p.x / (DEG_TO_M * cosLat),
  };
}

/** Convert GPS coordinates to local meters (charger=0,0). */
export function gpsToLocal(p: GpsPoint, chargerGps: GpsPoint): LocalPoint {
  const cosLat = Math.cos(chargerGps.lat * Math.PI / 180);
  return {
    x: (p.lng - chargerGps.lng) * DEG_TO_M * cosLat,
    y: (p.lat - chargerGps.lat) * DEG_TO_M,
  };
}

/**
 * True when `chargerGps` has finite numeric `lat` + `lng`. Use this to
 * guard local↔GPS conversions before they propagate NaN into Leaflet
 * — Leaflet rejects NaN with "Invalid LatLng object" and white-screens
 * the page (issue #15).
 */
export function isUsableChargerGps(g: GpsPoint | null | undefined): g is GpsPoint {
  return !!g && Number.isFinite(g.lat) && Number.isFinite(g.lng);
}

/**
 * Convert a full polygon from local meters to Leaflet `[lat, lng]` tuples.
 * Skips any vertex that produces a non-finite GPS pair so a single bad
 * point never crashes the whole polygon render.
 */
export function polygonToLatLng(
  points: LocalPoint[],
  chargerGps: GpsPoint,
): [number, number][] {
  if (!isUsableChargerGps(chargerGps)) return [];
  const out: [number, number][] = [];
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const gps = localToGps(p, chargerGps);
    if (Number.isFinite(gps.lat) && Number.isFinite(gps.lng)) {
      out.push([gps.lat, gps.lng]);
    }
  }
  return out;
}

/** Polygon area in m² (Shoelace formula on local meter points) */
export function polygonAreaM2(points: LocalPoint[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return Math.abs(area / 2);
}
