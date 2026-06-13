import { useState } from 'react';
import { Header } from './Header';
import { Drawer } from './Drawer';
import { DeviceChips } from './DeviceChips';
import { useDevices } from '../hooks/useDevices';
import { useActiveMower } from '../hooks/useActiveMower';
import { ActiveMowerProvider } from '../contexts/ActiveMowerContext';
import { MapTab } from '../pages/MapTab';
import { SchedulePage } from '../pages/SchedulePage';
import { WorkRecordsPage } from '../pages/WorkRecordsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { NetworkHealthCard } from '../components/drawer/NetworkHealthCard';
import { LiveStatusCard } from '../components/drawer/LiveStatusCard';
import { ServerLogTail, FloatingServerLog } from '../components/drawer/ServerLogTail';
import { MowerControls } from '../components/dashboard/MowerControls';
import type { PatternPlacement } from '../components/patterns/PatternOverlay';
import { LongPauseBanner } from './LongPauseBanner';
import { MdnsConflictBanner } from './MdnsConflictBanner';

type Tab = 'map' | 'schedule' | 'records' | 'settings';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'map', label: 'Map' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'records', label: 'Records' },
  { id: 'settings', label: 'Settings' },
];

function ShellInner() {
  const { devices, loading, connected, otaProgress, liveOutlines, coveredLanes } = useDevices();
  const { activeMower, activeMowerSn, setActiveMowerSn, knownMowers } = useActiveMower(devices);
  const [tab, setTab] = useState<Tab>('map');
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The enlarged server-log lives here (not in the drawer) so it stays open
  // when the drawer closes; only its own ✕ dismisses it.
  const [logFloating, setLogFloating] = useState(false);
  // Bridge: the Start-sheet Preview button (in the header MowerControls) signals
  // the MowerMap (in MapTab) to show a fresh coverage preview at the chosen
  // direction. Nonce makes repeated clicks re-fire even with the same direction.
  const [previewRequest, setPreviewRequest] = useState<{ nonce: number; covDirection: number; canonicals: string[]; polygonArea?: Array<{ latitude: number; longitude: number }> } | null>(null);
  // Pattern placement bridge: the Start-sheet Pattern tab (header MowerControls)
  // and the MowerMap (MapTab) are far apart in the tree. patternMode tells the
  // map to accept placement clicks (and stop polygons from swallowing them);
  // patternCenter flows map→controls, patternPlacement flows controls→map.
  const [patternMode, setPatternMode] = useState(false);
  const [patternCenter, setPatternCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [patternPlacement, setPatternPlacement] = useState<PatternPlacement | null>(null);
  // True while the map is actually fetching the mower coverage preview — drives
  // the Preview button's disabled/spinner state so it waits for the real result.
  const [previewLoading, setPreviewLoading] = useState(false);

  // Rain state derived from active mower's sensors. The mower reports
  // `rain_paused: '1'` when a scheduled run is currently paused by rain
  // and `rain_detected: '1'` when the rain sensor is wet but no run is
  // active. Both fields are absent on stock v5.x firmware — we fall
  // back to 'dry' (which RainBadge renders as no badge).
  const rainState: 'dry' | 'rain' | 'paused-by-rain' | null = activeMower
    ? activeMower.sensors.rain_paused === '1'
      ? 'paused-by-rain'
      : activeMower.sensors.rain_detected === '1'
      ? 'rain'
      : 'dry'
    : null;

  // Mower controls (start/pause/stop/…) are hosted inside the map's floating
  // tool-bar (passed down as a slot) instead of the status row, so they live
  // together with the map tools.
  const mowerControls = activeMower ? (
    <MowerControls
      sn={activeMower.sn}
      online={activeMower.online}
      sensors={activeMower.sensors}
      onPreview={(covDirection, canonicals, polygonArea) => { setTab('map'); setPreviewRequest({ nonce: Date.now(), covDirection, canonicals, polygonArea }); }}
      patternCenter={patternCenter}
      onPatternModeChange={(active) => { setPatternMode(active); if (active) setTab('map'); if (!active) setPatternCenter(null); }}
      onPatternPlacementChange={setPatternPlacement}
      previewLoading={previewLoading}
    />
  ) : null;

  if (loading) {
    return <div className="p-8 text-zinc-500">Loading…</div>;
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      <Header
        connected={connected}
        rainState={rainState}
        onOpenDrawer={() => setDrawerOpen(true)}
      />

      {/* Single row: device identity + live telemetry (left) and the tab nav
          (right), so the status and the tabs share one line. */}
      <div className="px-4 py-1.5 bg-zinc-900 border-b border-zinc-800 flex-shrink-0 flex items-center gap-3 flex-wrap">
        {/* Mower selector (left) */}
        <DeviceChips
          part="identity"
          mower={activeMower}
          knownMowers={knownMowers}
          onSelectMower={setActiveMowerSn}
        />
        {/* Tabs (middle) */}
        <nav className="flex items-center gap-1 p-0.5 rounded-xl bg-zinc-800/40 border border-zinc-700/60">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                tab === t.id
                  ? 'bg-zinc-700 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/40'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {/* Live telemetry (far right) */}
        <div className="ml-auto">
          <DeviceChips
            part="telemetry"
            mower={activeMower}
            knownMowers={knownMowers}
            onSelectMower={setActiveMowerSn}
          />
        </div>
      </div>

      <MdnsConflictBanner />
      <LongPauseBanner mower={activeMower} />

      <main className="flex-1 flex flex-col min-h-0 p-4">
        {tab === 'map' && (
          <MapTab
            mower={activeMower}
            connected={connected}
            liveOutlines={liveOutlines}
            coveredLanes={coveredLanes}
            otaProgress={otaProgress}
            previewRequest={previewRequest}
            patternPlacement={patternPlacement}
            onMapClickForPattern={patternMode ? setPatternCenter : undefined}
            controlsSlot={mowerControls}
            onPreviewLoading={setPreviewLoading}
          />
        )}
        {tab === 'schedule' && <SchedulePage mower={activeMower} />}
        {tab === 'records' && <WorkRecordsPage mower={activeMower} />}
        {tab === 'settings' && <SettingsPage mower={activeMower} />}
      </main>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <NetworkHealthCard />
        <LiveStatusCard sn={activeMowerSn} />
        <ServerLogTail enlarged={logFloating} onEnlarge={() => setLogFloating(true)} />
      </Drawer>

      {/* Floating server-log window — top-level so it survives the drawer. */}
      <FloatingServerLog open={logFloating} onClose={() => setLogFloating(false)} />
    </div>
  );
}

export function DashboardShell() {
  return (
    <ActiveMowerProvider>
      <ShellInner />
    </ActiveMowerProvider>
  );
}
