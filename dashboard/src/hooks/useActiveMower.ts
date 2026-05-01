import { useEffect, useMemo } from 'react';
import { useActiveMowerContext } from './useActiveMowerContext';
import type { DeviceState } from '../types';

export interface UseActiveMowerResult {
  activeMower: DeviceState | null;
  activeMowerSn: string | null;
  setActiveMowerSn: (sn: string | null) => void;
  knownMowers: DeviceState[];
}

export function useActiveMower(devices: Map<string, DeviceState>): UseActiveMowerResult {
  const { activeMowerSn, setActiveMowerSn } = useActiveMowerContext();

  const knownMowers = useMemo(() => {
    return Array.from(devices.values()).filter(d => d.deviceType === 'mower');
  }, [devices]);

  // Auto-select the first known mower when none is selected.
  useEffect(() => {
    if (activeMowerSn) return;
    if (knownMowers.length === 0) return;
    setActiveMowerSn(knownMowers[0].sn);
  }, [activeMowerSn, knownMowers, setActiveMowerSn]);

  // If the previously-selected SN disappears (mower removed), fall back to the first remaining mower.
  useEffect(() => {
    if (!activeMowerSn) return;
    if (knownMowers.length === 0) return;
    if (!knownMowers.some(m => m.sn === activeMowerSn)) {
      setActiveMowerSn(knownMowers[0].sn);
    }
  }, [activeMowerSn, knownMowers, setActiveMowerSn]);

  const activeMower = useMemo(() => {
    if (!activeMowerSn) return null;
    return devices.get(activeMowerSn) ?? null;
  }, [activeMowerSn, devices]);

  return { activeMower, activeMowerSn, setActiveMowerSn, knownMowers };
}
