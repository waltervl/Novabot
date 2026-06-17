/**
 * MowQueueContext — sequential multi-map mowing queue.
 *
 * The stock mqtt_node binary's `start_navigation` command takes one `area`
 * value (uint32) and only starts ONE map per call. To support "mow map1
 * AND map3 but not map2" we orchestrate it in the app: enqueue the
 * selected mapIds, send the first start_navigation, watch the active
 * mower's `msg` field for `Work:FINISHED` + error_status=0, then send
 * the next.
 *
 * State is persisted to AsyncStorage so a JS reload mid-cycle resumes
 * cleanly. The queue is per-SN — switching mowers does not interfere.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useActiveMower } from '../hooks/useActiveMower';
import { ApiClient, type MapData } from '../services/api';
import { getServerUrl } from '../services/auth';

interface QueueItem {
  mapId: string;
  mapName: string;
  /** Index into the workMaps array, used to encode `area`
   *  (0 → 1, 1 → 10, 2 → 200) per Flutter decompilation. */
  mapIdx: number;
}

interface QueueState {
  sn: string;
  cuttingHeight: number;        // user cm (2..9), wire = cm − 2
  pathDirection: number;
  remaining: QueueItem[];       // INCLUDES the currently-running map at index 0
  startedAt: number;
}

interface MowQueueContextValue {
  /** Active queue state for the current mower, or null when idle. */
  queue: QueueState | null;
  /** Start a multi-map sequence. Returns once the FIRST map has been
   *  dispatched. The remaining maps are scheduled by the watcher. */
  enqueue: (params: {
    sn: string;
    mapIds: string[];
    cuttingHeight: number;
    pathDirection: number;
  }) => Promise<void>;
  /** Clear the queue without stopping the mower. Used when the user
   *  presses Stop in the UI — the stop_task command goes through the
   *  normal HomeScreen path. */
  clear: () => Promise<void>;
}

const MowQueueContext = createContext<MowQueueContextValue>({
  queue: null,
  enqueue: async () => {},
  clear: async () => {},
});

const STORAGE_KEY_PREFIX = 'novabot_mowQueue_';

function storageKey(sn: string): string {
  return `${STORAGE_KEY_PREFIX}${sn}`;
}

function isMowingMsg(msg: string): boolean {
  return msg.includes('Work:RUNNING')
      || msg.includes('Work:COVERING')
      || msg.includes('Work:NAVIGATING')
      || msg.includes('Work:BOUNDARY_COVERING')
      || msg.includes('Work:AVOIDING');
}

export function MowQueueProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<QueueState | null>(null);
  const { activeMower } = useActiveMower();
  const sn = activeMower?.sn ?? null;
  // Edge-detect FINISHED: only fire once per transition into Work:FINISHED.
  const wasMowingRef = useRef(false);
  // Coalesce double-advance during the brief window between FINISHED and
  // the next start_navigation actually running.
  const advanceLockRef = useRef(false);

  // Issue #34: queues persisted in SecureStore stayed forever — if a user
  // ever started a multi-map run and the app/mower never reached
  // Work:FINISHED (force-quit, mower error, network, cold reload) the
  // banner reappeared on every cold-start regardless of mower state. Drop
  // any persisted queue that's older than this threshold; a real session
  // never legitimately spans this long.
  const MAX_QUEUE_AGE_MS = 6 * 60 * 60 * 1000; // 6h

  // ── Hydration: load persisted queue when active SN changes ────────
  useEffect(() => {
    if (!sn) {
      setQueue(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(storageKey(sn)).catch(() => null);
        if (cancelled) return;
        if (!raw) {
          setQueue(null);
          return;
        }
        const parsed = JSON.parse(raw) as QueueState;
        const ageMs = Date.now() - (parsed.startedAt ?? 0);
        if (ageMs > MAX_QUEUE_AGE_MS) {
          // Stale — never resurrect. Drop the persisted entry too so the
          // next reload starts truly clean.
          SecureStore.deleteItemAsync(storageKey(sn)).catch(() => {});
          setQueue(null);
          return;
        }
        if (parsed.sn === sn && Array.isArray(parsed.remaining) && parsed.remaining.length > 0) {
          setQueue(parsed);
          // Reset edge-detect refs on hydrate so we don't immediately fire.
          wasMowingRef.current = false;
          advanceLockRef.current = false;
        }
      } catch {
        // Ignore — fall back to clean state.
      }
    })();
    return () => { cancelled = true; };
  }, [sn]);

  // ── Auto-clear stale queue when mower is idle on dock ─────────────
  // Even within MAX_QUEUE_AGE_MS, a queue is meaningless once the mower
  // has been parked + idle for a sustained window. Without this guard a
  // brief restart mid-queue (force-quit, mower error after first map)
  // left the banner stuck until the timestamp aged out. Detect "idle on
  // dock" — battery_state=CHARGING/FINISHED, task_mode=0, no Work:* mowing
  // substring — for 60 seconds and self-clear.
  const idleClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sensors = activeMower?.sensors ?? {};
  const batteryState = String(sensors.battery_state ?? '').toUpperCase();
  const taskMode = parseInt(String(sensors.task_mode ?? '0'), 10);
  const liveMsg = String(sensors.msg ?? '');
  const onDockIdle = (batteryState === 'CHARGING' || batteryState === 'FINISHED')
    && taskMode === 0
    && !isMowingMsg(liveMsg);

  useEffect(() => {
    if (!queue || queue.sn !== sn) return;
    if (!onDockIdle) {
      if (idleClearTimer.current) {
        clearTimeout(idleClearTimer.current);
        idleClearTimer.current = null;
      }
      return;
    }
    if (idleClearTimer.current) return; // already armed
    idleClearTimer.current = setTimeout(() => {
      console.log('[MowQueue] idle on dock 60s — clearing stale queue');
      setQueue(null);
      idleClearTimer.current = null;
    }, 60_000);
    return () => {
      if (idleClearTimer.current) {
        clearTimeout(idleClearTimer.current);
        idleClearTimer.current = null;
      }
    };
  }, [queue, sn, onDockIdle]);

  // ── Persist on every mutation ─────────────────────────────────────
  useEffect(() => {
    if (!sn) return;
    if (queue) {
      SecureStore.setItemAsync(storageKey(sn), JSON.stringify(queue)).catch(() => {});
    } else {
      SecureStore.deleteItemAsync(storageKey(sn)).catch(() => {});
    }
  }, [queue, sn]);

  // The server owns the queue (services/multiZoneMow.ts): it re-issues
  // start_navigation per zone on the Work:FINISHED → docked edge, so it
  // survives a backgrounded app. The client only kicks it off (enqueue) and
  // shows a banner; it no longer watches/dispatches.
  // ponytail: banner reads the local static list, not live server progress, so
  // "zones left" won't tick down mid-run. Add server status to the device
  // snapshot if accurate progress matters.

  // ── Public API ────────────────────────────────────────────────────
  const enqueue = useCallback(async ({
    sn: enqueueSn, mapIds, cuttingHeight, pathDirection,
  }: { sn: string; mapIds: string[]; cuttingHeight: number; pathDirection: number; }) => {
    if (mapIds.length === 0) return;

    // Translate mapIds → workMap order so we know each map's idx for area
    // encoding. Pull the canonical work-map list off the server so the
    // UI's selection (which only stores ids) maps to the firmware's
    // canonical order.
    const url = await getServerUrl();
    if (!url) return;
    const api = new ApiClient(url);
    let workMaps: MapData[] = [];
    try {
      const res = await api.fetchMaps(enqueueSn);
      workMaps = (res.maps ?? []).filter(m => m.mapType === 'work' && m.mapArea?.length >= 3);
    } catch {
      console.warn('[MowQueue] could not fetch maps, aborting enqueue');
      return;
    }

    const remaining: QueueItem[] = [];
    for (const id of mapIds) {
      const arrayIdx = workMaps.findIndex(m => m.mapId === id);
      if (arrayIdx < 0) continue;
      // Prefer the firmware-canonical slot index from canonicalName
      // ("map0", "map1", …) over the server's update-order array position.
      const canonicalMatch = (workMaps[arrayIdx].canonicalName ?? '').match(/^map(\d+)/);
      const mapIdx = canonicalMatch ? parseInt(canonicalMatch[1], 10) : arrayIdx;
      remaining.push({ mapId: id, mapName: workMaps[arrayIdx].mapName ?? id, mapIdx });
    }
    if (remaining.length === 0) return;

    // Banner only — the server drives the actual sequence.
    setQueue({ sn: enqueueSn, cuttingHeight, pathDirection, remaining, startedAt: Date.now() });
    try {
      await api.startMultiZone(enqueueSn, remaining.map(r => r.mapIdx), cuttingHeight);
    } catch (err) {
      console.warn('[MowQueue] startMultiZone failed:', err);
    }
  }, []);

  const clear = useCallback(async () => {
    setQueue(null);
    wasMowingRef.current = false;
    advanceLockRef.current = false;
  }, []);

  const value = useMemo(() => ({ queue, enqueue, clear }), [queue, enqueue, clear]);

  return (
    <MowQueueContext.Provider value={value}>
      {children}
    </MowQueueContext.Provider>
  );
}

export function useMowQueue(): MowQueueContextValue {
  return useContext(MowQueueContext);
}
