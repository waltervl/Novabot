import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Play, Pause, Square, PlugZap, ArrowUp, X, ChevronDown, MapPin,
  Map as MapIcon, Sparkles, RotateCw, Navigation, Settings2,
  Power, Camera, Gauge, Battery, Eye, MoreHorizontal, Slice,
  Home, SkipForward, CloudRain, Gamepad2, Anchor,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MapData, GpsPoint, LocalPoint } from '../../types';
import {
  sendCommand, sendExtendedCommand, fetchMaps, startPatrol, stopPatrol, rebootMower,
  setChargeThreshold, setMaxSpeed, previewPath,
  setDemoMode as setDemoModeApi, getDemoMode,
  fetchRainForecast, findIncomingRain, setRainIgnoreSession,
} from '../../api/client';
import { localToGps } from '../../utils/coords';
import { mmToCutterhigh, workMapToArea, nextCmdNum } from '../../utils/mqtt';
import {
  deriveMowerActivity,
  deriveHasError,
  isInterruptedCoverage as isInterruptedCoverageFn,
  isMowerBusy,
  type MowerActivity,
} from '../../utils/mowerActivity';
import { useToast } from '../common/Toast';
import { PatternPicker } from '../patterns/PatternPicker';
import { loadPattern, transformToGps, type NormContour } from '../../utils/patternUtils.js';
import { offsetPolygon } from '../../utils/polygonOffset.js';
import type { PatternPlacement } from '../patterns/PatternOverlay';
import { ManualControlPanel } from './ManualControlPanel';
import { ReanchorWizard } from './ReanchorWizard';

// Path direction: 0–180° in 15° steps (matches app StartMowSheet.tsx stepper).

interface PendingPolygon {
  mapId: string;
  mapName: string;
  mapArea: LocalPoint[];
}

interface Props {
  sn: string;
  online: boolean;
  sensors?: Record<string, string>;
  onPathDirectionChange?: (deg: number | null) => void;
  pendingPolygon?: PendingPolygon | null;
  onStarted?: () => void;
  onPatternPlacementChange?: (placement: PatternPlacement | null) => void;
  onPatternModeChange?: (active: boolean) => void;
  onOffsetPreviewChange?: (preview: Array<{ lat: number; lng: number }> | null) => void;
  patternCenter?: { lat: number; lng: number } | null;
}

export function MowerControls({
  sn, online, sensors, onPathDirectionChange, pendingPolygon, onStarted,
  onPatternPlacementChange, onPatternModeChange, onOffsetPreviewChange, patternCenter,
}: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [mappingExpanded, setMappingExpanded] = useState(false);
  const [maps, setMaps] = useState<MapData[]>([]);
  const [chargerGps, setChargerGps] = useState<GpsPoint | null>(null);
  const [cuttingHeight, setCuttingHeight] = useState(40);
  const [pathDirection, setPathDirection] = useState(0);
  const [mapId, setMapId] = useState('');
  const [mapName, setMapName] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  // Work-map count drives the "no map" gate on the Start button (mirrors the
  // app's serverMapCount === 0). Fetched once per SN; the firmware's map_num
  // sensor lags after deletes so we trust the server list like the app does.
  const [workMapCount, setWorkMapCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    setWorkMapCount(null);
    fetchMaps(sn)
      .then(resp => {
        if (cancelled) return;
        setWorkMapCount(resp.maps.filter(x => x.mapType === 'work' && x.mapArea.length >= 3).length);
      })
      .catch(() => { if (!cancelled) setWorkMapCount(0); });
    return () => { cancelled = true; };
  }, [sn]);

  // Long-pause tracking (mirrors app: amber + confirm once paused > 15 min).
  const LONG_PAUSE_THRESHOLD_MS = 15 * 60 * 1000;
  const pauseStartRef = useRef<number | null>(null);
  const [pausedForMs, setPausedForMs] = useState(0);

  // Mode: 'map' (start_navigation) | 'pattern' (start_run+pattern poly) |
  // 'edge' (extended start_edge_cut). Mirrors app StartMowSheet's mode picker.
  const [edgeMode, setEdgeMode] = useState(false);

  // Rain-check before manual start/resume (mirrors app StartMowSheet). When the
  // forecast shows rain within ~3h we surface a confirm modal with an optional
  // "ignore rain this session" toggle. The promise-based gate lets handleStart/
  // handleResume await the user's choice inline.
  const [rainPrompt, setRainPrompt] = useState<{ mm: number; prob: number; atMs: number } | null>(null);
  const [rainIgnoreToggle, setRainIgnoreToggle] = useState(false);
  const rainResolveRef = useRef<((proceed: boolean) => void) | null>(null);

  // Returns true if it is safe to proceed now (no rain, or user confirmed). A
  // forecast error never blocks mowing — fail open, like the app.
  const checkRainGate = useCallback(async (): Promise<boolean> => {
    try {
      const forecast = await fetchRainForecast(sn);
      const rain = findIncomingRain(forecast);
      if (!rain) return true;
      setRainIgnoreToggle(false);
      setRainPrompt(rain);
      return await new Promise<boolean>(resolve => { rainResolveRef.current = resolve; });
    } catch {
      return true;
    }
  }, [sn]);

  // User accepted the rain prompt. If the toggle was on, persist the per-session
  // ignore flag before resolving the gate (best-effort).
  const confirmRainStart = useCallback(async () => {
    setRainPrompt(null);
    if (rainIgnoreToggle && sn) {
      try { await setRainIgnoreSession(sn, true); } catch { /* best-effort */ }
    }
    rainResolveRef.current?.(true);
    rainResolveRef.current = null;
  }, [rainIgnoreToggle, sn]);

  const cancelRainStart = useCallback(() => {
    setRainPrompt(null);
    rainResolveRef.current?.(false);
    rainResolveRef.current = null;
  }, []);

  // Pattern mowing state
  const [patternMode, setPatternMode] = useState(false);
  const [patternId, setPatternId] = useState<number | null>(null);
  const [patternContours, setPatternContours] = useState<NormContour[]>([]);
  const [patternSize, setPatternSize] = useState(15);
  const [patternRotation, setPatternRotation] = useState(0);
  const [edgeOffset, setEdgeOffset] = useState(0);

  // Extended controls state
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [moreExpanded, setMoreExpanded] = useState(false);
  const [showManualControl, setShowManualControl] = useState(false);

  // ── Multi-map mowing queue (mirrors app MowQueueContext) ───────────
  // start_navigation only mows ONE map per call. To mow every work zone
  // ("Alle werkgebieden") we dispatch the first, watch the mower's msg for
  // Work:FINISHED + error_status 0, then dispatch the next. `queue` holds the
  // remaining zones INCLUDING the currently-running one at index 0.
  interface QueueEntry { mapId: string; mapName: string; area: number }
  const [queue, setQueue] = useState<QueueEntry[] | null>(null);
  const queueWireHeightRef = useRef(0);
  const queueTotalRef = useRef(0);
  const queueWasMowingRef = useRef(false);
  const queueAdvanceLockRef = useRef(false);

  const dispatchQueueNav = useCallback(async (entry: QueueEntry, wireHeight: number) => {
    const navResult = await sendCommand(sn, {
      start_navigation: { mapName: 'test', cutterhigh: wireHeight, area: entry.area, cmd_num: nextCmdNum() },
    }).catch(() => ({ ok: false } as { ok: boolean }));
    if (!navResult.ok) {
      await sendCommand(sn, {
        start_run: { mapName: null, area: entry.area, cutterhigh: wireHeight },
      }).catch(() => {});
    }
  }, [sn]);

  const clearQueue = useCallback(() => {
    setQueue(null);
    queueWasMowingRef.current = false;
    queueAdvanceLockRef.current = false;
  }, []);
  const [patrolActive, setPatrolActive] = useState(false);
  const [chargeThresholdVal, setChargeThresholdVal] = useState(20);
  const [maxSpeedVal, setMaxSpeedVal] = useState(0.5);
  const [rebootConfirm, setRebootConfirm] = useState(false);
  const [demoActive, setDemoActive] = useState(false);

  // Load demo mode status on mount
  useEffect(() => {
    if (!sn) return;
    getDemoMode(sn).then(r => setDemoActive(r.demoMode)).catch(() => {});
  }, [sn]);

  const toggleDemo = async () => {
    try {
      const r = await setDemoModeApi(sn, !demoActive);
      setDemoActive(r.demoMode);
      toast(r.demoMode ? 'Demo mode ON — commands are simulated' : 'Demo mode OFF', 'success');
    } catch {
      toast('Failed to toggle demo mode', 'error');
    }
  };

  const isMappingActive = sensors?.start_edit_or_assistant_map_flag === '1';
  const gpsEnabled = sensors?.gps_state === 'ENABLE';
  const locInitialized = sensors?.localization_state === 'INITIALIZED' || sensors?.localization_state === 'Initialized';
  const mappingReady = gpsEnabled && locInitialized;

  useEffect(() => {
    if (expanded && maps.length === 0) {
      fetchMaps(sn).then(resp => {
        setMaps(resp.maps.filter(x => x.mapType === 'work' && x.mapArea.length >= 3));
        setChargerGps(resp.chargerGps);
      }).catch(() => {});
    }
  }, [sn, expanded, maps.length]);

  // Auto-expand and select when a pending polygon arrives
  useEffect(() => {
    if (pendingPolygon && online) {
      setExpanded(true);
      setPatternMode(false);
      setMapId(pendingPolygon.mapId);
      setMapName(pendingPolygon.mapName);
      onPathDirectionChange?.(pathDirection);
    }
  }, [pendingPolygon]);

  // Load pattern contours when selection changes
  useEffect(() => {
    if (patternId) {
      loadPattern(patternId).then(setPatternContours).catch(() => setPatternContours([]));
    } else {
      setPatternContours([]);
    }
  }, [patternId]);

  // Update pattern overlay on map whenever placement params change
  useEffect(() => {
    if (patternMode && patternContours.length > 0 && patternCenter) {
      onPatternPlacementChange?.({
        contours: patternContours,
        center: patternCenter,
        sizeMeter: patternSize,
        rotation: patternRotation,
      });
    } else {
      onPatternPlacementChange?.(null);
    }
  }, [patternMode, patternContours, patternCenter, patternSize, patternRotation]);

  // Signal pattern click mode to parent (for map click handler)
  useEffect(() => {
    onPatternModeChange?.(expanded && patternMode && patternId !== null);
  }, [expanded, patternMode, patternId]);

  // Clear pattern overlay when closing
  useEffect(() => {
    if (!expanded) {
      onPatternPlacementChange?.(null);
      onOffsetPreviewChange?.(null);
    }
  }, [expanded]);

  // Update offset preview on map
  useEffect(() => {
    if (!expanded || edgeOffset === 0 || patternMode) {
      onOffsetPreviewChange?.(null);
      return;
    }
    // Get current polygon source (local meters) and convert to GPS for offsetPolygon
    const localPoly = pendingPolygon?.mapId === mapId
      ? pendingPolygon.mapArea
      : maps.find(m => m.mapId === mapId)?.mapArea;
    if (localPoly && localPoly.length >= 3 && chargerGps) {
      const gpsPoly = localPoly.map(p => localToGps(p, chargerGps));
      onOffsetPreviewChange?.(offsetPolygon(gpsPoly, edgeOffset));
    } else {
      onOffsetPreviewChange?.(null);
    }
  }, [expanded, edgeOffset, mapId, patternMode, pendingPolygon, maps, chargerGps]);

  // Auto-clear reboot confirmation after 5s
  useEffect(() => {
    if (!rebootConfirm) return;
    const timer = setTimeout(() => setRebootConfirm(false), 5000);
    return () => clearTimeout(timer);
  }, [rebootConfirm]);

  // Clear reboot confirm when settings closes
  useEffect(() => {
    if (!settingsExpanded) setRebootConfirm(false);
  }, [settingsExpanded]);

  const send = useCallback(async (cmd: Record<string, unknown>, label?: string, refreshPara?: boolean) => {
    setBusy(true);
    try {
      const result = await sendCommand(sn, cmd);
      const cmdName = label || result.command || Object.keys(cmd)[0];
      toast(`✓ ${cmdName}`, 'success');
      if (refreshPara) {
        await sendCommand(sn, { get_para_info: {} }).catch(() => {});
      }
    } catch (err) {
      const cmdName = label || Object.keys(cmd)[0];
      const detail = err instanceof Error ? `: ${err.message}` : '';
      toast(`✗ ${cmdName}${detail}`, 'error');
    }
    setBusy(false);
  }, [sn, t, toast]);

  /**
   * Edge-cut start — mirrors app `HomeScreen.tsx:2090+`.
   * 1. set_para_info { defaultCuttingHeight: <wire enum cm-2> }
   * 2. extended start_edge_cut { mapName: 'map0', bladeHeight: <mm>, departFromDock }
   *
   * Mower runs the NTCP /boundary_follow action via robot_decision; bladeHeight
   * is mm (clamped 20..90 server-side per CLAUDE.md edge-cut memory).
   */
  const handleStartEdgeCut = useCallback(async () => {
    setBusy(true);
    try {
      const heightCm = Math.max(2, Math.min(9, Math.round(cuttingHeight / 10)));
      const wireHeight = heightCm - 2;
      const departFromDock = sensors?.recharge_status
        ? parseInt(sensors.recharge_status, 10) > 0
        : false;

      // Pre-set blade height (non-fatal)
      await sendCommand(sn, {
        set_para_info: { defaultCuttingHeight: wireHeight },
      }).catch(() => { /* ignore */ });

      const result = await sendExtendedCommand(sn, {
        start_edge_cut: {
          mapName: 'map0',
          bladeHeight: heightCm * 10,
          departFromDock,
        },
      });
      const detail = result.encrypted ? ` (encrypted, ${result.size}B)` : '';
      toast(`✓ ${t('controls.startEdgeCut') ?? 'Edge cut'}${detail}`, 'success');
      setExpanded(false);
      onStarted?.();
    } catch (err) {
      const detail = err instanceof Error ? `: ${err.message}` : '';
      toast(`✗ ${t('controls.startEdgeCut') ?? 'Edge cut'}${detail}`, 'error');
    }
    setBusy(false);
  }, [sn, sensors, cuttingHeight, t, toast, onStarted]);

  const handleStart = useCallback(async () => {
    setBusy(true);
    try {
      // Rain gate: if rain is forecast within ~3h, confirm first (mirrors app).
      if (!(await checkRainGate())) { setExpanded(false); return; }

      // Note: set_para_info (path_direction) is sent only when the user CHANGES the
      // direction slider below — not here at start time. This matches the official
      // Novabot app where set_para_info is sent from the direction picker, not during
      // the start mowing flow (app/src/components/StartMowSheet.tsx lines 295-298).

      // Convert mm UI value to firmware wire enum: cutterhigh = mm/10 - 2
      const wireHeight = mmToCutterhigh(cuttingHeight);

      if (patternMode && patternContours.length > 0 && patternCenter) {
        // Pattern mowing — use start_run with GPS workArea (pattern flow unchanged)
        const polySource = transformToGps(patternContours[0], patternCenter, patternSize, patternRotation);
        const startCmd: Record<string, unknown> = {
          map_id: `pattern_${patternId}`,
          map_name: `Pattern ${patternId}`,
        };
        if (polySource.length >= 3) {
          const finalPoly = edgeOffset !== 0 ? offsetPolygon(polySource, edgeOffset) : polySource;
          startCmd.workArea = finalPoly.map((p: { lat: number; lng: number }) => ({
            latitude: p.lat,
            longitude: p.lng,
          }));
        }
        const result = await sendCommand(sn, { start_run: startCmd });
        const detail = result.encrypted ? ` (encrypted, ${result.size}B)` : '';
        toast(`✓ ${t('controls.startMowing')}${detail}`, 'success');
      } else {
        // Normal map mowing — use start_navigation (mirrors app StartMowSheet.tsx).
        // App's `area` enum = mapIdx (0 → 1, 1 → 10, 2+ → 200). The 200 catch-all
        // is for the >2 case; the app NEVER ships area=200 for "alle werkgebieden"
        // because it queues each map separately via MowQueueContext.
        // Dashboard simplification: when "Alle werkgebieden" is selected, start
        // the first work map. Multi-map queueing is a follow-up.
        const workMaps = maps.filter(m => m.mapType === 'work');

        // "Alle werkgebieden" (mapId === '') + multiple zones → queue them and
        // mow each in turn (mirrors app MowQueue). A single zone (or a specific
        // pick) goes straight through with one start_navigation.
        if (!mapId && workMaps.length > 1) {
          const entries: QueueEntry[] = workMaps.map((m, idx) => ({
            mapId: m.mapId,
            mapName: m.mapName || m.mapId,
            area: workMapToArea(m, idx),
          }));
          queueWireHeightRef.current = wireHeight;
          queueTotalRef.current = entries.length;
          queueWasMowingRef.current = false;
          queueAdvanceLockRef.current = false;
          setQueue(entries);
          await dispatchQueueNav(entries[0], wireHeight);
          toast(`✓ ${t('controls.queueStarted', { count: entries.length, defaultValue: 'Wachtrij gestart ({{count}} zones)' })}`, 'success');
        } else {
          const targetMap = mapId
            ? workMaps.find(m => m.mapId === mapId)
            : workMaps[0];
          const fallbackIdx = targetMap ? workMaps.indexOf(targetMap) : 0;
          const areaParam = workMapToArea(targetMap, fallbackIdx);

          const navPayload: Record<string, unknown> = {
            mapName: 'test',
            cutterhigh: wireHeight,
            area: areaParam,
            cmd_num: nextCmdNum(),
          };
          const navResult = await sendCommand(sn, { start_navigation: navPayload });

          if (!navResult.ok) {
            // Fallback: old firmware protocol (matches app StartMowSheet.tsx line 317)
            await sendCommand(sn, {
              start_run: { mapName: null, area: areaParam, cutterhigh: wireHeight },
            });
          }

          const detail = navResult.encrypted ? ` (encrypted, ${navResult.size}B)` : '';
          toast(`✓ ${t('controls.startMowing')}${detail}`, 'success');
        }
      }

      setExpanded(false);
      onPathDirectionChange?.(null);
      onPatternPlacementChange?.(null);
      onStarted?.();
    } catch (err) {
      const detail = err instanceof Error ? `: ${err.message}` : '';
      toast(`✗ ${t('controls.startMowing')}${detail}`, 'error');
    }
    setBusy(false);
  }, [sn, cuttingHeight, pathDirection, edgeOffset, mapId, mapName, maps, pendingPolygon,
    patternMode, patternId, patternContours, patternCenter, patternSize, patternRotation,
    onPathDirectionChange, onPatternPlacementChange, onStarted, chargerGps, checkRainGate,
    dispatchQueueNav, t, toast]);

  // ── Activity-driven control state (mirrors app HomeScreen) ──────────────
  // The mower's derived activity decides which control buttons are shown,
  // hidden, or disabled — exactly like the OpenNova app. While mowing you
  // cannot start another session; while returning you only get Stop, etc.
  const hasError = deriveHasError(sensors);
  const activity: MowerActivity = deriveMowerActivity(sensors, { online: online || demoActive, hasError });
  // Mower is mid-task — firmware would reject a duplicate start_navigation
  // (Error 2). Detect via the raw msg field (work_status arrives translated).
  const mowerBusy = isMowerBusy(sensors);
  const noMap = workMapCount === 0;
  const interruptedCoverage = isInterruptedCoverageFn(sensors);

  // Frame re-anchor required after a bundle restore — nav is blocked until the
  // map frame is re-anchored on the dock (mirrors app HomeScreen frameUnvalidated).
  const frameUnvalidated = (sensors?.frame_unvalidated ?? '0') === '1';
  const [showReanchor, setShowReanchor] = useState(false);
  useEffect(() => { if (!frameUnvalidated) setShowReanchor(false); }, [frameUnvalidated]);

  // Long-pause timer — start when activity becomes 'paused', clear otherwise.
  useEffect(() => {
    if (activity !== 'paused') {
      pauseStartRef.current = null;
      setPausedForMs(0);
      return;
    }
    if (pauseStartRef.current === null) pauseStartRef.current = Date.now();
    const tick = () => {
      const start = pauseStartRef.current;
      if (start !== null) setPausedForMs(Date.now() - start);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [activity]);
  const isLongPause = pausedForMs > LONG_PAUSE_THRESHOLD_MS;

  // `busy`/offline gating applied on top of the per-activity gating.
  const disabled = busy || (!online && !demoActive);
  // The Start button is additionally blocked while the mower is already
  // executing a task, has an error, has no map, or is offline.
  const startDisabled = disabled || mowerBusy || hasError || noMap || frameUnvalidated || (!online && !demoActive);
  const btnBase = 'inline-flex items-center justify-center p-1 sm:p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed';
  // Hidden on mobile, shown on desktop — no inline-flex from btnBase to avoid Tailwind display conflict
  const btnHidden = 'hidden md:inline-flex items-center justify-center p-1 sm:p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed';

  // ── Activity-driven action handlers (mirror app HomeScreen) ─────────────

  // Go home: go_pile → 500ms → go_to_charge with chargerpile {200,200} sentinel
  // (matches app sendGoHome exactly).
  const sendGoHome = useCallback(async () => {
    setBusy(true);
    try {
      await sendCommand(sn, { go_pile: {} });
      await new Promise(r => setTimeout(r, 500));
      await sendCommand(sn, {
        go_to_charge: { cmd_num: nextCmdNum(), chargerpile: { latitude: 200, longitude: 200 } },
      });
      toast(`✓ ${t('controls.goToCharge')}`, 'success');
    } catch (err) {
      const detail = err instanceof Error ? `: ${err.message}` : '';
      toast(`✗ ${t('controls.goToCharge')}${detail}`, 'error');
    }
    setBusy(false);
  }, [sn, t, toast]);

  // ── Multi-map queue watcher (mirrors app MowQueueContext watcher) ──
  // Edge-detect Work:FINISHED after a mowing window; on a clean finish
  // (error_status 0) advance to the next zone after a short settle delay.
  useEffect(() => {
    if (!queue || queue.length === 0) return;
    const msg = sensors?.msg ?? '';
    const errStatus = parseInt((sensors?.error_status ?? '0').match(/\d+/)?.[0] ?? '0', 10);
    const mowing = /Work:(RUNNING|COVERING|NAVIGATING|BOUNDARY_COVERING|AVOIDING)/.test(msg);
    const finished = msg.includes('Work:FINISHED');

    if (mowing) {
      queueWasMowingRef.current = true;
      queueAdvanceLockRef.current = false;
      return;
    }
    if (queueWasMowingRef.current && finished && !queueAdvanceLockRef.current) {
      if (errStatus !== 0) {
        // Previous zone ended in an error — stop the queue so the user can look.
        queueWasMowingRef.current = false;
        clearQueue();
        toast(`✗ ${t('controls.queueAborted', { err: errStatus, defaultValue: 'Wachtrij gestopt (fout {{err}})' })}`, 'error');
        return;
      }
      queueAdvanceLockRef.current = true;
      queueWasMowingRef.current = false;
      const timer = setTimeout(() => {
        setQueue(prev => {
          if (!prev) return null;
          const next = prev.slice(1);
          if (next.length === 0) {
            queueAdvanceLockRef.current = false;
            toast(`✓ ${t('controls.queueDone', 'Alle zones gemaaid')}`, 'success');
            return null;
          }
          void dispatchQueueNav(next[0], queueWireHeightRef.current);
          return next;
        });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [sensors, queue, dispatchQueueNav, clearQueue, t, toast]);

  // Pause an active coverage session.
  const handlePause = useCallback(() => {
    void send({ pause_navigation: { cmd_num: nextCmdNum() } }, t('controls.pause'));
  }, [send, t]);

  // Resume a paused coverage session. Long pauses (>15 min) carry localization-
  // drift risk, so confirm first (mirrors app long-pause confirm).
  const handleResume = useCallback(async () => {
    if (isLongPause && !window.confirm(
      `Paused for ${Math.floor(pausedForMs / 60000)} min. Long pauses can cause localization drift and the mower may drive off the map. Resume anyway?`,
    )) return;
    if (!(await checkRainGate())) return;
    void send({ resume_navigation: { cmd_num: nextCmdNum() } }, t('controls.resume'));
  }, [send, t, isLongPause, pausedForMs, checkRainGate]);

  // Stop an active mowing/edge session: confirm, then stop_navigation (+
  // stop_boundary_follow for edge, best-effort).
  const handleStopMowing = useCallback(async (edge: boolean) => {
    if (!window.confirm('Stop mowing? The mower will halt where it is and the current session ends. It will NOT return to the dock.')) return;
    clearQueue();
    await send({ stop_navigation: { cmd_num: nextCmdNum() } }, t('controls.stop'));
    if (edge) {
      try { await sendExtendedCommand(sn, { stop_boundary_follow: {} }); } catch { /* best-effort */ }
    }
  }, [send, sn, t, clearQueue]);

  // Stop a return-to-dock: stop_to_charge cancels the auto_recharge action;
  // stop_navigation + stop_boundary_follow clear any lingering goals.
  const handleStopReturning = useCallback(async () => {
    clearQueue();
    await send({ stop_to_charge: {} }, t('controls.stop'));
    await sendCommand(sn, { stop_navigation: { cmd_num: nextCmdNum() } }).catch(() => {});
    try { await sendExtendedCommand(sn, { stop_boundary_follow: {} }); } catch { /* best-effort */ }
  }, [send, sn, t, clearQueue]);

  // Return-to-home: tijdens maaien/edge eerst vragen (stoppen-of-pauzeren), zoals
  // de OpenNova app. Bij idle direct naar huis.
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const handleGoHomeClick = useCallback(() => {
    if (activity === 'mowing' || activity === 'edge_cutting') { setShowReturnDialog(true); return; }
    void sendGoHome();
  }, [activity, sendGoHome]);
  // Taak beëindigen & terug: stop_navigation (+ boundary), dan naar huis.
  const endTaskAndReturn = useCallback(async () => {
    setShowReturnDialog(false);
    clearQueue();
    await send({ stop_navigation: { cmd_num: nextCmdNum() } }, t('controls.stop'));
    try { await sendExtendedCommand(sn, { stop_boundary_follow: {} }); } catch { /* best-effort */ }
    await new Promise(r => setTimeout(r, 500));
    await sendGoHome();
  }, [send, sn, t, sendGoHome, clearQueue]);
  // Taak pauzeren & terug: pause_navigation, dan naar huis (hervatten kan later).
  const pauseAndReturn = useCallback(async () => {
    setShowReturnDialog(false);
    await send({ pause_navigation: { cmd_num: nextCmdNum() } }, t('controls.pause'));
    await new Promise(r => setTimeout(r, 500));
    await sendGoHome();
  }, [send, t, sendGoHome]);

  const [previewing, setPreviewing] = useState(false);

  const handlePreview = useCallback(async () => {
    setPreviewing(true);
    try {
      let polySource: Array<{ lat: number; lng: number }> | undefined;
      if (patternMode && patternContours.length > 0 && patternCenter) {
        polySource = transformToGps(patternContours[0], patternCenter, patternSize, patternRotation);
      } else {
        const localPoly = pendingPolygon?.mapId === mapId
          ? pendingPolygon.mapArea
          : maps.find(m => m.mapId === mapId)?.mapArea;
        polySource = localPoly && chargerGps
          ? localPoly.map(p => localToGps(p, chargerGps))
          : undefined;
      }
      if (!polySource || polySource.length < 3) {
        toast(t('controls.previewNoArea'), 'error');
        setPreviewing(false);
        return;
      }
      const finalPoly = edgeOffset !== 0 ? offsetPolygon(polySource, edgeOffset) : polySource;
      const polygonArea = finalPoly.map(p => ({ latitude: p.lat, longitude: p.lng }));
      await previewPath(sn, polygonArea, pathDirection);
      toast(`✓ ${t('controls.previewPath')}`, 'success');
    } catch (err) {
      const detail = err instanceof Error ? `: ${err.message}` : '';
      toast(`✗ ${t('controls.previewPath')}${detail}`, 'error');
    }
    setPreviewing(false);
  }, [sn, patternMode, patternContours, patternCenter, patternSize, patternRotation,
    pendingPolygon, mapId, maps, edgeOffset, pathDirection, chargerGps, t, toast]);

  const patternReady = patternMode && patternId !== null && patternCenter !== null;

  return (
    <div className="relative">
      {/* Re-anchor required banner — shown when the map frame is unvalidated
          (after a bundle restore). Tapping opens the re-anchor wizard. */}
      {frameUnvalidated && (
        <button
          onClick={() => setShowReanchor(true)}
          className="flex items-center gap-2 w-full mb-1.5 px-2.5 py-2 rounded-lg bg-amber-900/30 ring-1 ring-amber-600/40 hover:bg-amber-900/45 transition-colors text-left"
        >
          <Anchor className="w-4 h-4 text-amber-300 flex-shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-semibold text-amber-200">{t('reanchor.bannerTitle', 'Opnieuw verankeren nodig')}</span>
            <span className="block text-[10px] text-amber-300/80 truncate">{t('reanchor.bannerBody', 'Het kaartframe moet opnieuw op de dock worden verankerd.')}</span>
          </span>
          <span className="text-[11px] font-bold text-amber-300">{t('reanchor.bannerCta', 'Openen')}</span>
        </button>
      )}

      {/* Multi-map queue banner — shows progress through the queued zones. */}
      {queue && queue.length > 0 && (
        <div className="flex items-center gap-2 mb-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-900/25 ring-1 ring-emerald-600/30">
          <SkipForward className="w-3.5 h-3.5 text-emerald-300 flex-shrink-0" />
          <span className="text-[11px] text-emerald-200 flex-1 truncate">
            {t('controls.queueProgress', {
              current: Math.max(1, queueTotalRef.current - queue.length + 1),
              total: queueTotalRef.current,
              name: queue[0]?.mapName ?? '',
              defaultValue: 'Zone {{current}}/{{total}} — {{name}}',
            })}
          </span>
          <button
            onClick={() => { void handleStopMowing(false); }}
            className="text-[11px] text-emerald-300/80 hover:text-red-300"
            title={t('controls.queueCancel', 'Wachtrij stoppen')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Action buttons row */}
      <div className="flex items-center gap-1">
        <button
          onClick={toggleDemo}
          className={`inline-flex items-center gap-1 text-xs h-7 px-1.5 sm:px-2 rounded transition-colors ${
            demoActive
              ? 'bg-amber-600 text-white'
              : 'bg-gray-700/60 text-gray-500 hover:text-amber-400 hover:bg-amber-700/30'
          }`}
          title={demoActive ? 'Demo mode ON — click to disable' : 'Enable demo mode (simulated commands)'}
        >
          <Sparkles className="w-3.5 h-3.5" />
          {demoActive && <span className="hidden sm:inline">Demo</span>}
        </button>

        {/* ── Activity-driven primary controls (mirror app HomeScreen) ──────
            Shown/hidden/enabled per the mower's derived activity so the
            dashboard behaves exactly like the app: e.g. while mowing the
            Start button is hidden and you get Pause/Stop/Go-Home instead. */}

        {/* START — shown when idle, charging, error, offline. Opens the
            start dropdown; when an interrupted coverage is parked on the dock
            it resumes instead (label "Resume"). Disabled on error/offline/
            no-map/busy. */}
        {(activity === 'idle' || activity === 'charging' || activity === 'error' || activity === 'offline') && (
          <button
            onClick={() => {
              if (interruptedCoverage) {
                void handleResume();
                return;
              }
              const next = !expanded;
              setExpanded(next);
              setSettingsExpanded(false);
              setMappingExpanded(false);
              setMoreExpanded(false);
              onPathDirectionChange?.(next ? pathDirection : null);
            }}
            disabled={startDisabled}
            className={`inline-flex items-center gap-1 text-xs h-7 px-1.5 sm:px-2.5 rounded transition-colors ${
              expanded
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-700/60 text-gray-400 hover:text-white hover:bg-emerald-700'
            } disabled:opacity-30 disabled:cursor-not-allowed`}
            title={
              hasError ? (t('controls.clearErrorFirst') ?? 'Clear error first')
              : noMap ? (t('controls.noMapCreateFirst') ?? 'Create a map first')
              : mowerBusy ? t('controls.busy')
              : (online || demoActive) ? t('controls.startMowing')
              : t('controls.mowerOffline')
            }
          >
            {interruptedCoverage ? <SkipForward className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">
              {interruptedCoverage ? t('controls.resume') : t('controls.start')}
            </span>
            {!interruptedCoverage && (
              <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            )}
          </button>
        )}

        {/* PAUSE — only while actively mowing or edge-cutting. */}
        {(activity === 'mowing' || activity === 'edge_cutting') && (
          <button
            onClick={handlePause}
            disabled={disabled}
            className={`${btnBase} bg-gray-700/60 text-yellow-400 hover:bg-yellow-700/40`}
            title={t('controls.pause')}
          >
            <Pause className="w-3.5 h-3.5" />
          </button>
        )}

        {/* RESUME — only while paused. Amber when paused > 15 min (long-pause
            drift risk), with a confirm before resuming. */}
        {activity === 'paused' && (
          <button
            onClick={handleResume}
            disabled={disabled}
            className={`${btnBase} ${isLongPause ? 'bg-amber-600 text-white hover:bg-amber-500' : 'bg-gray-700/60 text-green-400 hover:bg-green-700/40'}`}
            title={isLongPause ? `Paused ${Math.floor(pausedForMs / 60000)} min — resume (confirm)` : t('controls.resume')}
          >
            <Play className="w-3.5 h-3.5" />
          </button>
        )}

        {/* STOP — mowing/edge (confirm), paused, or returning. Hidden when
            idle/charging/mapping. */}
        {(activity === 'mowing' || activity === 'edge_cutting') && (
          <button
            onClick={() => { void handleStopMowing(activity === 'edge_cutting'); }}
            disabled={disabled}
            className={`${btnBase} bg-gray-700/60 text-red-400 hover:bg-red-700/40`}
            title={t('controls.stop')}
          >
            <Square className="w-3.5 h-3.5" />
          </button>
        )}
        {activity === 'paused' && (
          <button
            onClick={() => send({ stop_navigation: { cmd_num: nextCmdNum() } }, t('controls.stop'))}
            disabled={disabled}
            className={`${btnBase} bg-gray-700/60 text-red-400 hover:bg-red-700/40`}
            title={t('controls.stop')}
          >
            <Square className="w-3.5 h-3.5" />
          </button>
        )}
        {activity === 'returning' && (
          <button
            onClick={() => { void handleStopReturning(); }}
            disabled={disabled}
            className={`${btnBase} bg-gray-700/60 text-red-400 hover:bg-red-700/40`}
            title={t('controls.stop')}
          >
            <Square className="w-3.5 h-3.5" />
          </button>
        )}

        {/* GO-HOME — idle, error, mowing, edge, paused (NOT charging, returning,
            mapping, offline-enabled). Disabled when offline. Mirrors the app's
            Go-Home visibility (hidden on dock / while returning). */}
        {(activity === 'idle' || activity === 'error' || activity === 'mowing'
          || activity === 'edge_cutting' || activity === 'paused' || activity === 'offline') && (
          <button
            onClick={handleGoHomeClick}
            disabled={disabled || (!online && !demoActive)}
            className={`${btnBase} bg-gray-700/60 text-yellow-300 hover:bg-yellow-700/40`}
            title={t('controls.goToCharge')}
          >
            <Home className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          onClick={async () => {
            setBusy(true);
            try {
              if (patrolActive) {
                await stopPatrol(sn);
                setPatrolActive(false);
                toast(`✓ ${t('controls.stopPatrol')}`, 'success');
              } else {
                await startPatrol(sn);
                setPatrolActive(true);
                toast(`✓ ${t('controls.patrol')}`, 'success');
              }
            } catch (err) {
              const detail = err instanceof Error ? `: ${err.message}` : '';
              toast(`✗ Patrol${detail}`, 'error');
            }
            setBusy(false);
          }}
          disabled={disabled}
          className={`${btnHidden} ${
            patrolActive
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-700/60 text-cyan-400 hover:bg-cyan-700/40'
          }`}
          title={patrolActive ? t('controls.stopPatrol') : t('controls.patrol')}
        >
          <Navigation className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => { setMappingExpanded(!mappingExpanded); setExpanded(false); setSettingsExpanded(false); setMoreExpanded(false); }}
          disabled={disabled}
          className={`${btnHidden} ${
            mappingExpanded || isMappingActive
              ? 'bg-purple-600 text-white'
              : 'bg-gray-700/60 text-purple-400 hover:bg-purple-700/40'
          }`}
          title={t('controls.mapping')}
        >
          <MapIcon className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => { setSettingsExpanded(!settingsExpanded); setExpanded(false); setMappingExpanded(false); setMoreExpanded(false); }}
          disabled={disabled}
          className={`${btnHidden} ${
            settingsExpanded
              ? 'bg-gray-600 text-white'
              : 'bg-gray-700/60 text-gray-400 hover:text-white'
          }`}
          title={t('controls.extendedSettings')}
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => { setShowManualControl(true); setExpanded(false); setSettingsExpanded(false); setMappingExpanded(false); setMoreExpanded(false); }}
          disabled={disabled}
          className={`${btnHidden} bg-gray-700/60 text-sky-400 hover:bg-sky-700/40`}
          title={t('controls.manualControl', 'Handmatige besturing')}
        >
          <Gamepad2 className="w-3.5 h-3.5" />
        </button>

        {/* More button — mobile only */}
        <div className="relative md:hidden">
          <button
            onClick={() => { setMoreExpanded(!moreExpanded); setExpanded(false); setMappingExpanded(false); setSettingsExpanded(false); }}
            disabled={disabled}
            className={`${btnBase} ${moreExpanded ? 'bg-gray-600 text-white' : 'bg-gray-700/60 text-gray-400 hover:text-white'}`}
            title={t('controls.more')}
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          {moreExpanded && (
            <>
              <div className="fixed inset-0 z-[9998]" onClick={() => setMoreExpanded(false)} />
              <div className="absolute top-full right-0 mt-1 w-48 z-[10000] bg-gray-800 rounded-lg border border-gray-700 shadow-xl py-1">
                <button
                  onClick={async () => {
                    setMoreExpanded(false);
                    try {
                      setBusy(true);
                      await sendCommand(sn, { go_pile: {} });
                      await new Promise(r => setTimeout(r, 500));
                      await sendCommand(sn, {
                        go_to_charge: {
                          cmd_num: nextCmdNum(),
                          chargerpile: { latitude: 200, longitude: 200 },
                        },
                      });
                      toast(`✓ ${t('controls.goToCharge')}`, 'success');
                    } catch (err) {
                      const detail = err instanceof Error ? `: ${err.message}` : '';
                      toast(`✗ ${t('controls.goToCharge')}${detail}`, 'error');
                    }
                    setBusy(false);
                  }}
                  disabled={disabled}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-yellow-300 hover:bg-gray-700/50 transition-colors disabled:opacity-30"
                >
                  <PlugZap className="w-3.5 h-3.5" />
                  {t('controls.goToCharge')}
                </button>
                <button
                  onClick={async () => {
                    setMoreExpanded(false);
                    setBusy(true);
                    try {
                      if (patrolActive) {
                        await stopPatrol(sn);
                        setPatrolActive(false);
                        toast(`✓ ${t('controls.stopPatrol')}`, 'success');
                      } else {
                        await startPatrol(sn);
                        setPatrolActive(true);
                        toast(`✓ ${t('controls.patrol')}`, 'success');
                      }
                    } catch (err) {
                      const detail = err instanceof Error ? `: ${err.message}` : '';
                      toast(`✗ Patrol${detail}`, 'error');
                    }
                    setBusy(false);
                  }}
                  disabled={disabled}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors disabled:opacity-30 ${
                    patrolActive ? 'text-cyan-300 bg-cyan-900/20' : 'text-gray-300 hover:bg-gray-700/50'
                  }`}
                >
                  <Navigation className="w-3.5 h-3.5" />
                  {patrolActive ? t('controls.stopPatrol') : t('controls.patrol')}
                </button>
                <button
                  onClick={() => { setMoreExpanded(false); setShowManualControl(true); setExpanded(false); setSettingsExpanded(false); setMappingExpanded(false); }}
                  disabled={disabled}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-sky-300 hover:bg-gray-700/50 transition-colors disabled:opacity-30"
                >
                  <Gamepad2 className="w-3.5 h-3.5" />
                  {t('controls.manualControl', 'Handmatige besturing')}
                </button>
                <button
                  onClick={() => { setMoreExpanded(false); setMappingExpanded(!mappingExpanded); setExpanded(false); setSettingsExpanded(false); }}
                  disabled={disabled}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors disabled:opacity-30 ${
                    mappingExpanded || isMappingActive ? 'text-purple-300 bg-purple-900/20' : 'text-gray-300 hover:bg-gray-700/50'
                  }`}
                >
                  <MapIcon className="w-3.5 h-3.5" />
                  {t('controls.mapping')}
                </button>
                <button
                  onClick={() => { setMoreExpanded(false); setSettingsExpanded(!settingsExpanded); setExpanded(false); setMappingExpanded(false); }}
                  disabled={disabled}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors disabled:opacity-30 ${
                    settingsExpanded ? 'text-white bg-gray-700/30' : 'text-gray-300 hover:bg-gray-700/50'
                  }`}
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  {t('controls.extendedSettings')}
                </button>
              </div>
            </>
          )}
        </div>

      </div>

      {/* Expanded start settings dropdown */}
      {expanded && (
        <div className="absolute top-full right-0 mt-1 w-[calc(100vw-1rem)] sm:w-72 z-[10000] bg-gray-800 rounded-lg border border-gray-700 shadow-xl overflow-hidden">
          <div className="p-3 space-y-3">

            {/* Mode toggle: Map area / Pattern / Edge cut */}
            <div className="flex rounded-md overflow-hidden border border-gray-700">
              <button
                onClick={() => { setPatternMode(false); setEdgeMode(false); }}
                className={`flex-1 text-[10px] py-1.5 flex items-center justify-center gap-1 transition-colors ${
                  !patternMode && !edgeMode ? 'bg-emerald-600 text-white font-medium' : 'bg-gray-900 text-gray-500 hover:text-gray-300'
                }`}
              >
                <MapPin className="w-3 h-3" />
                {t('pattern.mapMode')}
              </button>
              <button
                onClick={() => { setPatternMode(true); setEdgeMode(false); }}
                className={`flex-1 text-[10px] py-1.5 flex items-center justify-center gap-1 transition-colors ${
                  patternMode && !edgeMode ? 'bg-purple-600 text-white font-medium' : 'bg-gray-900 text-gray-500 hover:text-gray-300'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                {t('pattern.patternMode')}
              </button>
              <button
                onClick={() => { setEdgeMode(true); setPatternMode(false); }}
                className={`flex-1 text-[10px] py-1.5 flex items-center justify-center gap-1 transition-colors ${
                  edgeMode ? 'bg-amber-600 text-white font-medium' : 'bg-gray-900 text-gray-500 hover:text-gray-300'
                }`}
              >
                <Slice className="w-3 h-3" />
                {t('controls.startEdgeCut') ?? 'Edge cut'}
              </button>
            </div>

            {/* ── Edge cut mode ── only height matters (mapName hardcoded 'map0') */}
            {edgeMode && (
              <p className="text-[10px] text-gray-400 leading-snug">
                Edge cut runs along the work-zone boundary at the chosen
                cutting height. Map is fixed to <code>map0</code>; dock
                departure detected automatically.
              </p>
            )}

            {/* ── Pattern mode ── */}
            {edgeMode ? null : patternMode ? (
              <>
                <PatternPicker
                  selected={patternId}
                  onSelect={setPatternId}
                />

                {patternId && !patternCenter && (
                  <div className="text-[10px] text-purple-300 bg-purple-900/20 border border-purple-800/30 rounded px-2 py-1.5 flex items-center gap-1.5">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    {t('pattern.clickToPlace')}
                  </div>
                )}

                {patternId && patternCenter && (
                  <>
                    {/* Size slider */}
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-[9px] text-gray-500 uppercase tracking-wide">{t('pattern.size')}</label>
                        <span className="text-[11px] text-gray-300 font-mono">{patternSize}m</span>
                      </div>
                      <input
                        type="range" min={3} max={60} step={1}
                        value={patternSize}
                        onChange={e => setPatternSize(parseInt(e.target.value))}
                        className="w-full h-1.5 mt-1 accent-purple-500 bg-gray-700 rounded-full appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-[8px] text-gray-600 mt-0.5">
                        <span>3m</span><span>60m</span>
                      </div>
                    </div>

                    {/* Rotation slider */}
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-[9px] text-gray-500 uppercase tracking-wide">{t('pattern.rotation')}</label>
                        <span className="text-[11px] text-gray-300 font-mono inline-flex items-center gap-1">
                          <RotateCw className="w-3 h-3" style={{ transform: `rotate(${patternRotation}deg)` }} />
                          {patternRotation}&deg;
                        </span>
                      </div>
                      <input
                        type="range" min={0} max={360} step={5}
                        value={patternRotation}
                        onChange={e => setPatternRotation(parseInt(e.target.value))}
                        className="w-full h-1.5 mt-1 accent-purple-500 bg-gray-700 rounded-full appearance-none cursor-pointer"
                      />
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                {/* ── Normal map mode ── */}
                {pendingPolygon && mapId === pendingPolygon.mapId ? (
                  <div>
                    <label className="text-[9px] text-gray-500 uppercase tracking-wide">{t('controls.workArea')}</label>
                    <div className="mt-1 flex items-center gap-2 bg-emerald-900/30 border border-emerald-700/50 rounded px-2 py-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-emerald-300 font-medium truncate">{pendingPolygon.mapName}</div>
                        <div className="text-[10px] text-emerald-400/70">
                          {pendingPolygon.mapArea.length} {t('controls.points')}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : maps.length > 0 && (
                  <div>
                    <label className="text-[9px] text-gray-500 uppercase tracking-wide">{t('controls.workArea')}</label>
                    <select
                      value={mapId}
                      onChange={e => {
                        const m = maps.find(x => x.mapId === e.target.value);
                        setMapId(e.target.value);
                        setMapName(m?.mapName ?? '');
                      }}
                      className="mt-1 w-full text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="">{t('controls.allWorkAreas')}</option>
                      {maps.map(m => (
                        <option key={m.mapId} value={m.mapId}>{m.mapName || m.mapId}</option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}

            {/* Cutting height stepper (both modes) — matches app StartMowSheet stepper */}
            <div>
              <label className="text-[9px] text-gray-500 uppercase tracking-wide block mb-1">{t('controls.cuttingHeight')}</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCuttingHeight(Math.max(20, cuttingHeight - 10))}
                  className="w-9 h-9 rounded-full bg-gray-800 hover:bg-gray-700 active:bg-gray-600 flex items-center justify-center text-emerald-400 text-lg font-semibold"
                >−</button>
                <div className="flex-1 text-center text-sm text-gray-200 font-mono">{Math.round(cuttingHeight / 10)} cm</div>
                <button
                  onClick={() => setCuttingHeight(Math.min(80, cuttingHeight + 10))}
                  className="w-9 h-9 rounded-full bg-gray-800 hover:bg-gray-700 active:bg-gray-600 flex items-center justify-center text-emerald-400 text-lg font-semibold"
                >+</button>
              </div>
            </div>

            {/* Edge offset stepper (map mode only — edge-cut + pattern hide it) */}
            {!patternMode && !edgeMode && (
              <div>
                <label className="text-[9px] text-gray-500 uppercase tracking-wide block mb-1">{t('controls.edgeOffset')}</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEdgeOffset(Math.max(-1, +(edgeOffset - 0.1).toFixed(1)))}
                    className="w-9 h-9 rounded-full bg-gray-800 hover:bg-gray-700 active:bg-gray-600 flex items-center justify-center text-orange-400 text-lg font-semibold"
                  >−</button>
                  <div className={`flex-1 text-center text-sm font-mono ${edgeOffset === 0 ? 'text-gray-500' : edgeOffset > 0 ? 'text-blue-300' : 'text-orange-300'}`}>
                    {edgeOffset === 0
                      ? 'No offset'
                      : edgeOffset > 0
                        ? `+${edgeOffset.toFixed(1)}m`
                        : `${edgeOffset.toFixed(1)}m`}
                  </div>
                  <button
                    onClick={() => setEdgeOffset(Math.min(1, +(edgeOffset + 0.1).toFixed(1)))}
                    className="w-9 h-9 rounded-full bg-gray-800 hover:bg-gray-700 active:bg-gray-600 flex items-center justify-center text-blue-400 text-lg font-semibold"
                  >+</button>
                </div>
                <div className="flex justify-between text-[8px] text-gray-600 mt-1 px-1">
                  <span>{t('controls.edgeOffsetShrink')}</span>
                  <span>{t('controls.edgeOffsetExpand')}</span>
                </div>
              </div>
            )}

            {/* Path direction stepper (both modes) — matches app StartMowSheet: 0–180° in 15° steps */}
            <div>
              <label className="text-[9px] text-gray-500 uppercase tracking-wide block mb-1">{t('controls.pathDirection')}</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const deg = Math.max(0, pathDirection - 15);
                    setPathDirection(deg);
                    onPathDirectionChange?.(deg);
                    sendCommand(sn, { set_para_info: { path_direction: deg } }).catch(() => {});
                  }}
                  className="w-9 h-9 rounded-full bg-gray-800 hover:bg-gray-700 active:bg-gray-600 flex items-center justify-center text-emerald-400 text-lg font-semibold"
                >−</button>
                <div className="flex-1 text-center text-sm text-gray-200 font-mono inline-flex items-center justify-center gap-1.5">
                  <ArrowUp className="w-3.5 h-3.5 transition-transform" style={{ transform: `rotate(${pathDirection}deg)` }} />
                  {pathDirection}°
                </div>
                <button
                  onClick={() => {
                    const deg = Math.min(180, pathDirection + 15);
                    setPathDirection(deg);
                    onPathDirectionChange?.(deg);
                    sendCommand(sn, { set_para_info: { path_direction: deg } }).catch(() => {});
                  }}
                  className="w-9 h-9 rounded-full bg-gray-800 hover:bg-gray-700 active:bg-gray-600 flex items-center justify-center text-emerald-400 text-lg font-semibold"
                >+</button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-gray-700">
              <button
                onClick={() => { setExpanded(false); onPathDirectionChange?.(null); onPatternPlacementChange?.(null); }}
                className="inline-flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
              <button
                onClick={handlePreview}
                disabled={previewing || busy}
                className="inline-flex items-center justify-center gap-1 text-xs px-2 py-2 rounded text-blue-300 bg-blue-900/40 hover:bg-blue-800/50 transition-colors disabled:opacity-40"
                title={t('controls.previewPath')}
              >
                <Eye className="w-3.5 h-3.5" />
                {previewing ? '...' : t('controls.preview')}
              </button>
              <button
                onClick={edgeMode ? handleStartEdgeCut : handleStart}
                disabled={busy || mowerBusy || (patternMode && !patternReady)}
                title={mowerBusy ? t('controls.busy') : undefined}
                className={`flex-1 inline-flex items-center justify-center gap-1 text-xs px-2 py-2 rounded text-white transition-colors font-medium disabled:opacity-40 ${
                  edgeMode ? 'bg-amber-600 hover:bg-amber-500'
                  : patternMode ? 'bg-purple-600 hover:bg-purple-500'
                  : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                {edgeMode ? <Slice className="w-3.5 h-3.5" />
                  : patternMode ? <Sparkles className="w-3.5 h-3.5" />
                  : <Play className="w-3.5 h-3.5" />}
                {busy ? t('controls.busy')
                  : edgeMode ? (t('controls.startEdgeCut') ?? 'Edge cut')
                  : patternMode ? t('pattern.startPattern')
                  : t('controls.startMowing')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mapping dropdown */}
      {mappingExpanded && !isMappingActive && (
        <div className="absolute top-full right-0 mt-1 w-[calc(100vw-1rem)] sm:w-64 z-[10000] bg-gray-800 rounded-lg border border-gray-700 shadow-xl p-3 space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full ${gpsEnabled ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-gray-400">{t('controls.gpsStatus')}: {gpsEnabled ? t('controls.gpsEnabled') : t('controls.gpsDisabled')}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full ${locInitialized ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-gray-400">{t('controls.locStatus')}: {sensors?.localization_state ?? '?'}</span>
            </div>
          </div>

          {!mappingReady && (
            <div className="text-[10px] text-amber-400 bg-amber-900/20 border border-amber-800/30 rounded px-2 py-1.5">
              {t('controls.mappingNotReady')}
            </div>
          )}

          <button
            onClick={() => { send({ start_assistant_build_map: {} }, t('controls.startMapping')); setMappingExpanded(false); }}
            disabled={busy}
            className="w-full text-xs px-3 py-2 rounded bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-40 font-medium"
          >
            {busy ? t('controls.busy') : t('controls.startAutonomousMapping')}
          </button>
        </div>
      )}

      {/* Extended settings dropdown */}
      {settingsExpanded && (
        <div className="absolute top-full right-0 mt-1 w-[calc(100vw-1rem)] sm:w-64 z-[10000] bg-gray-800 rounded-lg border border-gray-700 shadow-xl p-3 space-y-3">
          {/* Max speed */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[9px] text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <Gauge className="w-3 h-3" />
                {t('controls.maxSpeed')}
              </label>
              <span className="text-[11px] text-gray-300 font-mono">{maxSpeedVal.toFixed(1)} m/s</span>
            </div>
            <input
              type="range" min={0.1} max={1.0} step={0.1}
              value={maxSpeedVal}
              onChange={e => setMaxSpeedVal(parseFloat(e.target.value))}
              className="w-full h-1.5 mt-1 accent-blue-500 bg-gray-700 rounded-full appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-[8px] text-gray-600 mt-0.5">
              <span>0.1</span><span>1.0 m/s</span>
            </div>
            <button
              onClick={async () => {
                setBusy(true);
                try {
                  await setMaxSpeed(sn, maxSpeedVal);
                  toast(`✓ ${t('controls.maxSpeed')}: ${maxSpeedVal.toFixed(1)} m/s`, 'success');
                } catch { toast(`✗ ${t('controls.maxSpeed')}`, 'error'); }
                setBusy(false);
              }}
              disabled={busy}
              className="w-full mt-1.5 text-[10px] py-1 rounded bg-blue-700/40 text-blue-300 hover:bg-blue-700/60 transition-colors disabled:opacity-40"
            >
              {t('controls.apply')}
            </button>
          </div>

          <div className="border-t border-gray-700" />

          {/* Charge threshold */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[9px] text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <Battery className="w-3 h-3" />
                {t('controls.chargeThreshold')}
              </label>
              <span className="text-[11px] text-gray-300 font-mono">{chargeThresholdVal}%</span>
            </div>
            <input
              type="range" min={10} max={50} step={5}
              value={chargeThresholdVal}
              onChange={e => setChargeThresholdVal(parseInt(e.target.value))}
              className="w-full h-1.5 mt-1 accent-yellow-500 bg-gray-700 rounded-full appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-[8px] text-gray-600 mt-0.5">
              <span>10%</span><span>50%</span>
            </div>
            <button
              onClick={async () => {
                setBusy(true);
                try {
                  await setChargeThreshold(sn, chargeThresholdVal);
                  toast(`✓ ${t('controls.chargeThreshold')}: ${chargeThresholdVal}%`, 'success');
                } catch { toast(`✗ ${t('controls.chargeThreshold')}`, 'error'); }
                setBusy(false);
              }}
              disabled={busy}
              className="w-full mt-1.5 text-[10px] py-1 rounded bg-yellow-700/40 text-yellow-300 hover:bg-yellow-700/60 transition-colors disabled:opacity-40"
            >
              {t('controls.apply')}
            </button>
          </div>

          <div className="border-t border-gray-700" />

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={async () => {
                setBusy(true);
                try {
                  const resp = await fetch(`/api/dashboard/camera/${encodeURIComponent(sn)}/snapshot`);
                  if (!resp.ok) throw new Error(resp.statusText);
                  const blob = await resp.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `snapshot_${sn}_${Date.now()}.jpg`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast(`✓ ${t('controls.snapshot')}`, 'success');
                } catch { toast(`✗ ${t('controls.snapshot')}`, 'error'); }
                setBusy(false);
              }}
              disabled={busy}
              className="flex items-center justify-center gap-1 text-[10px] py-2 rounded bg-cyan-900/40 text-cyan-300 hover:bg-cyan-800/50 transition-colors disabled:opacity-40"
            >
              <Camera className="w-3 h-3" />
              {t('controls.snapshot')}
            </button>

            {!rebootConfirm ? (
              <button
                onClick={() => setRebootConfirm(true)}
                disabled={busy}
                className="flex items-center justify-center gap-1 text-[10px] py-2 rounded bg-red-900/40 text-red-300 hover:bg-red-800/50 transition-colors disabled:opacity-40"
              >
                <Power className="w-3 h-3" />
                {t('controls.reboot')}
              </button>
            ) : (
              <button
                onClick={async () => {
                  setBusy(true);
                  try {
                    await rebootMower(sn);
                    toast(`✓ ${t('controls.rebootSent')}`, 'success');
                  } catch { toast(`✗ ${t('controls.reboot')}`, 'error'); }
                  setRebootConfirm(false);
                  setBusy(false);
                }}
                disabled={busy}
                className="flex items-center justify-center gap-1 text-[10px] py-2 rounded bg-red-600 text-white hover:bg-red-500 transition-colors disabled:opacity-40 animate-pulse"
              >
                <Power className="w-3 h-3" />
                {t('controls.confirmReboot')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Return-to-home keuze (zoals de OpenNova app): beëindigen of pauzeren + terug. */}
      {showReturnDialog && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowReturnDialog(false)} />
          <div className="relative bg-gray-900 border border-gray-700/50 rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center bg-yellow-500/15">
                <Home className="w-7 h-7 text-yellow-300" />
              </div>
            </div>
            <p className="text-center text-white font-medium text-lg leading-snug mb-2">
              {t('controls.returnHome', 'Naar het laadstation')}
            </p>
            <p className="text-center text-gray-400 text-sm mb-6">
              {t('controls.returnHomeDesc', 'Hoe moet de maaier terugkeren?')}
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => { void endTaskAndReturn(); }}
                className="py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {t('controls.endTaskReturn', 'Taak beëindigen & terug')}
              </button>
              <button
                onClick={() => { void pauseAndReturn(); }}
                className="py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {t('controls.pauseTaskReturn', 'Taak pauzeren & terug')}
              </button>
              <button
                onClick={() => setShowReturnDialog(false)}
                className="py-2.5 bg-white/10 hover:bg-white/15 text-gray-300 text-sm font-medium rounded-xl transition-colors"
              >
                {t('common.cancel', 'Annuleren')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Re-anchor wizard — post-restore frame re-anchoring (mirrors app). */}
      {showReanchor && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowReanchor(false)} />
          <div className="relative bg-gray-900 border border-gray-700/50 rounded-2xl shadow-2xl max-w-sm w-full p-5 max-h-[90vh] overflow-y-auto">
            <ReanchorWizard
              sn={sn}
              online={online}
              sensors={sensors}
              onClose={() => setShowReanchor(false)}
            />
          </div>
        </div>
      )}

      {/* Manual control (joystick + blade) — mirrors the app JoystickScreen. */}
      {showManualControl && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowManualControl(false)} />
          <div className="relative bg-gray-900 border border-gray-700/50 rounded-2xl shadow-2xl max-w-sm w-full p-5">
            <ManualControlPanel
              sn={sn}
              online={online}
              sensors={sensors}
              onClose={() => setShowManualControl(false)}
            />
          </div>
        </div>
      )}

      {/* Rain forecast confirmation — mirrors the app StartMowSheet rain modal.
          Shown when rain is forecast within ~3h of a manual start/resume. */}
      {rainPrompt && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={cancelRainStart} />
          <div className="relative bg-gray-900 border border-gray-700/50 rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center bg-sky-500/15">
                <CloudRain className="w-7 h-7 text-sky-300" />
              </div>
            </div>
            <p className="text-center text-white font-medium text-lg leading-snug mb-2">
              {t('rain.warningTitle', 'Regen voorspeld')}
            </p>
            <p className="text-center text-gray-400 text-sm mb-5">
              {t('rain.warningDesc', {
                time: new Date(rainPrompt.atMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                mm: rainPrompt.mm.toFixed(1),
                prob: String(rainPrompt.prob),
                defaultValue: `Regen rond {{time}} ({{mm}} mm, {{prob}}%). Toch maaien?`,
              })}
            </p>
            <label className="flex items-start gap-3 mb-6 px-1 cursor-pointer">
              <input
                type="checkbox"
                checked={rainIgnoreToggle}
                onChange={e => setRainIgnoreToggle(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-emerald-500"
              />
              <span className="text-sm text-gray-300">
                {t('rain.ignoreSession', 'Negeer regen deze sessie')}
                <span className="block text-xs text-gray-500">
                  {t('rain.ignoreSessionHint', 'De maaier pauzeert dan niet automatisch bij regen tot deze sessie eindigt.')}
                </span>
              </span>
            </label>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => { void confirmRainStart(); }}
                className="py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {t('controls.startMowing', 'Start maaien')}
              </button>
              <button
                onClick={cancelRainStart}
                className="py-2.5 bg-white/10 hover:bg-white/15 text-gray-300 text-sm font-medium rounded-xl transition-colors"
              >
                {t('common.cancel', 'Annuleren')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
