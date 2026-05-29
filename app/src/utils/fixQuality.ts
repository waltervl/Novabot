/** Map an NMEA GGA fix-quality code to a display label + color.
 * 4 = RTK Fixed, 5 = RTK Float, 2 = DGPS, 1 = GPS SPS, 0 = no fix.
 * undefined/null/unknown -> "No data" (mower not reporting / stock firmware). */
export interface FixQualityDisplay {
  label: string;
  color: string;
}

const NO_DATA: FixQualityDisplay = { label: 'No data', color: '#6b7280' };

export function fixQualityLabel(
  q: number | string | null | undefined,
): FixQualityDisplay {
  const n = typeof q === 'string' ? parseInt(q, 10) : q;
  switch (n) {
    case 4: return { label: 'RTK Fixed', color: '#22c55e' };
    case 5: return { label: 'RTK Float', color: '#f59e0b' };
    case 2: return { label: 'DGPS', color: '#eab308' };
    case 1: return { label: 'GPS', color: '#9ca3af' };
    case 0: return { label: 'No fix', color: '#ef4444' };
    default: return NO_DATA;
  }
}
