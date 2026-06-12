/**
 * Firmware capability detection (dashboard mirror of the app's
 * `app/src/utils/firmwareCapability.ts`).
 *
 * Stock LFI firmware (e.g. `v6.0.2`) only exposes the vanilla `mqtt_node`
 * surface. OpenNova custom firmware (e.g. `v6.0.2-custom-36`,
 * `v6.0.2-opennova-1`) additionally ships the auxiliary daemons — including
 * `camera_stream.py`, which the live-camera tile depends on.
 *
 * Detection is intentionally substring-based so any new custom build label
 * lights up the same code path without code changes.
 */
export function isOpenNovaFirmware(version: string | null | undefined): boolean {
  if (!version) return false;
  const v = version.toLowerCase();
  return v.includes('custom') || v.includes('opennova');
}
