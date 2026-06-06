/**
 * Signal History Repository — signal_history query operations.
 */
import { db } from '../database.js';

export interface SignalHistoryRow {
  ts: string;
  battery: number | null;
  wifi_rssi: number | null;
  rtk_sat: number | null;
  loc_quality: number | null;
  cpu_temp: number | null;
}

export interface WifiHeatmapRow {
  ts: string;
  wifi_rssi: number;
  battery: number | null;
  loc_quality: number | null;
  map_x: number;
  map_y: number;
  latitude: number | null;
  longitude: number | null;
}

export class SignalHistoryRepository {
  private _findBySnWithinHours = db.prepare(`
    SELECT ts, battery, wifi_rssi, rtk_sat, loc_quality, cpu_temp
    FROM signal_history
    WHERE sn = ? AND ts >= datetime('now', ? || ' hours')
    ORDER BY ts ASC
  `);

  private _findWifiHeatmapBySnWithinHours = db.prepare(`
    SELECT ts, wifi_rssi, battery, loc_quality, map_x, map_y, latitude, longitude
    FROM signal_history
    WHERE sn = ?
      AND ts >= datetime('now', ? || ' hours')
      AND wifi_rssi IS NOT NULL
      AND map_x IS NOT NULL
      AND map_y IS NOT NULL
    ORDER BY ts ASC
  `);

  findBySnWithinHours(sn: string, hours: number): SignalHistoryRow[] {
    return this._findBySnWithinHours.all(sn, String(-hours)) as SignalHistoryRow[];
  }

  findWifiHeatmapBySnWithinHours(sn: string, hours: number): WifiHeatmapRow[] {
    return this._findWifiHeatmapBySnWithinHours.all(sn, String(-hours)) as WifiHeatmapRow[];
  }
}

export const signalHistoryRepo = new SignalHistoryRepository();
