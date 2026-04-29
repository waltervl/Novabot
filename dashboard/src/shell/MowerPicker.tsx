import type { DeviceState } from '../types';

interface Props {
  mowers: DeviceState[];
  activeMowerSn: string | null;
  onChange: (sn: string) => void;
}

export function MowerPicker({ mowers, activeMowerSn, onChange }: Props) {
  if (mowers.length === 0) {
    return <div className="text-sm text-zinc-500">No mowers</div>;
  }
  if (mowers.length === 1) {
    const m = mowers[0];
    return (
      <div className="text-sm font-medium text-zinc-100">
        {m.nickname ?? m.sn}
      </div>
    );
  }
  return (
    <select
      value={activeMowerSn ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100"
    >
      {mowers.map(m => (
        <option key={m.sn} value={m.sn}>
          {m.nickname ?? m.sn}
        </option>
      ))}
    </select>
  );
}
