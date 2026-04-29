import type { DeviceState } from '../types';

interface Props {
  mower: DeviceState | null;
}

export function WorkRecordsPage({ mower }: Props) {
  if (!mower) {
    return <div className="p-8 text-zinc-500">Select a mower.</div>;
  }
  return (
    <div className="p-8 text-zinc-500">
      Work records port to this tab in Phase 3.
    </div>
  );
}
