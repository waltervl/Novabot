/**
 * Firmware capability detection.
 *
 * The mower's firmware version string tells us whether it runs:
 *   - stock LFI firmware (e.g. `v6.0.2`, `v5.7.1`) — supports only the
 *     vanilla `mqtt_node` MQTT surface, no `extended_commands.py`, no
 *     `camera_stream.py`, no STM32 PIN-lock workaround.
 *   - OpenNova custom firmware (e.g. `v6.0.2-custom-32`,
 *     `v6.0.2-opennova-1`) — adds the extended-commands service plus
 *     all the auxiliary daemons that drive joystick, edge cut, camera,
 *     and the recovery tooling.
 *
 * App-level UI gates use `isOpenNovaFirmware()` to hide or disable
 * features that won't work on stock firmware, with a tooltip pointing
 * users at the user-guide page. The detection is intentionally
 * substring-based because new custom build labels (custom-32,
 * custom-33, custom-…, opennova-N, etc.) should all light up the same
 * code path without code changes.
 */

export function isOpenNovaFirmware(version: string | null | undefined): boolean {
  if (!version) return false;
  const v = version.toLowerCase();
  return v.includes('custom') || v.includes('opennova');
}

/** Human-readable label for the disabled-feature tooltip / banner. */
export const STOCK_FIRMWARE_MESSAGE =
  'Requires OpenNova custom firmware. See user guide → Stock vs. Custom Firmware.';
