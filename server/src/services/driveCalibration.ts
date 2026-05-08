export interface LatLng {
  lat: number;
  lng: number;
}

export interface HeadingResult {
  headingRad: number;     // atan2(dy, dx); 0 = east, PI/2 = north
  distanceM: number;
  shortDistance: boolean; // true when < 0.5 m (drive aborted by obstacle?)
}

const METERS_PER_DEG = 111320;
const SHORT_DISTANCE_THRESHOLD_M = 0.3;

export function deriveHeading(start: LatLng, end: LatLng): HeadingResult {
  const cosLat = Math.cos((start.lat * Math.PI) / 180);
  const dx = (end.lng - start.lng) * cosLat * METERS_PER_DEG;
  const dy = (end.lat - start.lat) * METERS_PER_DEG;
  const distanceM = Math.sqrt(dx * dx + dy * dy);
  const shortDistance = distanceM < SHORT_DISTANCE_THRESHOLD_M;
  const headingRad = shortDistance ? 0 : Math.atan2(dy, dx);
  return { headingRad, distanceM, shortDistance };
}
