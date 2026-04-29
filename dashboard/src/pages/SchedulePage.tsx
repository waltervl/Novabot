import type { DeviceState } from '../types';

interface Props {
  mower: DeviceState | null;
}

export function SchedulePage({ mower }: Props) {
  if (!mower) {
    return <div className="p-8 text-zinc-500">Select a mower.</div>;
  }
  return (
    <div className="p-8 text-zinc-500">
      Schedule view ports to this tab in Phase 2.
    </div>
  );
}
