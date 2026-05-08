import { describe, it, expect } from 'vitest';
import { deriveHeading } from '../../services/driveCalibration.js';

const lat0 = 52.14088864656;
const lng0 = 6.23103579689;
const METERS_PER_DEG = 111320;

function offsetLatLng(deltaNorthM: number, deltaEastM: number) {
  const cosLat = Math.cos((lat0 * Math.PI) / 180);
  return {
    lat: lat0 + deltaNorthM / METERS_PER_DEG,
    lng: lng0 + deltaEastM / (cosLat * METERS_PER_DEG),
  };
}

describe('deriveHeading', () => {
  it('drove 1m east -> heading 0', () => {
    const start = { lat: lat0, lng: lng0 };
    const end = offsetLatLng(0, 1);
    const r = deriveHeading(start, end);
    expect(r.headingRad).toBeCloseTo(0, 3);
    expect(r.distanceM).toBeCloseTo(1, 2);
  });

  it('drove 1m north -> heading PI/2', () => {
    const start = { lat: lat0, lng: lng0 };
    const end = offsetLatLng(1, 0);
    const r = deriveHeading(start, end);
    expect(r.headingRad).toBeCloseTo(Math.PI / 2, 3);
    expect(r.distanceM).toBeCloseTo(1, 2);
  });

  it('drove 1m west -> heading PI', () => {
    const start = { lat: lat0, lng: lng0 };
    const end = offsetLatLng(0, -1);
    const r = deriveHeading(start, end);
    expect(Math.abs(r.headingRad)).toBeCloseTo(Math.PI, 3);
  });

  it('drove 1m south -> heading -PI/2', () => {
    const start = { lat: lat0, lng: lng0 };
    const end = offsetLatLng(-1, 0);
    const r = deriveHeading(start, end);
    expect(r.headingRad).toBeCloseTo(-Math.PI / 2, 3);
  });

  it('diagonal NE 0.7m,0.7m -> heading PI/4', () => {
    const start = { lat: lat0, lng: lng0 };
    const end = offsetLatLng(0.7, 0.7);
    const r = deriveHeading(start, end);
    expect(r.headingRad).toBeCloseTo(Math.PI / 4, 2);
    expect(r.distanceM).toBeCloseTo(Math.sqrt(2) * 0.7, 2);
  });

  it('zero displacement returns shortDistance flag and 0 heading', () => {
    const start = { lat: lat0, lng: lng0 };
    const end = { lat: lat0, lng: lng0 };
    const r = deriveHeading(start, end);
    expect(r.shortDistance).toBe(true);
    expect(r.distanceM).toBeCloseTo(0, 6);
  });
});
