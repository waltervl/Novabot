import React, { useState } from 'react';
import {
  BatteryMedium, BatteryCharging, Satellite, Wifi, Thermometer,
  Activity, ChevronDown, Circle, TreePine,
} from 'lucide-react';
import { Drawer } from './Drawer';
import type { DeviceState } from '../types';

interface Props {
  mower: DeviceState | null;
}

// ── Sensor grouping ──────────────────────────────────────────────────────────

const GROUPS: Array<{ label: string; test: (key: string) => boolean }> = [
  {
    label: 'Battery',
    test: k => k.startsWith('battery_'),
  },
  {
    label: 'Localization',
    test: k =>
      k.startsWith('gps_') ||
      k.startsWith('rtk') ||
      k.startsWith('loc_') ||
      k === 'map_position' ||
      k === 'latitude' ||
      k === 'longitude' ||
      k === 'altitude',
  },
  {
    label: 'Network',
    test: k => k.startsWith('wifi_') || k.startsWith('cpu_') || k.startsWith('mqtt_'),
  },
  {
    label: 'Work',
    test: k =>
      k.startsWith('work_') ||
      k.startsWith('mowing_') ||
      k.startsWith('cov_') ||
      k.startsWith('recharge_') ||
      k.startsWith('error_') ||
      k === 'light' ||
      k === 'target_height',
  },
];

// ── Small stat pill ──────────────────────────────────────────────────────────

function Pill({
  icon: Icon,
  value,
  color = 'text-zinc-400',
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string | number;
  color?: string;
  label?: string;
}) {
  return (
    <span className="inline-flex items-center gap-0.5" title={label}>
      <Icon className={`w-3 h-3 ${color}`} />
      <span className={`tabular-nums text-[11px] ${color}`}>{value}</span>
    </span>
  );
}

// ── Sensor detail panel (rendered inside Drawer) ─────────────────────────────

function SensorDetailPanel({ mower, openedAt }: { mower: DeviceState; openedAt: number }) {
  const s = mower.sensors;
  const allKeys = Object.keys(s).sort();

  // Build grouped sections
  const sections: Array<{ label: string; entries: Array<[string, string]> }> = [];
  const used = new Set<string>();

  for (const group of GROUPS) {
    const entries = allKeys
      .filter(k => group.test(k))
      .map(k => [k, s[k]] as [string, string]);
    if (entries.length > 0) {
      sections.push({ label: group.label, entries });
      entries.forEach(([k]) => used.add(k));
    }
  }

  const otherEntries = allKeys
    .filter(k => !used.has(k))
    .map(k => [k, s[k]] as [string, string]);
  if (otherEntries.length > 0) {
    sections.push({ label: 'Other', entries: otherEntries });
  }

  return (
    <div className="space-y-3">
      {/* Identity row */}
      <div className="pb-2 border-b border-zinc-800 space-y-0.5">
        <p className="text-[10px] font-mono text-zinc-400">{mower.sn}</p>
        {mower.macAddress && (
          <p className="text-[10px] font-mono text-zinc-600">{mower.macAddress}</p>
        )}
        <p className="text-[10px] text-zinc-600">
          Updated: {new Date(openedAt).toISOString()}
        </p>
      </div>

      {/* Grouped sensor table */}
      {sections.map(({ label, entries }) => (
        <div key={label}>
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">
            {label}
          </p>
          <table className="w-full text-[11px] font-mono">
            <tbody>
              {entries.map(([k, v]) => (
                <tr key={k} className="odd:bg-zinc-900/40">
                  <td className="pr-3 py-0.5 text-zinc-500 whitespace-nowrap align-top">{k}</td>
                  <td className="py-0.5 text-zinc-300 break-all">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {allKeys.length === 0 && (
        <p className="text-xs text-zinc-600 italic">No sensor data yet.</p>
      )}
    </div>
  );
}

// ── Main DeviceChips component ───────────────────────────────────────────────

export function DeviceChips({ mower }: Props): React.JSX.Element | null {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState<number>(0);

  if (mower === null) return null;

  const s = mower.sensors;

  function openDrawer() {
    setOpenedAt(Date.now());
    setDrawerOpen(true);
  }

  // ── Offline chip ────────────────────────────────────────────────────────────
  if (!mower.online) {
    return (
      <div className="px-4 py-1.5 bg-zinc-900 border-b border-zinc-800 flex-shrink-0">
        <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-zinc-700 text-xs text-zinc-500">
          <TreePine className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
          <span className="font-medium">{mower.nickname ?? mower.sn}</span>
          <span className="text-[10px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded-full">offline</span>
        </span>
      </div>
    );
  }

  // ── Sensor values ───────────────────────────────────────────────────────────
  const batteryRaw = s.battery_power ?? s.battery_capacity ?? '';
  const battery = parseInt(batteryRaw, 10);
  const hasBattery = isFinite(battery) && battery > 0;
  const isCharging = s.battery_state === 'CHARGING';

  const mowerSats = parseInt(s.rtk_sat ?? '', 10);
  const hasSats = isFinite(mowerSats) && mowerSats > 0;

  const mowerRtkKnown = s.rtk != null;
  const mowerRtk = s.rtk === 'true';

  const wifiRssi = parseInt(s.wifi_rssi ?? '', 10);
  const hasWifi = isFinite(wifiRssi) && wifiRssi !== 0;

  const cpuTemp = parseInt(s.cpu_temperature ?? '', 10);
  const hasCpu = isFinite(cpuTemp) && cpuTemp > 0;

  const workStatus = s.work_status;
  const hasWork = workStatus != null && workStatus !== '0' && workStatus !== '';

  const hasSensorData = Object.keys(s).length > 0;

  // ── Online chip ─────────────────────────────────────────────────────────────
  return (
    <>
      <div className="px-4 py-1.5 bg-zinc-900 border-b border-zinc-800 flex-shrink-0">
        <button
          onClick={openDrawer}
          className="inline-flex items-center gap-1 md:gap-1.5 h-7 px-2.5 rounded-md border border-transparent hover:bg-zinc-800 hover:border-zinc-700 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          aria-label={`${mower.nickname ?? mower.sn} sensor details`}
        >
          {/* Icon + name + online dot */}
          <TreePine className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
          <span className="text-zinc-300 font-medium">
            {mower.nickname ?? mower.sn}
          </span>
          <Circle className="w-2.5 h-2.5 fill-current text-emerald-500" />

          {hasSensorData && (
            <>
              <span className="text-zinc-700 select-none">|</span>

              {/* Battery */}
              {hasBattery && (
                <Pill
                  icon={isCharging ? BatteryCharging : BatteryMedium}
                  value={`${battery}%`}
                  color={battery >= 20 ? 'text-emerald-400' : 'text-red-400'}
                  label={`Battery: ${battery}%${isCharging ? ' (charging)' : ''}`}
                />
              )}

              {/* RTK sat count */}
              {hasSats && (
                <Pill
                  icon={Satellite}
                  value={mowerSats}
                  color={
                    mowerSats >= 15 ? 'text-sky-400' :
                    mowerSats >= 8  ? 'text-yellow-400' :
                                      'text-red-400'
                  }
                  label={`RTK satellites: ${mowerSats}`}
                />
              )}

              {/* RTK fix status */}
              {mowerRtkKnown && (
                <span
                  className={`text-[10px] font-medium ${mowerRtk ? 'text-emerald-400' : 'text-zinc-600'}`}
                  title={`RTK fix: ${mowerRtk ? 'yes' : 'no'}`}
                >
                  RTK{mowerRtk ? '✓' : '—'}
                </span>
              )}

              {/* WiFi RSSI */}
              {hasWifi && (
                <Pill
                  icon={Wifi}
                  value={`${wifiRssi}dB`}
                  color={
                    Math.abs(wifiRssi) < 60 ? 'text-emerald-400' :
                    Math.abs(wifiRssi) < 75 ? 'text-yellow-400' :
                                               'text-red-400'
                  }
                  label={`WiFi RSSI: ${wifiRssi} dBm`}
                />
              )}

              {/* CPU temperature */}
              {hasCpu && (
                <Pill
                  icon={Thermometer}
                  value={`${cpuTemp}°`}
                  color={
                    cpuTemp < 50 ? 'text-zinc-400' :
                    cpuTemp < 65 ? 'text-yellow-400' :
                                   'text-red-400'
                  }
                  label={`CPU temp: ${cpuTemp}°C`}
                />
              )}

              {/* Work status when active */}
              {hasWork && (
                <Pill
                  icon={Activity}
                  value={workStatus!}
                  color="text-emerald-400"
                  label={`Work status: ${workStatus}`}
                />
              )}
            </>
          )}

          {!hasSensorData && (
            <span className="text-zinc-600 text-[10px] italic">waiting…</span>
          )}

          <ChevronDown className="w-3 h-3 text-zinc-500 ml-0.5" />
        </button>
      </div>

      {/* Sensor detail drawer — separate instance from the gear-icon drawer */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <SensorDetailPanel mower={mower} openedAt={openedAt} />
      </Drawer>
    </>
  );
}
