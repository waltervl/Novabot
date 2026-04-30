import { Settings } from 'lucide-react';
import { RainBadge } from './RainBadge';

interface Props {
  rainState: 'dry' | 'rain' | 'paused-by-rain' | null;
  onOpenDrawer: () => void;
}

export function Header({ rainState, onOpenDrawer }: Props) {
  return (
    <header className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800">
      <RainBadge rainState={rainState} />
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
