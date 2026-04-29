import { Settings } from 'lucide-react';
import { MowerPicker } from './MowerPicker';
import { RainBadge } from './RainBadge';
import type { DeviceState } from '../types';

interface Props {
  knownMowers: DeviceState[];
  activeMowerSn: string | null;
  onSelectMower: (sn: string) => void;
  rainState: 'dry' | 'rain' | 'paused-by-rain' | null;
  onOpenDrawer: () => void;
}

export function Header({ knownMowers, activeMowerSn, onSelectMower, rainState, onOpenDrawer }: Props) {
  return (
    <header className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800">
      <div className="flex items-center gap-3">
        <MowerPicker mowers={knownMowers} activeMowerSn={activeMowerSn} onChange={onSelectMower} />
        <RainBadge rainState={rainState} />
      </div>
      <button
        onClick={onOpenDrawer}
        className="text-zinc-400 hover:text-zinc-100"
        aria-label="Open diagnostics drawer"
      >
        <Settings className="w-5 h-5" />
      </button>
    </header>
  );
}
