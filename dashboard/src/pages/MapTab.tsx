import { useTranslation } from 'react-i18next';
import type { DeviceState } from '../types';
import { MowerMap } from '../components/map/MowerMap';

type OtaProgressEntry = { status: string; percentage: number | null; timestamp: number };

interface Props {
  mower: DeviceState | null;
  connected: boolean;
  liveOutlines: Map<string, Array<{ lat: number; lng: number }>>;
  coveredLanes: Map<string, Array<{ lat1: number; lng1: number; lat2: number; lng2: number }>>;
  otaProgress: Map<string, OtaProgressEntry>;
}

export function MapTab({ mower, liveOutlines, coveredLanes }: Props) {
  const { t } = useTranslation();
  if (!mower) {
    return <div className="p-8 text-zinc-500">{t('pages.selectMowerForMap')}</div>;
  }

  return (
    <MowerMap
      sn={mower.sn}
      lat={mower.sensors.latitude}
      lng={mower.sensors.longitude}
      heading={mower.sensors.theta}
      signals={{
        wifiRssi: mower.sensors.wifi_rssi,
        rtkSat: mower.sensors.rtk_sat,
        locQuality: mower.sensors.loc_quality,
        batteryPower: mower.sensors.battery_power ?? mower.sensors.battery_capacity,
        batteryState: mower.sensors.battery_state,
      }}
      mowing={{
        mowingProgress: mower.sensors.mowing_progress,
        coveringArea: mower.sensors.covering_area,
        finishedArea: mower.sensors.finished_area,
        workStatus: mower.sensors.work_status,
        mowSpeed: mower.sensors.mow_speed,
        covDirection: mower.sensors.cov_direction,
      }}
      liveOutline={liveOutlines.get(mower.sn) ?? null}
      coveredLanes={coveredLanes.get(mower.sn) ?? null}
    />
  );
}
