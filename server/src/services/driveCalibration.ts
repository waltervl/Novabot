export interface LatLng {
  lat: number;
  lng: number;
}

export interface HeadingResult {
  headingRad: number;     // atan2(dy, dx); 0 = east, PI/2 = north
  distanceM: number;
  shortDistance: boolean; // true when < 0.5 m (drive aborted by obstacle?)
}

import { metersPerDegLat, metersPerDegLng } from '../mqtt/mapConverter.js';

const SHORT_DISTANCE_THRESHOLD_M = 0.3;

export function deriveHeading(start: LatLng, end: LatLng): HeadingResult {
  // WGS84-aware conversion — was flat 111320 m/deg constant which skewed
  // the dy axis by ~17 cm per 100 m at 45° latitude (issue #53). Heading
  // derivation runs on short drive traces (1–3 m), so the error was small
  // but visible enough to bias the calibrated heading by ~0.1°.
  const dx = (end.lng - start.lng) * metersPerDegLng(start.lat);
  const dy = (end.lat - start.lat) * metersPerDegLat(start.lat);
  const distanceM = Math.sqrt(dx * dx + dy * dy);
  const shortDistance = distanceM < SHORT_DISTANCE_THRESHOLD_M;
  const headingRad = shortDistance ? 0 : Math.atan2(dy, dx);
  return { headingRad, distanceM, shortDistance };
}
