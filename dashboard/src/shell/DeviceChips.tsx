import React, { useState, useEffect } from 'react';
import {
  BatteryMedium, BatteryCharging, Satellite, Wifi, Thermometer,
  Activity, ChevronDown, TreePine,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Drawer } from './Drawer';
import type { DeviceState } from '../types';
import { fetchLoraStatus, type LoraStatus } from '../api/client';
import { workStatusLabel } from '../utils/workStatus';

interface Props {
  mower: DeviceState | null;
  knownMowers: DeviceState[];
  onSelectMower: (sn: string) => void;
  /** Which half to render. Lets the shell place the mower switcher and the live
   *  telemetry capsule on opposite ends of the tab row. Omit to render both. */
  part?: 'identity' | 'telemetry';
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

// ── Telemetry capsule cell ───────────────────────────────────────────────────
// One readout inside the status capsule: a muted icon + a mono value, with a
// hairline divider on the right (the capsule strips the last divider).

function TeleCell({
  icon: Icon,
  value,
  color = 'text-zinc-200',
  iconColor = 'text-zinc-500',
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string | number;
  color?: string;
  iconColor?: string;
  label?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 border-r border-zinc-700/40 last:border-r-0"
      title={label}
    >
      <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
      <span className={`tabular-nums text-xs font-semibold ${color}`}>{value}</span>
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
  const { t } = useTranslation();
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
            {mower.online ? `● ${t('drawer.summary.online')}` : `● ${t('drawer.summary.offline')}`}
          </span>
          {mower.sensors.sw_version && (
            <span className="font-mono text-purple-400">&lt;/&gt; {mower.sensors.sw_version}</span>
          )}
        </div>
        {mower.lastSeen && (
          <p className="text-[10px] text-zinc-500">
            {t('drawer.summary.lastSeen')}: {new Date(mower.lastSeen).toLocaleString()}
          </p>
        )}
      </div>

      {/* Configuration */}
      {lora && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">
            {t('drawer.summary.configuration')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-zinc-900 rounded border border-zinc-800 p-2">
              <p className="text-[10px] text-zinc-500">{t('drawer.summary.loraAddress')}</p>
              <p className="text-sm font-mono text-zinc-100">{lora.pair.address ?? '—'}</p>
            </div>
            <div className="bg-zinc-900 rounded border border-zinc-800 p-2">
              <p className="text-[10px] text-zinc-500">{t('drawer.summary.loraChannel')}</p>
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
            {lora.drift ? t('drawer.summary.pairDrift') : t('drawer.summary.pairSync')}
          </span>
        </div>
      )}

      {/* Advanced button */}
      <button
        onClick={() => setMode('advanced')}
        className="w-full mt-4 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-sm text-zinc-200"
      >
        {t('drawer.summary.showAdvanced')}
      </button>
    </div>
  );
}

// ── Main DeviceChips component ───────────────────────────────────────────────

export function DeviceChips({ mower, knownMowers, onSelectMower, part }: Props): React.JSX.Element | null {
  const { t } = useTranslation();
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
    const offlineBadge = (
      <span className="text-[10px] bg-zinc-800 text-zinc-500 px-2 py-1 rounded-full">{t('chips.offline')}</span>
    );
    // Telemetry slot has nothing live when offline — just the offline badge.
    if (part === 'telemetry') return offlineBadge;
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
          {!part && offlineBadge}
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

  const rtkFixQuality = s.rtk_fix_quality as string | undefined;
  const hasRtkFixQuality = rtkFixQuality != null && rtkFixQuality !== '';
  const RTK_FIX_QUALITY_COLORS: Record<string, string> = {
    'RTK Fixed':  '#22c55e',
    'RTK Float':  '#f59e0b',
    'DGPS':       '#eab308',
    'GPS':        '#9ca3af',
    'No fix':     '#ef4444',
  };
  const rtkFixQualityColor = rtkFixQuality != null
    ? (RTK_FIX_QUALITY_COLORS[rtkFixQuality] ?? '#6b7280')
    : '#6b7280';

  const hasSensorData = Object.keys(s).length > 0;

  // ── Online chip ─────────────────────────────────────────────────────────────
  const rtkLabel = hasRtkFixQuality
    ? rtkFixQuality!
    : mowerRtkKnown ? (mowerRtk ? 'RTK' : 'No RTK') : null;
  const rtkColor = hasRtkFixQuality
    ? rtkFixQualityColor
    : (mowerRtk ? '#34d399' : '#6b7280');

  // Mower identity / switcher (click zone 1: switch active mower)
  const identityEl = knownMowers.length > 1 ? (
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setSwitcherOpen(v => !v); }}
                className="inline-flex items-center gap-2 h-8 pl-1.5 pr-2.5 rounded-xl bg-zinc-800/50 border border-zinc-700/70 hover:bg-zinc-800 hover:border-zinc-600 transition-colors text-sm font-semibold text-zinc-100"
              >
                <span className="grid place-items-center w-6 h-6 rounded-lg bg-emerald-950/50 border border-emerald-800/40">
                  <TreePine className="w-3.5 h-3.5 text-emerald-400" />
                </span>
                {mower.nickname ?? mower.sn}
                <ChevronDown className={`w-3 h-3 text-zinc-500 transition-transform ${switcherOpen ? 'rotate-180' : ''}`} />
              </button>
              {switcherOpen && (
                <div className="absolute top-full left-0 mt-1.5 z-[100] bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl min-w-[170px] p-1">
                  {knownMowers.map(m => (
                    <button
                      key={m.sn}
                      onClick={(e) => { e.stopPropagation(); setSwitcherOpen(false); onSelectMower(m.sn); }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-zinc-800 ${m.sn === mower.sn ? 'text-emerald-400' : 'text-zinc-200'}`}
                    >
                      {m.nickname ?? m.sn}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span className="inline-flex items-center gap-2 h-8 pl-1.5 pr-2.5 rounded-xl bg-zinc-800/40 border border-zinc-700/50 text-sm font-semibold text-zinc-100">
              <span className="grid place-items-center w-6 h-6 rounded-lg bg-emerald-950/50 border border-emerald-800/40">
                <TreePine className="w-3.5 h-3.5 text-emerald-400" />
              </span>
              {mower.nickname ?? mower.sn}
            </span>
          );

  // Telemetry capsule (click zone 2: open sensor drawer)
  const telemetryEl = (
    <button
      onClick={openDrawer}
            className="group inline-flex items-stretch h-8 rounded-xl bg-zinc-900/60 border border-zinc-700/70 hover:border-zinc-600 overflow-hidden transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            aria-label={`${mower.nickname ?? mower.sn} sensor details`}
          >
            {/* Online dot */}
            <span className="inline-flex items-center px-2.5 border-r border-zinc-700/40">
              <span
                className="w-2 h-2 rounded-full bg-emerald-400"
                style={{ boxShadow: '0 0 0 3px rgba(52,211,153,.18)' }}
                title={t('drawer.summary.online')}
              />
            </span>

            {hasSensorData ? (
              <>
                {hasBattery && (
                  <TeleCell
                    icon={isCharging ? BatteryCharging : BatteryMedium}
                    value={`${battery}%`}
                    color={battery >= 20 ? 'text-emerald-300' : 'text-red-400'}
                    iconColor={battery >= 20 ? 'text-emerald-400/80' : 'text-red-400'}
                    label={`Battery: ${battery}%${isCharging ? ' (charging)' : ''}`}
                  />
                )}

                {hasSats && (
                  <TeleCell
                    icon={Satellite}
                    value={mowerSats}
                    color={mowerSats >= 15 ? 'text-sky-300' : mowerSats >= 8 ? 'text-yellow-300' : 'text-red-400'}
                    iconColor={mowerSats >= 15 ? 'text-sky-400/80' : mowerSats >= 8 ? 'text-yellow-400/80' : 'text-red-400'}
                    label={`RTK satellites: ${mowerSats}`}
                  />
                )}

                {/* RTK fix — quality when known, else a bare yes/no */}
                {rtkLabel && (
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 border-r border-zinc-700/40"
                    title={`RTK fix quality: ${rtkLabel}`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: rtkColor }} />
                    <span className="text-xs font-semibold" style={{ color: rtkColor }}>{rtkLabel}</span>
                  </span>
                )}

                {hasWifi && (
                  <TeleCell
                    icon={Wifi}
                    value={`${wifiRssi}`}
                    color={Math.abs(wifiRssi) < 60 ? 'text-emerald-300' : Math.abs(wifiRssi) < 75 ? 'text-yellow-300' : 'text-red-400'}
                    iconColor={Math.abs(wifiRssi) < 60 ? 'text-emerald-400/80' : Math.abs(wifiRssi) < 75 ? 'text-yellow-400/80' : 'text-red-400'}
                    label={`WiFi RSSI: ${wifiRssi} dBm`}
                  />
                )}

                {hasCpu && (
                  <TeleCell
                    icon={Thermometer}
                    value={`${cpuTemp}°`}
                    color={cpuTemp < 50 ? 'text-zinc-200' : cpuTemp < 65 ? 'text-yellow-300' : 'text-red-400'}
                    iconColor={cpuTemp < 50 ? 'text-zinc-500' : cpuTemp < 65 ? 'text-yellow-400/80' : 'text-red-400'}
                    label={`CPU temp: ${cpuTemp}°C`}
                  />
                )}

                {hasWork && (
                  <TeleCell
                    icon={Activity}
                    value={workStatusLabel(workStatus)}
                    color="text-emerald-300"
                    iconColor="text-emerald-400/80"
                    label={`Work status: ${workStatus}`}
                  />
                )}
              </>
            ) : (
              <span className="inline-flex items-center px-2.5 text-zinc-600 text-[10px] italic">waiting…</span>
            )}

            <span className="inline-flex items-center px-1.5 text-zinc-500 group-hover:text-zinc-300">
              <ChevronDown className="w-3 h-3" />
            </span>
          </button>
  );

  // Sensor detail drawer — separate instance from the gear-icon drawer
  const drawerEl = (
    <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={t('drawer.title.sensors')}>
        {mode === 'summary' ? (
          <SummaryPanel mower={mower} lora={lora} setMode={setMode} />
        ) : (
          <div className="space-y-3">
            <button
              onClick={() => setMode('summary')}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              {t('drawer.summary.backToSummary')}
            </button>
            <SensorDetailPanel mower={mower} openedAt={openedAt} />
          </div>
        )}
    </Drawer>
  );

  if (part === 'identity') return identityEl;
  if (part === 'telemetry') return (<>{telemetryEl}{drawerEl}</>);
  return (
    <>
      <div className="inline-flex items-center gap-2">{identityEl}{telemetryEl}</div>
      {drawerEl}
    </>
  );
}
