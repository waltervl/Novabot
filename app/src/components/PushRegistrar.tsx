/**
 * PushRegistrar — invisible mount-only component that registers an
 * Expo push token with the OpenNova server for every bound mower.
 *
 * Mount it once inside the authenticated tree (anywhere we have access
 * to useMowerState). It re-runs when
 * the set of bound mower SNs changes, so newly-paired devices pick up
 * pushes within the next sensor tick.
 */
import { useEffect } from 'react';
import { useMowerState } from '../hooks/useMowerState';
import { registerPushTokenForMowers } from '../services/pushNotifications';

export function PushRegistrar(): null {
  const { devices } = useMowerState();

  // Stable string of bound SNs so the effect only re-runs on actual
  // membership changes (not on every sensor update).
  const snKey = Array.from(devices.keys()).sort().join(',');

  useEffect(() => {
    if (!snKey) return;
    const sns = snKey.split(',');
    void registerPushTokenForMowers(sns);
  }, [snKey]);

  return null;
}
