/**
 * Single source of truth for "is this nickname a leaked LFI default?".
 *
 * Issue #19: LFI cloud defaults the charger's `equipmentNickName` to
 * "Charging Station". Multiple import / bind / login paths copied that
 * value into `equipment.equipment_nick_name`, which the Novabot stock
 * app then surfaced as the *mower's* label. Fixing each call-site
 * inline (setup.ts, appUser.ts, equipment.ts, adminPage.ts) had already
 * drifted across two PRs without catching them all — hence this util.
 *
 * Rule: when a mower SN is in the pair, never persist the LFI default.
 * For charger-only records the default is acceptable (a real charger
 * legitimately has that nickname). For the unknown-future case we err
 * on the side of letting it through — operators can rename via the
 * dashboard.
 */

const CHARGER_DEFAULT = /^charging[\s_-]?station$/i;

export function sanitizeNickName(
  name: string | null | undefined,
  mowerSn?: string | null,
): string | null {
  if (name == null) return null;
  const trimmed = String(name).trim();
  if (trimmed.length === 0) return null;
  if (mowerSn && CHARGER_DEFAULT.test(trimmed)) return null;
  return trimmed;
}
