import { useState } from 'react';
import { Header } from './Header';
import { Drawer } from './Drawer';
import { useDevices } from '../hooks/useDevices';
import { useActiveMower } from '../hooks/useActiveMower';
import { ActiveMowerProvider } from '../contexts/ActiveMowerContext';
import { MapTab } from '../pages/MapTab';
import { SchedulePage } from '../pages/SchedulePage';
import { WorkRecordsPage } from '../pages/WorkRecordsPage';
import { SettingsPage } from '../pages/SettingsPage';

type Tab = 'map' | 'schedule' | 'records' | 'settings';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'map', label: 'Map' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'records', label: 'Records' },
  { id: 'settings', label: 'Settings' },
];

function ShellInner() {
  const { devices, loading, connected, logs, bleLogs, otaProgress, liveOutlines, coveredLanes } = useDevices();
  const { activeMower, activeMowerSn, setActiveMowerSn, knownMowers } = useActiveMower(devices);
  const [tab, setTab] = useState<Tab>('map');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Rain state derivation lands in Phase 2 — for now: null.
  const rainState = null;

  if (loading) {
    return <div className="p-8 text-zinc-500">Loading…</div>;
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      <Header
        knownMowers={knownMowers}
        activeMowerSn={activeMowerSn}
        onSelectMower={setActiveMowerSn}
        rainState={rainState}
        onOpenDrawer={() => setDrawerOpen(true)}
      />

      <nav className="flex gap-1 px-4 bg-zinc-900 border-b border-zinc-800 flex-shrink-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id ? 'border-emerald-500 text-zinc-100' : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 flex flex-col min-h-0 p-4">
        {tab === 'map' && (
          <MapTab
            mower={activeMower}
            connected={connected}
            liveOutlines={liveOutlines}
            coveredLanes={coveredLanes}
            otaProgress={otaProgress}
          />
        )}
        {tab === 'schedule' && <SchedulePage mower={activeMower} />}
        {tab === 'records' && <WorkRecordsPage mower={activeMower} />}
        {tab === 'settings' && <SettingsPage mower={activeMower} />}
      </main>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <p className="text-sm text-zinc-500">Drawer cards land in Phase 4.</p>
      </Drawer>

      {/* Bottom-of-page debug strip kept temporarily so existing log/BLE views remain reachable until Phase 4 lands their drawer cards. */}
      <details className="mt-8 mx-4 mb-4 text-xs text-zinc-500">
        <summary className="cursor-pointer">Legacy debug (temporary)</summary>
        <pre className="overflow-auto max-h-64">{JSON.stringify({ logs: logs.slice(-5), bleLogs: bleLogs.slice(-5) }, null, 2)}</pre>
      </details>
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
