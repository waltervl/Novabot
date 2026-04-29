import type { DeviceState } from '../types';
import { Scheduler } from '../components/schedule/Scheduler';

interface Props {
  mower: DeviceState | null;
}

export function SchedulePage({ mower }: Props) {
  if (!mower) {
    return <div className="p-8 text-zinc-500">Select a mower.</div>;
  }
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <Scheduler
        sn={mower.sn}
        online={mower.online}
      />
    </div>
  );
}
