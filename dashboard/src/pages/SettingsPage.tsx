import type { DeviceState } from '../types';

interface Props {
  mower: DeviceState | null;
}

export function SettingsPage({ mower }: Props) {
  if (!mower) {
    return <div className="p-8 text-zinc-500">Select a mower.</div>;
  }
  return (
    <div className="p-8 text-zinc-500">
      Settings page lands in Phase 3.
    </div>
  );
}
