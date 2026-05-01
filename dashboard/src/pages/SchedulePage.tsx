import { useTranslation } from 'react-i18next';
import type { DeviceState } from '../types';
import { Scheduler } from '../components/schedule/Scheduler';
import { ScheduleTimeline } from '../components/schedule/ScheduleTimeline';

interface Props {
  mower: DeviceState | null;
}

export function SchedulePage({ mower }: Props) {
  const { t } = useTranslation();
  if (!mower) {
    return <div className="p-8 text-zinc-500">{t('pages.selectMower')}</div>;
  }
  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-4 p-4">
      <ScheduleTimeline sn={mower.sn} />
      <Scheduler
        sn={mower.sn}
        online={mower.online}
      />
    </div>
  );
}
