import React, { useState, useEffect } from 'react';
import {
  BatteryMedium, BatteryCharging, Satellite, Wifi, Thermometer,
  Activity, ChevronDown, Circle, TreePine,
} from 'lucide-react';
import { Drawer } from './Drawer';
import type { DeviceState } from '../types';
import { fetchLoraStatus, type LoraStatus } from '../api/client';

interface Props {
  mower: DeviceState | null;
  knownMowers: DeviceState[];
  onSelectMower: (sn: string) => void;
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

// ── Summary panel (rendered inside Drawer — default view) ────────────────────

function SummaryPanel({
  mower,
  lora,
  setMode,
}: {
  mower: DeviceState;
  lora: LoraStatus | null;
  setMode: (m: 'summary' | 'advanced') => void;
}) {
  return (
    <div className="space-y-3">
      {/* Identity */}
      <div className="space-y-1">
        <p className="text-[10px] font-mono text-zinc-300">{mower.sn}</p>
        {mower.macAddress && (
          <p className="text-[10px] font-mono text-zinc-600">{mower.macAddress}</p>
        )}
        <div className="flex items-center gap-3 text-xs">
          <span className={mower.online ? 'text-emerald-400' : 'text-zinc-500'}>
            {mower.online ? '● Online' : '● Offline'}
          </span>
          {mower.sensors.sw_version && (
            <span className="font-mono text-purple-400">&lt;/&gt; {mower.sensors.sw_version}</span>
          )}
        </div>
        {mower.lastSeen && (
          <p className="text-[10px] text-zinc-500">
            Last seen: {new Date(mower.lastSeen).toLocaleString()}
          </p>
        )}
      </div>

      {/* Configuration */}
      {lora && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">
            Configuration
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-zinc-900 rounded border border-zinc-800 p-2">
              <p className="text-[10px] text-zinc-500">LoRa Address</p>
              <p className="text-sm font-mono text-zinc-100">{lora.pair.address ?? '—'}</p>
            </div>
            <div className="bg-zinc-900 rounded border border-zinc-800 p-2">
              <p className="text-[10px] text-zinc-500">LoRa Channel</p>
              <p className="text-sm font-mono text-zinc-100">{lora.pair.channel ?? '—'}</p>
            </div>
          </div>
          <span
            className={`inline-block text-[10px] px-2 py-0.5 rounded-full ${
              lora.drift
                ? 'bg-amber-900/40 text-amber-300'
                : 'bg-emerald-900/30 text-emerald-300'
            }`}
          >
            {lora.drift ? 'Pair drift detected' : 'Pair in sync'}
          </span>
        </div>
      )}

      {/* Advanced button */}
      <button
        onClick={() => setMode('advanced')}
        className="w-full mt-4 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-sm text-zinc-200"
      >
        Show advanced sensors
      </button>
    </div>
  );
}

// ── Main DeviceChips component ───────────────────────────────────────────────

export function DeviceChips({ mower, knownMowers, onSelectMower }: Props): React.JSX.Element | null {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState<number>(0);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [mode, setMode] = useState<'summary' | 'advanced'>('summary');
  const [lora, setLora] = useState<LoraStatus | null>(null);

  // Close switcher on outside click (deferred one tick so the opening click doesn't immediately close it)
  useEffect(() => {
    if (!switcherOpen) return;
    const handler = () => setSwitcherOpen(false);
    const id = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => { clearTimeout(id); document.removeEventListener('click', handler); };
  }, [switcherOpen]);

  // Fetch LoRa status when drawer opens
  useEffect(() => {
    if (!drawerOpen || !mower) { setLora(null); return; }
    let cancelled = false;
    fetchLoraStatus(mower.sn)
      .then(s => { if (!cancelled) setLora(s); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [drawerOpen, mower?.sn]);

  // Reset to summary view each time drawer reopens
  useEffect(() => {
    if (drawerOpen) setMode('summary');
  }, [drawerOpen]);

  if (mower === null) return null;

  const s = mower.sensors;

  function openDrawer() {
    setOpenedAt(Date.now());
    setDrawerOpen(true);
  }

  // ── Offline chip ────────────────────────────────────────────────────────────
  if (!mower.online) {
    return (
      <>
        <div className="inline-flex items-center gap-1.5 h-7">
          {/* Mower name / switcher */}
          {knownMowers.length > 1 ? (
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setSwitcherOpen(v => !v); }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-zinc-800 text-sm font-medium text-zinc-500"
              >
                <TreePine className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
                {mower.nickname ?? mower.sn}
                <ChevronDown className={`w-3 h-3 transition-transform ${switcherOpen ? 'rotate-180' : ''}`} />
              </button>
              {switcherOpen && (
                <div className="absolute top-full left-0 mt-1 z-[100] bg-zinc-900 border border-zinc-700 rounded shadow-xl min-w-[160px]">
                  {knownMowers.map(m => (
                    <button
                      key={m.sn}
                      onClick={(e) => { e.stopPropagation(); setSwitcherOpen(false); onSelectMower(m.sn); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-800 ${m.sn === mower.sn ? 'text-emerald-400' : 'text-zinc-200'}`}
                    >
                      {m.nickname ?? m.sn}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 rounded-md border border-zinc-700 text-xs text-zinc-500">
              <TreePine className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
              <span className="font-medium">{mower.nickname ?? mower.sn}</span>
            </span>
          )}
          <span className="text-[10px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded-full">offline</span>
        </div>
      </>
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
      <div className="inline-flex items-center gap-1">
          {/* ── Mower name / switcher (click zone 1: switch active mower) ── */}
          {knownMowers.length > 1 ? (
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setSwitcherOpen(v => !v); }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-zinc-800 text-sm font-medium text-zinc-100"
              >
                <TreePine className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                {mower.nickname ?? mower.sn}
                <ChevronDown className={`w-3 h-3 transition-transform ${switcherOpen ? 'rotate-180' : ''}`} />
              </button>
              {switcherOpen && (
                <div className="absolute top-full left-0 mt-1 z-[100] bg-zinc-900 border border-zinc-700 rounded shadow-xl min-w-[160px]">
                  {knownMowers.map(m => (
                    <button
                      key={m.sn}
                      onClick={(e) => { e.stopPropagation(); setSwitcherOpen(false); onSelectMower(m.sn); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-800 ${m.sn === mower.sn ? 'text-emerald-400' : 'text-zinc-200'}`}
                    >
                      {m.nickname ?? m.sn}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 text-sm font-medium text-zinc-100">
              <TreePine className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
              {mower.nickname ?? mower.sn}
            </span>
          )}

          {/* ── Stats chip + chevron (click zone 2: open sensor drawer) ── */}
          <button
            onClick={openDrawer}
            className="inline-flex items-center gap-1 md:gap-1.5 h-7 px-2.5 rounded-md border border-transparent hover:bg-zinc-800 hover:border-zinc-700 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            aria-label={`${mower.nickname ?? mower.sn} sensor details`}
          >
            {/* Online dot */}
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
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Sensors">
        {mode === 'summary' ? (
          <SummaryPanel mower={mower} lora={lora} setMode={setMode} />
        ) : (
          <div className="space-y-3">
            <button
              onClick={() => setMode('summary')}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              ← Back to summary
            </button>
            <SensorDetailPanel mower={mower} openedAt={openedAt} />
          </div>
        )}
      </Drawer>
    </>
  );
}
