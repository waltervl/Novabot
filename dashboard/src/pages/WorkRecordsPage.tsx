import type { DeviceState } from '../types';
import { WorkHistory } from '../components/history/WorkHistory';

interface Props {
  mower: DeviceState | null;
}

export function WorkRecordsPage({ mower }: Props) {
  if (!mower) {
    return <div className="p-8 text-zinc-500">Select a mower.</div>;
  }
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <WorkHistory sn={mower.sn} />
    </div>
  );
}
