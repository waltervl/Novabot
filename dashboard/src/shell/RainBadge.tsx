import { CloudRain } from 'lucide-react';

interface Props {
  rainState: 'dry' | 'rain' | 'paused-by-rain' | null;
}

export function RainBadge({ rainState }: Props) {
  if (!rainState || rainState === 'dry') return null;
  const label = rainState === 'paused-by-rain' ? 'Paused (rain)' : 'Rain';
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-900/40 text-blue-200 rounded text-xs">
      <CloudRain className="w-3 h-3" />
      {label}
    </span>
  );
}
