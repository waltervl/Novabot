export function formatCutGrassHeightCm(rawHeight: number | null | undefined): string | null {
  if (rawHeight == null || !Number.isFinite(rawHeight) || rawHeight < 0) return null;

  // Work records store the firmware wire enum. User-facing cm is wire + 2.
  const cm = rawHeight + 2;
  return Number.isInteger(cm) ? String(cm) : cm.toFixed(1);
}
