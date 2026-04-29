import { useEffect, useMemo } from 'react';
import { useActiveMowerContext } from '../contexts/ActiveMowerContext';
import type { DeviceState } from '../types';

export interface UseActiveMowerResult {
  activeMower: DeviceState | null;
  activeMowerSn: string | null;
  setActiveMowerSn: (sn: string | null) => void;
  /**
   * False until the persisted-SN read from localStorage has resolved. Consumers
   * MUST treat `activeMowerSn === null` while `hydrated === false` as
   * "loading" rather than "no mower selected" — otherwise the UI flashes an
   * empty state on every refresh before the previous selection is restored.
   */
  hydrated: boolean;
  knownMowers: DeviceState[];
}

export function useActiveMower(devices: Map<string, DeviceState>): UseActiveMowerResult {
  const { activeMowerSn, setActiveMowerSn, hydrated } = useActiveMowerContext();

  const knownMowers = useMemo(() => {
    return Array.from(devices.values()).filter(d => d.deviceType === 'mower');
  }, [devices]);

  // Auto-select the first known mower when none is selected and we just hydrated.
  useEffect(() => {
    if (!hydrated) return;
    if (activeMowerSn) return;
    if (knownMowers.length === 0) return;
    setActiveMowerSn(knownMowers[0].sn);
  }, [hydrated, activeMowerSn, knownMowers, setActiveMowerSn]);

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

  return { activeMower, activeMowerSn, setActiveMowerSn, hydrated, knownMowers };
}
