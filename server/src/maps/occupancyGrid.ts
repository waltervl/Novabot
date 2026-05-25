/**
 * Faithful server-side reimplementation of the mower firmware's
 * `map_generator.cpp` occupancy-grid generation (the `save_map type:1` path in
 * `novabot_mapping`). Produces the Nav2 map_saver outputs (map.yaml/pgm/png +
 * per-map mapN.*) byte-identically, so cloud/polygon-only restores get a costmap
 * identical to what the mower itself writes.
 *
 * Pure: inputs in, buffers out. No I/O.
 *
 * NOTE: the exact rasterization rules (geometry/origin, free/occupied/unknown,
 * boundary wall, dock free area, unicom channels, per-map merge) are derived from
 * the RE writeup in research/documents/mower-occupancy-grid-algorithm.md and are
 * validated byte-for-byte by server/src/__tests__/maps/occupancyGrid.test.ts
 * against the LFIN1231000211 fixtures. Until those rules are filled in this throws.
 */
export interface XY { x: number; y: number; }

export interface MapInput {
  workMaps: { canonical: string; points: XY[] }[];   // local meters, charger-relative
  obstacles: { parentMap: string; points: XY[] }[];
  unicom: { name: string; points: XY[] }[];
  chargingPose: { x: number; y: number; orientation: number };
}

export interface GridFile { yaml: string; pgm: Buffer; png?: Buffer; }
export interface GeneratedMap { whole: GridFile; perMap: { name: string; file: GridFile }[]; }

export function generateOccupancyGrid(_input: MapInput): GeneratedMap {
  throw new Error('generateOccupancyGrid: not implemented (pending RE — see plan Tasks 3-10)');
}
