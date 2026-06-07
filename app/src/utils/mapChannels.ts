// Detect inter-zone unicom connectors ("channels") that are missing between
// adjacent work maps. The mower cannot navigate between two work maps without
// an explicit mapXtomapY_N_unicom path (the firmware records it from a driven
// trajectory and rasterises it into a ~1 m corridor via unicom_area_radius).
// A missing pair therefore means the robot physically cannot cross from one
// zone to the other, which surfaces as nav2 "no valid path to goal" (Error
// 127) when a coverage task targets the unreachable zone.

export interface ChannelMapLike {
  mapType: string;
  /** Firmware slot identifier (e.g. "map0", "map0tomap1_0_unicom"). The
   *  authoritative, typed source. Falls back to fileName / mapName. */
  canonicalName?: string | null;
  mapName?: string | null;
  fileName?: string | null;
  /** Number of geometry points. A unicom row with fewer than 2 points (a
   *  0-byte / metadata-only connector, e.g. after a polygon-only restore) is
   *  NOT a navigable channel, so it must still count as "missing". When
   *  undefined the geometry is assumed present (caller pre-filtered). */
  pointCount?: number;
}

export interface MissingChannel {
  /** Newer (higher-index) map — the scan starts here. The firmware uses the
   *  position at add_scan_map time as the "from" side. */
  from: string;
  /** Older (lower-index) map — drive into this one to close the channel. */
  to: string;
}

function canonicalOf(m: ChannelMapLike): string | null {
  return (
    m.canonicalName?.match(/^(map\d+)/)?.[1] ??
    m.fileName?.match(/^(map\d+)/)?.[1] ??
    m.mapName?.match(/^(map\d+)/)?.[1] ??
    null
  );
}

/**
 * Return the adjacent work-map pairs that have no unicom channel between them.
 * Pairs are ordered newest-first so the primary gap surfaces at index 0.
 */
export function findMissingChannels(maps: ChannelMapLike[]): MissingChannel[] {
  const hasUnicom = (a: string, b: string) =>
    maps.some(
      (m) =>
        m.mapType === 'unicom' &&
        (m.pointCount ?? Infinity) >= 2 &&
        (Boolean(m.canonicalName?.includes(`${a}to${b}`)) ||
          Boolean(m.fileName?.includes(`${a}to${b}`)) ||
          Boolean(m.mapName?.includes(`${a}to${b}`))),
    );

  const workNames = Array.from(
    new Set(
      maps
        .filter((m) => m.mapType === 'work')
        .map(canonicalOf)
        .filter((v): v is string => !!v),
    ),
  ).sort((a, b) => parseInt(a.slice(3), 10) - parseInt(b.slice(3), 10));

  const missing: MissingChannel[] = [];
  for (let i = workNames.length - 1; i > 0; i--) {
    const from = workNames[i]; // newer
    const to = workNames[i - 1]; // older
    if (!hasUnicom(from, to) && !hasUnicom(to, from)) {
      missing.push({ from, to });
    }
  }
  return missing;
}
