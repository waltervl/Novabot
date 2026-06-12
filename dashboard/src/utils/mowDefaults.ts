// Per-browser default mowing settings, used to pre-fill the Start sheet so the
// operator doesn't reset cutting height / direction on every mow. Stored in
// localStorage; the Settings tab writes them, MowerControls reads them.

export interface MowDefaults {
  /** Cutting height in millimetres (wire-ish), 20–90 (= 2–9 cm). */
  cuttingHeight: number;
  /** Mowing direction in degrees, 0–180. */
  pathDirection: number;
}

export const DEFAULT_MOW: MowDefaults = { cuttingHeight: 40, pathDirection: 0 };

const KEY = 'novabot.mowDefaults';

export function readMowDefaults(): MowDefaults {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<MowDefaults>;
      const ch = Number(d.cuttingHeight);
      const pd = Number(d.pathDirection);
      return {
        cuttingHeight: Number.isFinite(ch) ? Math.max(20, Math.min(90, ch)) : DEFAULT_MOW.cuttingHeight,
        pathDirection: Number.isFinite(pd) ? Math.max(0, Math.min(180, pd)) : DEFAULT_MOW.pathDirection,
      };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_MOW };
}

export function writeMowDefaults(d: MowDefaults): void {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ }
}
