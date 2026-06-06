import { describe, it, expect, vi } from 'vitest';
import { db } from '../../db/database.js';

vi.mock('../../mqtt/broker.js', () => ({
  isDeviceOnline: vi.fn().mockReturnValue(false),
  writeRawPublish: vi.fn(),
  getBrokerDiagnostics: vi.fn().mockReturnValue({}),
  startMqttBroker: vi.fn(),
  banishSn: vi.fn(),
  forceDisconnectDevice: vi.fn(),
  lookupMac: vi.fn(),
}));

import { signalHistoryRepo } from '../../db/repositories/signalHistory.js';
import { updateDeviceData } from '../../mqtt/sensorData.js';

describe('signal_history positioned samples', () => {
  it('has local and GPS position columns for map overlays', () => {
    const cols = db.prepare('PRAGMA table_info(signal_history)').all() as Array<{ name: string }>;
    expect(cols.map(c => c.name)).toEqual(expect.arrayContaining([
      'map_x',
      'map_y',
      'latitude',
      'longitude',
    ]));
  });

  it('samples WiFi history with local map position and normalized RSSI', () => {
    const sn = 'LFIN_HEATMAP_SAMPLE';
    const payload = {
      report_state_timer_data: {
        wifi_rssi: 52,
        battery_power: 88,
        loc_quality: 100,
        localization: {
          gps_position: { latitude: 52.1234567, longitude: 6.1234567 },
          map_position: { x: 1.25, y: -2.5, orientation: 0.3 },
          localization_state: 'LOC_SUCCESS',
        },
      },
    };

    updateDeviceData(sn, Buffer.from(JSON.stringify(payload)));

    const row = db.prepare(`
      SELECT wifi_rssi, map_x, map_y, latitude, longitude
      FROM signal_history
      WHERE sn = ?
    `).get(sn) as {
      wifi_rssi: number;
      map_x: number;
      map_y: number;
      latitude: number;
      longitude: number;
    } | undefined;

    expect(row).toBeDefined();
    expect(row!.wifi_rssi).toBe(-52);
    expect(row!.map_x).toBeCloseTo(1.25);
    expect(row!.map_y).toBeCloseTo(-2.5);
    expect(row!.latitude).toBeCloseTo(52.1234567);
    expect(row!.longitude).toBeCloseTo(6.1234567);
  });

  it('returns only positioned WiFi samples for heatmap rendering', () => {
    const sn = 'LFIN_HEATMAP_REPO';
    db.prepare(`
      INSERT INTO signal_history (sn, wifi_rssi, battery, map_x, map_y, latitude, longitude, ts)
      VALUES
        (?, -51, 80, 1.2, -0.4, 52.1, 6.1, datetime('now', '-10 minutes')),
        (?, -65, 75, NULL, NULL, 52.2, 6.2, datetime('now', '-9 minutes')),
        (?, NULL, 70, 2.0, 3.0, 52.3, 6.3, datetime('now', '-8 minutes')),
        (?, -72, 60, 4.5, 1.5, 52.4, 6.4, datetime('now', '-7 minutes'))
    `).run(sn, sn, sn, sn);

    const rows = signalHistoryRepo.findWifiHeatmapBySnWithinHours(sn, 1);

    expect(rows).toEqual([
      expect.objectContaining({ wifi_rssi: -51, map_x: 1.2, map_y: -0.4 }),
      expect.objectContaining({ wifi_rssi: -72, map_x: 4.5, map_y: 1.5 }),
    ]);
  });
});
