/**
 * Her-push van door de gebruiker gekozen `set_para_info`-instellingen.
 *
 * De stock maaier-firmware persisteert app-gezette para NIET naar json_config
 * (alleen runtime), dus na een reboot valt de maaier terug op de
 * provisioning-waarde. De cloud is de bron van waarheid voor deze settings —
 * vooral `obstacle_avoidance_sensitivity` — en her-stuurt ze daarom bij elke
 * (re)connect. Side-effect-vrij module zodat de pure selector los te testen is
 * zonder de zware mapSync/broker import-graph te laden.
 */

/**
 * Allowlist van echte device-parameters die via `set_para_info` worden gezet.
 * NOOIT frame-flags (`frame_unvalidated`, `frame_auto_recharge_seen`) of vrije
 * sensor-overrides her-pushen — alleen deze keys.
 */
export const PARA_KEYS = [
  'headlight',
  'sound',
  'obstacle_avoidance_sensitivity',
  'path_direction',
  'manual_controller_v',
  'manual_controller_w',
];

/**
 * Bouwt de `set_para_info` payload uit opgeslagen device_settings-rijen.
 * Filtert op de allowlist en zet numerieke strings terug naar getallen, zoals
 * de app ze oorspronkelijk stuurde. Retourneert null als er niets te
 * her-pushen valt.
 */
export function selectParaRepush(
  rows: { key: string; value: string }[],
): Record<string, unknown> | null {
  const para: Record<string, unknown> = {};
  for (const r of rows) {
    if (!PARA_KEYS.includes(r.key)) continue;
    const n = Number(r.value);
    para[r.key] = r.value.trim() !== '' && Number.isFinite(n) ? n : r.value;
  }
  return Object.keys(para).length > 0 ? para : null;
}
