import { useEffect, useState, useCallback, useMemo, useRef, Fragment } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polygon, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import {
  MapPin, Map as MapIcon, Trash2, Route, Wifi, WifiOff, Satellite, Crosshair,
  Battery, BatteryCharging, BatteryLow, BatteryFull, Layers,
  SlidersHorizontal, Save, X, RotateCcw, Pencil, Check, Scissors, Navigation,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Download, Flame,
  Fence, Target, XCircle, CheckCircle2, Plus, Minus, Brush, Paintbrush, Eraser,
  Copy, ClipboardPaste, Spline, RefreshCw, Loader2, Move as MoveIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MapData, TrailPoint, MapCalibration, GpsPoint } from '../../types';
import {
  fetchMaps, fetchAllMaps, fetchTrail, clearTrail, fetchCalibration, saveCalibration,
  deleteMap, renameMap, updateMapArea, createMap, exportMaps,
  navigateToPosition, stopNavigation,
  fetchVirtualWalls, createVirtualWall, deleteVirtualWall,
  calibrateCharger,
  fetchEditGeometry, saveEditDraft, discardEditDrafts, applyEdits, revertEdits,
  getPreviewPath, refreshPreviewPath, getPlanPath, refreshPlanPath,
  type VirtualWall, type EditGeometryDto, type CoveragePathEntry,
} from '../../api/client';
import { localToGps, gpsToLocal, isUsableChargerGps } from '../../utils/coords';
import { applyBrush, densifyPolygon, hitTestEdge, offsetPolygon, pointInPolygon as pointInPolygonXY, polygonArea, simplifyPolygon, type XY } from '../../utils/editGeometry';
import { paintCircle, eraseCircle } from '../../utils/brushPaint';
import { useToast } from '../common/Toast';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { PolygonEditor } from './PolygonEditor';
import { MapEditBar } from './MapEditBar';
import { MowingStatsCard } from '../status/MowingStatsCard';
import { parseFinishedAreas, prefixedAreaId } from '../../utils/coverPathProgress';
import { PatternOverlay, type PatternPlacement } from '../patterns/PatternOverlay';

// Fix Leaflet default marker icons in Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Standaard positie (Nederland)
const DEFAULT_CENTER: [number, number] = [52.1409, 6.231];

// ── Obstacle copy/paste (R6) ──────────────────────────────────────
// Clipboard for copying an obstacle and pasting it as a new obstacle draft —
// onto the same work map or a different one, even after switching mowers.
// Points are LOCAL meters (charger = 0,0). Persisted to localStorage so the
// clipboard survives reloads and mower switches.
const OBSTACLE_CLIPBOARD_KEY = 'novabot.obstacleClipboard';
interface ObstacleClipboard {
  points: { x: number; y: number }[];
  sourceName?: string | null;
}
// Small fixed nudge (meters) used as the paste-placement fallback when a map
// view center isn't available, so the pasted obstacle never lands exactly on
// top of the original.
const PASTE_FALLBACK_DELTA = 0.7;

// Kleuren per kaarttype
const AREA_STYLES = {
  work:     { color: '#10b981', fillColor: '#10b981', fillOpacity: 0.25, weight: 2 },   // emerald
  obstacle: { color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.30, weight: 2 },   // red
  unicom:   { color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.20, weight: 2 },   // blue
  default:  { color: '#8b5cf6', fillColor: '#8b5cf6', fillOpacity: 0.25, weight: 2 },   // purple
} as const;

/** Bepaal kaarttype — primair uit mapType veld, fallback op mapId/mapName patronen */
function getAreaStyle(mapType?: string, mapId?: string, mapName?: string | null) {
  if (mapType === 'obstacle') return AREA_STYLES.obstacle;
  if (mapType === 'unicom') return AREA_STYLES.unicom;
  if (mapType === 'work') return AREA_STYLES.work;
  // Fallback voor oude kaarten zonder mapType
  const id = (mapId ?? '').toLowerCase();
  const name = (mapName ?? '').toLowerCase();
  if (id.includes('obstacle') || name.includes('obstakel') || name.includes('obstacle')) return AREA_STYLES.obstacle;
  if (id.includes('unicom') || name.includes('pad naar') || name.includes('kanaal') || name.includes('channel')) return AREA_STYLES.unicom;
  if (id.includes('work') || name.includes('werkgebied') || name.includes('map')) return AREA_STYLES.work;
  return AREA_STYLES.default;
}

interface SignalInfo {
  wifiRssi?: string;
  rtkSat?: string;
  locQuality?: string;
  batteryPower?: string;
  batteryState?: string;
}

interface MowingInfo {
  mowingProgress?: string;
  coveringArea?: string;
  finishedArea?: string;
  workStatus?: string;
  mowSpeed?: string;
  covDirection?: string;
}

interface Props {
  sn: string;
  lat?: string;
  lng?: string;
  /** Mower local-frame position (map_position_x/y). Live + cm-accurate, unlike
   *  the sporadic/base-offset reported GPS — used to place the mower marker. */
  mapX?: string;
  mapY?: string;
  heading?: string;
  /** Mower reachable (online + dashboard socket connected). Gates the
   *  coverage-path preview refresh — generate_preview needs an online mower. */
  online?: boolean;
  /** True while the mower is actively mowing (Work:RUNNING/NAVIGATING/COVERING/
   *  MOVING — computed in MapTab, mirrors the OpenNova app). Drives the coverage
   *  panel to show the LIVE plan path (get_map_plan_path) instead of refusing,
   *  and to poll it every ~5s while the overlay is shown. */
  mowingActive?: boolean;
  /** Volledige sensor-map (mower.sensors) — voor de MowingStatsCard tijdens maaien. */
  sensors?: Record<string, string>;
  signals?: SignalInfo;
  mowing?: MowingInfo;
  /** Wanneer ingesteld, toon een richting-overlay lijn op de kaart (graden, 0=N) */
  pathDirectionPreview?: number | null;
  /** Callback when a new map is saved (draw/edit) — used for draw-to-start flow */
  onMapSaved?: (map: MapData) => void;
  /** Live growing polygon boundary during autonomous mapping (report_state_map_outline) */
  liveOutline?: Array<{ lat: number; lng: number }> | null;
  /** Pattern placement preview on the map */
  patternPlacement?: PatternPlacement | null;
  /** Callback when user clicks on map to place a pattern */
  onMapClickForPattern?: (center: { lat: number; lng: number }) => void;
  /** Offset polygon preview (dashed) */
  offsetPreview?: Array<{ lat: number; lng: number }> | null;
  /** Afgelegde maai-banen van demo simulator */
  coveredLanes?: Array<{ lat1: number; lng1: number; lat2: number; lng2: number }> | null;
}

function wifiColor(rssi: number): string {
  if (rssi >= -50) return 'text-green-400';
  if (rssi >= -60) return 'text-yellow-400';
  if (rssi >= -70) return 'text-orange-400';
  return 'text-red-400';
}

function gpsColor(sats: number): string {
  if (sats >= 20) return 'text-green-400';
  if (sats >= 10) return 'text-yellow-400';
  return 'text-red-400';
}

function locColor(quality: number): string {
  if (quality >= 80) return 'text-green-400';
  if (quality >= 50) return 'text-yellow-400';
  return 'text-red-400';
}

function batteryColor(pct: number): string {
  if (pct >= 60) return 'text-green-400';
  if (pct >= 30) return 'text-yellow-400';
  if (pct >= 15) return 'text-orange-400';
  return 'text-red-400';
}

function RecenterMap({ position, hasManualInteraction, waitForFit }: { position: [number, number]; hasManualInteraction: boolean; waitForFit: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (waitForFit || hasManualInteraction) return;
    map.setView(position, map.getZoom());
  }, [map, position[0], position[1], hasManualInteraction, waitForFit]);
  return null;
}

/** Auto-fit map to polygon bounds on load */
function FitToMaps({ maps, onFitted }: { maps: Array<{ mapArea: Array<{ lat: number; lng: number }> }>; onFitted?: () => void }) {
  const map = useMap();
  const [fitted, setFitted] = useState(false);

  useEffect(() => {
    if (fitted || maps.length === 0) return;
    const allPoints: [number, number][] = [];
    for (const m of maps) {
      for (const p of m.mapArea) {
        allPoints.push([p.lat, p.lng]);
      }
    }
    if (allPoints.length < 2) return;
    const bounds = L.latLngBounds(allPoints);
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 23 });
    setFitted(true);
    onFitted?.();
  }, [map, maps, fitted, onFitted]);

  return null;
}

/** Invalidate Leaflet map size once on mount */
function ResizeHandler() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const t1 = setTimeout(() => map.invalidateSize(), 100);
    const t2 = setTimeout(() => map.invalidateSize(), 350);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [map]);
  return null;
}

/** Clip een lijn aan een polygon — geeft segmenten binnen de polygon terug. */
export function clipLineToPolygon(
  line: [[number, number], [number, number]],
  polygon: Array<{ lat: number; lng: number }>,
): [number, number][][] {
  const pts = polygon.map(p => [p.lat, p.lng] as [number, number]);
  const n = pts.length;
  if (n < 3) return [];
  const [aLat, aLng] = line[0];
  const [bLat, bLng] = line[1];
  const dLat = bLat - aLat;
  const dLng = bLng - aLng;
  const tValues: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const edLat = pts[j][0] - pts[i][0];
    const edLng = pts[j][1] - pts[i][1];
    const denom = dLat * edLng - dLng * edLat;
    if (Math.abs(denom) < 1e-15) continue;
    const t = ((pts[i][0] - aLat) * edLng - (pts[i][1] - aLng) * edLat) / denom;
    const u = ((pts[i][0] - aLat) * dLng - (pts[i][1] - aLng) * dLat) / denom;
    if (u >= 0 && u <= 1 && t >= 0 && t <= 1) tValues.push(t);
  }
  if (pointInPolygon(aLat, aLng, polygon)) tValues.push(0);
  if (pointInPolygon(bLat, bLng, polygon)) tValues.push(1);
  tValues.sort((a, b) => a - b);
  const segments: [number, number][][] = [];
  for (let i = 0; i < tValues.length - 1; i++) {
    const midT = (tValues[i] + tValues[i + 1]) / 2;
    if (pointInPolygon(aLat + dLat * midT, aLng + dLng * midT, polygon)) {
      segments.push([
        [aLat + dLat * tValues[i], aLng + dLng * tValues[i]],
        [aLat + dLat * tValues[i + 1], aLng + dLng * tValues[i + 1]],
      ]);
    }
  }
  return segments;
}

/** Coverage visualisatie — dunne lijntjes ~3px uit elkaar, geclipt aan polygon.
 *  Per lane worden meerdere parallelle dunne lijnen gerenderd, net als de Novabot app. */
export function CoverageStripes({ lanes, workPolys }: {
  lanes: Array<{ lat1: number; lng1: number; lat2: number; lng2: number }>;
  workPolys: Array<Array<{ lat: number; lng: number }>>;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const segments = useMemo(() => {
    if (lanes.length === 0 || workPolys.length === 0) return [];

    const lat = lanes[0].lat1;
    const metersPerPixel = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
    const spacingMeters = metersPerPixel * 3;  // 3px spacing
    const laneWidth = 0.28;
    const linesPerLane = Math.max(1, Math.round(laneWidth / spacingMeters));

    const result: [number, number][][] = [];

    for (const lane of lanes) {
      const dLat = lane.lat2 - lane.lat1;
      const dLng = lane.lng2 - lane.lng1;
      const len = Math.sqrt(dLat * dLat + dLng * dLng);
      if (len === 0) continue;
      const pLat = -dLng / len;
      const pLng = dLat / len;

      const cosLat = Math.cos(lat * Math.PI / 180);
      const mPerDeg = Math.sqrt((pLat * 111000) ** 2 + (pLng * 111000 * cosLat) ** 2);
      const halfWidthDeg = (laneWidth / 2) / mPerDeg;
      const stepDeg = linesPerLane > 1 ? laneWidth / mPerDeg / (linesPerLane - 1) : 0;

      const subLines: [[number, number], [number, number]][] = [];
      if (linesPerLane === 1) {
        subLines.push([[lane.lat1, lane.lng1], [lane.lat2, lane.lng2]]);
      } else {
        for (let i = 0; i < linesPerLane; i++) {
          const offset = -halfWidthDeg + i * stepDeg;
          subLines.push([
            [lane.lat1 + pLat * offset, lane.lng1 + pLng * offset],
            [lane.lat2 + pLat * offset, lane.lng2 + pLng * offset],
          ]);
        }
      }

      // Clip elke sub-lijn aan alle work polygons
      for (const sl of subLines) {
        for (const poly of workPolys) {
          const clipped = clipLineToPolygon(sl, poly);
          for (const seg of clipped) result.push(seg);
        }
      }
    }
    return result;
  }, [lanes, workPolys, zoom]);

  // Edge lines: eerste en laatste sub-lijn per lane voor witte rand
  const edgeSegments = useMemo(() => {
    if (lanes.length === 0 || workPolys.length === 0) return [];

    const lat = lanes[0].lat1;
    const metersPerPixel = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
    const spacingMeters = metersPerPixel * 3;
    const laneWidth = 0.28;
    const linesPerLane = Math.max(1, Math.round(laneWidth / spacingMeters));

    if (linesPerLane <= 2) return []; // te weinig lijnen voor edge effect

    const result: [number, number][][] = [];

    for (const lane of lanes) {
      const dLat = lane.lat2 - lane.lat1;
      const dLng = lane.lng2 - lane.lng1;
      const len = Math.sqrt(dLat * dLat + dLng * dLng);
      if (len === 0) continue;
      const pLat = -dLng / len;
      const pLng = dLat / len;

      const cosLat = Math.cos(lat * Math.PI / 180);
      const mPerDeg = Math.sqrt((pLat * 111000) ** 2 + (pLng * 111000 * cosLat) ** 2);
      const halfWidthDeg = (laneWidth / 2) / mPerDeg;

      // Alleen de buitenste twee lijnen (edges)
      for (const offset of [-halfWidthDeg, halfWidthDeg]) {
        const edgeLine: [[number, number], [number, number]] = [
          [lane.lat1 + pLat * offset, lane.lng1 + pLng * offset],
          [lane.lat2 + pLat * offset, lane.lng2 + pLng * offset],
        ];
        for (const poly of workPolys) {
          const clipped = clipLineToPolygon(edgeLine, poly);
          for (const seg of clipped) result.push(seg);
        }
      }
    }
    return result;
  }, [lanes, workPolys, zoom]);

  if (segments.length === 0) return null;

  return (
    <>
      {edgeSegments.length > 0 && (
        <Polyline
          positions={edgeSegments}
          pathOptions={{
            color: 'rgba(255,255,255,0.5)',
            weight: 2,
            opacity: 1,
            lineCap: 'butt',
          }}
        />
      )}
      <Polyline
        positions={segments}
        pathOptions={{
          color: '#026c4aff',
          weight: 3.5,
          opacity: 0.25,
          lineCap: 'butt',
        }}
      />
    </>
  );
}

/** Click handler for draw mode — adds points to the polygon */
function DrawClickHandler({ onPoint }: { onPoint: (latlng: [number, number]) => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = (e: L.LeafletMouseEvent) => onPoint([e.latlng.lat, e.latlng.lng]);
    map.on('click', handler);
    map.getContainer().style.cursor = 'crosshair';
    return () => { map.off('click', handler); map.getContainer().style.cursor = ''; };
  }, [map, onPoint]);
  return null;
}

/** Push/pull brush pointer handler (R3). Translates Leaflet mouse events into
 *  LOCAL meter coords (caller supplies the GPS→local projection) and drives the
 *  stroke lifecycle. Disables map dragging while a stroke is active, like the
 *  draw handler. onDown returns true if it grabbed an edge (stroke begins). */
function BrushPointerHandler({
  toLocal, onDown, onMove, onUp,
}: {
  toLocal: (latlng: L.LatLng) => XY;
  onDown: (m: XY) => boolean;
  onMove: (m: XY) => void;
  onUp: () => void;
}) {
  const map = useMap();
  const active = useRef(false);
  // Keep the latest callbacks in a ref so the Leaflet listeners bind ONCE (on
  // `map`). Re-binding per render would tear down mid-stroke (cleanup runs
  // while active.current is true → premature dragging.enable + stroke abort).
  const cb = useRef({ toLocal, onDown, onMove, onUp });
  useEffect(() => { cb.current = { toLocal, onDown, onMove, onUp }; });
  useEffect(() => {
    const down = (e: L.LeafletMouseEvent) => {
      if (cb.current.onDown(cb.current.toLocal(e.latlng))) {
        active.current = true;
        map.dragging.disable();
      }
    };
    const move = (e: L.LeafletMouseEvent) => {
      if (active.current) cb.current.onMove(cb.current.toLocal(e.latlng));
    };
    const up = () => {
      if (active.current) {
        active.current = false;
        map.dragging.enable();
        cb.current.onUp();
      }
    };
    map.on('mousedown', down);
    map.on('mousemove', move);
    map.on('mouseup', up);
    map.getContainer().style.cursor = 'crosshair';
    return () => {
      map.off('mousedown', down);
      map.off('mousemove', move);
      map.off('mouseup', up);
      if (active.current) { map.dragging.enable(); active.current = false; }
      map.getContainer().style.cursor = '';
    };
  }, [map]);
  return null;
}

/** Paint/erase brush pointer handler. Mirrors BrushPointerHandler but the brush
 *  op is applied on mousedown too (no edge gating) and accumulated per mousemove,
 *  like a real paint stroke. onDown returns true to begin the stroke. A circular
 *  cursor preview (paintRadius meters) follows the pointer while in paint mode. */
function PaintPointerHandler({
  toLatLng, toLocal, radius, onDown, onMove, onUp,
}: {
  toLatLng: (latlng: L.LatLng) => L.LatLng;
  toLocal: (latlng: L.LatLng) => XY;
  radius: number;
  onDown: (m: XY) => boolean;
  onMove: (m: XY) => void;
  onUp: () => void;
}) {
  const map = useMap();
  const active = useRef(false);
  const cursorRef = useRef<L.Circle | null>(null);
  // Keep the latest callbacks in a ref so the Leaflet listeners bind ONCE.
  const cb = useRef({ toLatLng, toLocal, onDown, onMove, onUp, radius });
  useEffect(() => { cb.current = { toLatLng, toLocal, onDown, onMove, onUp, radius }; });
  useEffect(() => {
    const cursor = L.circle(map.getCenter(), {
      radius: cb.current.radius,
      color: '#f59e0b', weight: 1, fillColor: '#f59e0b', fillOpacity: 0.12,
      interactive: false, opacity: 0,
    }).addTo(map);
    cursorRef.current = cursor;
    const down = (e: L.LeafletMouseEvent) => {
      if (cb.current.onDown(cb.current.toLocal(e.latlng))) {
        active.current = true;
        map.dragging.disable();
      }
    };
    const move = (e: L.LeafletMouseEvent) => {
      cursor.setLatLng(cb.current.toLatLng(e.latlng));
      cursor.setRadius(cb.current.radius);
      cursor.setStyle({ opacity: 1 });
      if (active.current) cb.current.onMove(cb.current.toLocal(e.latlng));
    };
    const up = () => {
      if (active.current) {
        active.current = false;
        map.dragging.enable();
        cb.current.onUp();
      }
    };
    map.on('mousedown', down);
    map.on('mousemove', move);
    map.on('mouseup', up);
    map.getContainer().style.cursor = 'crosshair';
    return () => {
      map.off('mousedown', down);
      map.off('mousemove', move);
      map.off('mouseup', up);
      cursor.remove();
      cursorRef.current = null;
      if (active.current) { map.dragging.enable(); active.current = false; }
      map.getContainer().style.cursor = '';
    };
  }, [map]);
  return null;
}

/** Move (translate) pointer handler. Mirrors PaintPointerHandler/BrushPointerHandler:
 *  bound ONCE (listeners read the latest callbacks via a ref so they never re-bind
 *  mid-drag). The drag begins only when the down point is INSIDE the target polygon
 *  — otherwise the map pans normally. onDown returns true to begin a drag (which
 *  disables map dragging); onMove gets the live local point; onUp commits. */
function MovePointerHandler({
  toLocal, onDown, onMove, onUp,
}: {
  toLocal: (latlng: L.LatLng) => XY;
  onDown: (m: XY) => boolean;
  onMove: (m: XY) => void;
  onUp: () => void;
}) {
  const map = useMap();
  const active = useRef(false);
  const cb = useRef({ toLocal, onDown, onMove, onUp });
  useEffect(() => { cb.current = { toLocal, onDown, onMove, onUp }; });
  useEffect(() => {
    const down = (e: L.LeafletMouseEvent) => {
      if (cb.current.onDown(cb.current.toLocal(e.latlng))) {
        active.current = true;
        map.dragging.disable();
      }
    };
    const move = (e: L.LeafletMouseEvent) => {
      if (active.current) cb.current.onMove(cb.current.toLocal(e.latlng));
    };
    const up = () => {
      if (active.current) {
        active.current = false;
        map.dragging.enable();
        cb.current.onUp();
      }
    };
    map.on('mousedown', down);
    map.on('mousemove', move);
    map.on('mouseup', up);
    map.getContainer().style.cursor = 'move';
    return () => {
      map.off('mousedown', down);
      map.off('mousemove', move);
      map.off('mouseup', up);
      if (active.current) { map.dragging.enable(); active.current = false; }
      map.getContainer().style.cursor = '';
    };
  }, [map]);
  return null;
}

/** Deselect polygons when clicking on empty map area */
function MapClickDeselect({ onDeselect }: { onDeselect: () => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => onDeselect();
    map.on('click', handler);
    return () => { map.off('click', handler); };
  }, [map, onDeselect]);
  return null;
}

/** Capture the live Leaflet map instance into a ref so component-scope code
 *  (e.g. obstacle paste placement) can read the current view center without
 *  living inside a MapContainer child. */
function MapInstanceCapture({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    return () => { mapRef.current = null; };
  }, [map, mapRef]);
  return null;
}

/** Track user interaction so we don't fight RecenterMap */
function UserInteractionTracker({ onInteract }: { onInteract: () => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => onInteract();
    map.on('dragstart', handler);
    map.on('zoomstart', handler);
    return () => {
      map.off('dragstart', handler);
      map.off('zoomstart', handler);
    };
  }, [map, onInteract]);
  return null;
}

// Issue #36: PDOK Luchtfoto only covers the Netherlands, so users outside
// NL saw white tiles. Switch to Esri World Imagery — global coverage, free
// for low-traffic use, no API key. Resolution is slightly lower than PDOK
// for NL parcels but it's the only sane global default. A future setting
// could let the operator paste a custom XYZ template (Mapbox, Google,
// regional aerial provider) if they want better resolution.
const TILE_LAYERS = {
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    maxNativeZoom: 19,
    maxZoom: 25,
  },
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    maxNativeZoom: 19,
    maxZoom: 25,
  },
} as const;

// ── Calibration transform ────────────────────────────────────────

/** Apply calibration (manual offset + rotation + scale) to polygon points.
 *  Server converteert lokaal→GPS met charger als origin — anchor offset is niet meer nodig. */
function calibratePoints(
  points: Array<{ lat: number; lng: number }>,
  cal: MapCalibration,
  center: { lat: number; lng: number },
): [number, number][] {
  const totalOffLat = cal.offsetLat;
  const totalOffLng = cal.offsetLng;

  if (totalOffLat === 0 && totalOffLng === 0 && cal.rotation === 0 && cal.scale === 1) {
    return points.map(p => [p.lat, p.lng]);
  }

  const rad = (cal.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return points.map(p => {
    // Translate to center
    let dLat = p.lat - center.lat;
    let dLng = p.lng - center.lng;

    // Scale
    dLat *= cal.scale;
    dLng *= cal.scale;

    // Rotate
    const rLat = dLat * cos - dLng * sin;
    const rLng = dLat * sin + dLng * cos;

    // Translate back + anchor offset + manual offset
    return [center.lat + rLat + totalOffLat, center.lng + rLng + totalOffLng] as [number, number];
  });
}

const DEFAULT_CAL: MapCalibration = { offsetLat: 0, offsetLng: 0, rotation: 0, scale: 1 };

type AreaType = 'work' | 'obstacle' | 'unicom';

// ── Edit-history snapshot stack (client-side undo/redo, R6) ──────────
// A "draft snapshot" is the full set of currently-pending drafts, each entry
// carrying enough to re-create it via saveEditDraft. Undo/redo move a pointer
// over a stack of these snapshots and replay them through the EXISTING draft
// endpoints (discardEditDrafts → re-save each entry). No server change.
type DraftEntry =
  | { kind: 'edit'; canonical: string; points: { x: number; y: number }[] }
  | { kind: 'delete'; canonical: string }
  | { kind: 'new'; mapType: 'obstacle'; parentMap: string; points: { x: number; y: number }[] };
type DraftSnapshot = DraftEntry[];

const HISTORY_CAP = 50;

/** Derive a draft snapshot from the freshly-fetched edit geometry. Each map
 *  with a non-null draft contributes one entry: new obstacle, delete, or edit. */
function snapshotOf(geom: EditGeometryDto | null): DraftSnapshot {
  if (!geom) return [];
  const snap: DraftSnapshot = [];
  for (const entry of geom.maps) {
    const draft = entry.draft;
    if (!draft) continue;
    if (draft.isNew) {
      // New obstacle drawn this session; needs a parent work map to re-create.
      if (entry.parentMap) {
        snap.push({ kind: 'new', mapType: 'obstacle', parentMap: entry.parentMap, points: draft.points.map(p => ({ x: p.x, y: p.y })) });
      }
    } else if (draft.deleted) {
      snap.push({ kind: 'delete', canonical: entry.canonical });
    } else {
      snap.push({ kind: 'edit', canonical: entry.canonical, points: draft.points.map(p => ({ x: p.x, y: p.y })) });
    }
  }
  return snap;
}

// ── Mower marker icon ────────────────────────────────────────────

function makeMowerIcon(heading: number) {
  // PNG bovenaanzicht: voorkant wijst naar rechts (= 90° compass).
  // CSS rotate(0deg) = geen rotatie → maaier wijst rechts.
  // Compass: 0°=N(omhoog), 90°=E(rechts). Offset -90° corrigeert dit.
  const cssRotation = heading - 90;
  return L.divIcon({
    className: '',
    html: `<div style="width:36px;height:36px;transform:rotate(${cssRotation}deg);display:flex;align-items:center;justify-content:center">
      <img src="/mower/lawn_mower.png" style="width:32px;height:20px;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.4))" />
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

// ── Charger marker icon ────────────────────────────────────────
function makeChargerIcon(live = false) {
  const ring = live
    ? `<div style="position:absolute;inset:-3px;border:2px solid #22c55e;border-radius:50%;opacity:0.8"></div>`
    : '';
  return L.divIcon({
    className: '',
    html: `<div style="width:36px;height:36px;position:relative;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.4))">
      ${ring}
      <svg viewBox="0 0 32 32" width="28" height="28">
        <path d="M16 3 L28 14 L24 14 L24 27 L8 27 L8 14 L4 14 Z" fill="#f59e0b" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M18 12 L13 19 L16 19 L14 25 L21 17 L17 17 Z" fill="white" opacity="0.95"/>
      </svg>
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

// ── Point-in-polygon (ray casting) ──────────────────────────────

function pointInPolygon(lat: number, lng: number, polygon: Array<{ lat: number; lng: number }>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i].lat, xi = polygon[i].lng;
    const yj = polygon[j].lat, xj = polygon[j].lng;
    if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Calculate polygon area in m² using Shoelace on GPS coords */
function polygonAreaM2(points: Array<{ lat: number; lng: number }>): number {
  if (points.length < 3) return 0;
  const MpD = 111320;
  const centerLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const cosLat = Math.cos(centerLat * Math.PI / 180);
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = (points[i].lng - points[0].lng) * MpD * cosLat;
    const yi = (points[i].lat - points[0].lat) * MpD;
    const xj = (points[j].lng - points[0].lng) * MpD * cosLat;
    const yj = (points[j].lat - points[0].lat) * MpD;
    area += xi * yj - xj * yi;
  }
  return Math.abs(area) / 2;
}

/** Length of a polyline in meters on GPS coords (for unicom channels) */
function polylineLengthM(points: Array<{ lat: number; lng: number }>): number {
  if (points.length < 2) return 0;
  const MpD = 111320;
  const centerLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const cosLat = Math.cos(centerLat * Math.PI / 180);
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = (points[i].lng - points[i - 1].lng) * MpD * cosLat;
    const dy = (points[i].lat - points[i - 1].lat) * MpD;
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}

// ── Click-to-place charger component ────────────────────────────
function ChargerPlacer({ onPlace }: { onPlace: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPlace(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// ── Nudge step: ~0.5m in degrees ─────────────────────────────────
const NUDGE_STEP = 0.000005; // ~0.55m lat, ~0.35m lng at 52°N

/** Click handler for pattern placement */
function PatternClickHandler({ onClick }: { onClick: (center: { lat: number; lng: number }) => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = (e: L.LeafletMouseEvent) => onClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    map.on('click', handler);
    map.getContainer().style.cursor = 'crosshair';
    return () => { map.off('click', handler); map.getContainer().style.cursor = ''; };
  }, [map, onClick]);
  return null;
}

/** Click handler for navigate-to mode */
function NavigateClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = (e: L.LeafletMouseEvent) => onClick(e.latlng.lat, e.latlng.lng);
    map.on('click', handler);
    map.getContainer().style.cursor = 'crosshair';
    return () => { map.off('click', handler); map.getContainer().style.cursor = ''; };
  }, [map, onClick]);
  return null;
}

/** Click handler for virtual wall drawing (two-point rectangle) */
function WallDrawClickHandler({ onPoint }: { onPoint: (lat: number, lng: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = (e: L.LeafletMouseEvent) => onPoint(e.latlng.lat, e.latlng.lng);
    map.on('click', handler);
    map.getContainer().style.cursor = 'crosshair';
    return () => { map.off('click', handler); map.getContainer().style.cursor = ''; };
  }, [map, onPoint]);
  return null;
}

/** Navigate-to target icon */
function makeTargetIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="width:32px;height:32px">
      <svg viewBox="0 0 32 32" width="32" height="32">
        <circle cx="16" cy="16" r="12" fill="#3b82f6" stroke="white" stroke-width="2" opacity="0.85"/>
        <circle cx="16" cy="16" r="5" fill="white" opacity="0.9"/>
        <circle cx="16" cy="16" r="2" fill="#3b82f6"/>
      </svg>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

const targetIcon = makeTargetIcon();

// ── Confetti celebration ──────────────────────────────────────

const CONFETTI_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#22d3ee'];

function ConfettiPiece({ color, left, delay, duration, size, wobble }: {
  color: string; left: number; delay: number; duration: number; size: number; wobble: number;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${left}%`,
        top: -20,
        width: size,
        height: size * 0.6,
        backgroundColor: color,
        borderRadius: 2,
        opacity: 0,
        animation: `confetti-fall ${duration}s ease-in ${delay}s forwards`,
        '--wobble': `${wobble}px`,
      } as React.CSSProperties}
    />
  );
}

function CelebrationOverlay({ area, onDismiss }: { area: number; onDismiss: () => void }) {
  const pieces = useMemo(() =>
    Array.from({ length: 60 }, (_, i) => ({
      id: i,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      left: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 2.5 + Math.random() * 2.5,
      size: 5 + Math.random() * 8,
      wobble: (Math.random() - 0.5) * 100,
    })),
  []);

  return (
    <div className="absolute inset-0 z-[2000] overflow-hidden">
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(0) translateX(0) rotate(0deg); opacity: 1; }
          25%  { transform: translateY(25vh) translateX(var(--wobble)) rotate(180deg); opacity: 1; }
          50%  { transform: translateY(50vh) translateX(calc(var(--wobble) * -0.5)) rotate(360deg); opacity: 0.8; }
          100% { transform: translateY(110vh) translateX(var(--wobble)) rotate(720deg); opacity: 0; }
        }
        @keyframes celebration-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes celebration-appear {
          0% { opacity: 0; transform: scale(0.8); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {pieces.map(p => <ConfettiPiece key={p.id} {...p} />)}

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="pointer-events-auto bg-gray-900/95 backdrop-blur-lg border border-emerald-500/40 rounded-2xl p-6 shadow-2xl text-center max-w-xs"
          style={{ animation: 'celebration-appear 0.4s ease-out forwards' }}
        >
          <div className="text-5xl mb-3" style={{ animation: 'celebration-pulse 1.5s ease-in-out infinite' }}>
            🎉
          </div>
          <h3 className="text-lg font-bold text-emerald-400 mb-1">Maaien voltooid!</h3>
          <p className="text-sm text-gray-400 mb-1">
            100% — Alle banen gemaaid
          </p>
          {area > 0 && (
            <p className="text-xs text-gray-500 mb-4">
              {area.toFixed(0)} m&sup2; afgerond
            </p>
          )}
          <button
            onClick={onDismiss}
            className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors shadow-lg shadow-emerald-900/40"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
}

export function MowerMap({ sn, lat, lng, mapX, mapY, heading, online, mowingActive, sensors, signals, mowing, pathDirectionPreview, onMapSaved: _onMapSaved, liveOutline, patternPlacement, onMapClickForPattern, offsetPreview, coveredLanes }: Props) {
  const { t } = useTranslation();
  const mowingSensors = sensors ?? {};
  const { toast } = useToast();
  const [maps, setMaps] = useState<MapData[]>([]);
  const [trail, setTrail] = useState<TrailPoint[]>([]);
  const [showTrail, setShowTrail] = useState(true);
  const [tileLayer, setTileLayer] = useState<'satellite' | 'street'>('satellite');
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);

  // Polygon edit/draw state
  const [editMode, setEditMode] = useState<'none' | 'edit' | 'draw'>('none');
  const [editVertices, setEditVertices] = useState<[number, number][]>([]);
  const [editingMapId, setEditingMapId] = useState<string | null>(null);
  const [drawType, setDrawType] = useState<'work' | 'obstacle' | 'unicom'>('work');
  const [drawName, setDrawName] = useState('');
  const [showHeatmap, setShowHeatmap] = useState(false);

  // ── Coverage-path preview ("show mowing path"): the real boustrophedon
  //    path the mower will cut, fetched from the mower's coverage planner.
  //    Reflects what's CURRENTLY on the mower — after editing, Apply first,
  //    then Refresh path.
  const [coveragePath, setCoveragePath] = useState<CoveragePathEntry[] | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  // coverageStatus-waarde wordt niet meer getoond (hint-paneel verwijderd) — alleen
  // de setter blijft voor de bestaande logica-flow. Waarde bewust gediscard.
  const [, setCoverageStatus] = useState<string | null>(null);
  // True when the currently-shown overlay is the LIVE plan path (mower mowing),
  // so the panel shows a subtle "live" indicator + hint instead of the idle one.
  const [coverageLive, setCoverageLive] = useState(false);
  // Interval handle for live plan-path polling (~5s) while the overlay is shown
  // AND the mower is mowing. Cleared on hide / stop-mowing / unmount.
  const coveragePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Mirror showCoverage in a ref so the poll loop can self-cancel without being
  // re-created on every toggle.
  const showCoverageRef = useRef(false);
  useEffect(() => { showCoverageRef.current = showCoverage; }, [showCoverage]);

  // ── Push/pull brush (R3) ────────────────────────────────────────
  // The brush operates on the currently selected WORK or OBSTACLE polygon
  // (unicom excluded). brushWorking holds the live LOCAL points during a stroke
  // so we can render an in-progress dashed overlay and commit on mouseup.
  const [brushMode, setBrushMode] = useState(false);
  const [brushRadius, setBrushRadius] = useState(0.8);
  const [brushWorking, setBrushWorking] = useState<XY[] | null>(null);

  // ── Paint/erase brush (primary tool) ────────────────────────────
  // Paints (union) or erases (difference) a circular brush into the selected
  // work/obstacle polygon. paintWorking mirrors the live polygon during a stroke
  // for the dashed overlay; successive strokes accumulate (re-seeded on commit).
  const [paintMode, setPaintMode] = useState(false);
  const [paintTool, setPaintTool] = useState<'paint' | 'erase'>('erase');
  const [paintRadius, setPaintRadius] = useState(0.4);
  const [paintWorking, setPaintWorking] = useState<XY[] | null>(null);

  // ── Move/translate tool ─────────────────────────────────────────
  // Drag a whole work/obstacle shape to reposition it (saved as a draft,
  // undoable, applied later). The move target is pinned by CANONICAL — not by
  // selectedMapId — because a fresh paste is a draft-only obstacle that may NOT
  // appear in the committed `maps` list. moveWorking mirrors the live translated
  // points during a drag for the dashed overlay; the drag re-seeds its base from
  // the refreshed geometry on each release so successive nudges stack cleanly.
  const [moveMode, setMoveMode] = useState(false);
  const [moveTargetCanonical, setMoveTargetCanonical] = useState<string | null>(null);
  const [moveWorking, setMoveWorking] = useState<XY[] | null>(null);

  // Cumulative obstacle offset (R3). Repeated Expand/Shrink must offset from the
  // ORIGINAL base by the accumulated distance — offsetting the previous result
  // each time compounds miter rounding error (corners drift). Key = canonical.
  const obstacleOffsetBase = useRef<Map<string, { base: XY[]; accum: number }>>(new Map());

  // Live Leaflet map instance (captured via <MapInstanceCapture/>) so paste can
  // read the current view CENTER for placement without living inside MapContainer.
  const leafletMapRef = useRef<L.Map | null>(null);

  // ── Obstacle copy/paste (R6) ────────────────────────────────────
  // Clipboard holds an obstacle's LOCAL points (charger-relative meters). It
  // PERSISTS across mower switches and reloads via localStorage, so a copy on
  // one mower can be pasted onto another's work map (the relative shape is reused
  // in the target mower's frame; absolute position may differ — the user then
  // repositions with Paint/Move). Initialized from localStorage on mount.
  const [obstacleClipboard, setObstacleClipboardState] = useState<ObstacleClipboard | null>(() => {
    try {
      const raw = localStorage.getItem(OBSTACLE_CLIPBOARD_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ObstacleClipboard;
      if (!parsed || !Array.isArray(parsed.points) || parsed.points.length < 3) return null;
      return parsed;
    } catch { return null; }
  });
  // Setter that mirrors to localStorage so the clipboard survives reloads.
  const setObstacleClipboard = useCallback((c: ObstacleClipboard | null) => {
    setObstacleClipboardState(c);
    try {
      if (c) localStorage.setItem(OBSTACLE_CLIPBOARD_KEY, JSON.stringify(c));
      else localStorage.removeItem(OBSTACLE_CLIPBOARD_KEY);
    } catch { /* localStorage may be unavailable (private mode) — keep in-memory */ }
  }, []);

  // Draft → apply-to-mower flow (R2). editGeometry mirrors the server's draft
  // store; the floating MapEditBar surfaces pending drafts + apply/revert/discard.
  const [editGeometry, setEditGeometry] = useState<EditGeometryDto | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editStatusKind, setEditStatusKind] = useState<'info' | 'error' | 'warn' | 'ok'>('info');
  const [applying, setApplying] = useState(false);

  // Mirror editGeometry in a ref so recordHistory() can read the FRESHLY fetched
  // geometry synchronously right after refreshEditGeometry() (the setEditGeometry
  // state update is async and not yet visible in the same tick).
  const editGeometryRef = useRef<EditGeometryDto | null>(null);
  const refreshEditGeometry = useCallback(async () => {
    if (!sn) return;
    try {
      const geom = await fetchEditGeometry(sn);
      editGeometryRef.current = geom;
      setEditGeometry(geom);
    } catch { /* non-fatal */ }
  }, [sn]);

  // ── Undo/redo edit-history (R6) ─────────────────────────────────
  // Client-side snapshot stack over the existing draft endpoints. history holds
  // DraftSnapshots; historyIndex points at the currently-applied one. Mutating
  // ops push a fresh snapshot; undo/redo replay a snapshot via applySnapshot.
  const [history, setHistory] = useState<DraftSnapshot[]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [historyBusy, setHistoryBusy] = useState(false);
  // historyIndex mirrored in a ref so keyboard handlers + the truncate logic in
  // recordHistory read the live value without re-binding/closure staleness.
  const historyIndexRef = useRef(0);
  useEffect(() => { historyIndexRef.current = historyIndex; }, [historyIndex]);

  // Record the current pending-draft set as a new history entry. Call AFTER a
  // successful mutating op once refreshEditGeometry() has updated the geometry —
  // derives the snapshot from editGeometryRef (freshly fetched, not stale state).
  // Truncates any redo branch, caps at HISTORY_CAP. Never call during undo/redo.
  const recordHistory = useCallback(() => {
    const snap = snapshotOf(editGeometryRef.current);
    setHistory(prev => {
      const base = prev.slice(0, historyIndexRef.current + 1);
      base.push(snap);
      const trimmed = base.length > HISTORY_CAP ? base.slice(base.length - HISTORY_CAP) : base;
      setHistoryIndex(trimmed.length - 1);
      return trimmed;
    });
  }, []);

  // Reset history to a single fresh snapshot of the current geometry. Used on
  // mower select / editor open and after apply/revert/discard (drafts cleared).
  const resetHistory = useCallback(() => {
    const snap = snapshotOf(editGeometryRef.current);
    setHistory([snap]);
    setHistoryIndex(0);
  }, []);

  // Re-fetch the canonical map list from the server (used after draft save /
  // apply / revert, where optimistic local edits no longer match the server).
  const reloadMaps = useCallback(async () => {
    if (!sn) return;
    try {
      const resp = await fetchMaps(sn);
      setMaps(resp.maps);
      setChargerGps(resp.chargerGps);
      setChargingPose(resp.chargingPose ?? null);
    } catch { /* keep current maps */ }
  }, [sn]);

  // Replay a snapshot onto the server: clear all drafts, then re-create each
  // entry through the existing draft endpoints. Sequential to avoid the per-SN
  // draft race. After replay, refresh geometry + reload maps so overlays update.
  const applySnapshot = useCallback(async (snap: DraftSnapshot) => {
    if (!sn) return;
    await discardEditDrafts(sn).catch(() => {});
    for (const entry of snap) {
      try {
        if (entry.kind === 'edit') {
          await saveEditDraft(sn, { canonical: entry.canonical, points: entry.points });
        } else if (entry.kind === 'delete') {
          await saveEditDraft(sn, { canonical: entry.canonical, deleted: true });
        } else {
          await saveEditDraft(sn, { mapType: 'obstacle', parentMap: entry.parentMap, points: entry.points });
        }
      } catch { /* skip a failed entry, continue replay */ }
    }
    // Replaying changes the committed/draft geometry → the cumulative obstacle
    // offset base is no longer valid; clear it so the next expand/shrink re-seeds.
    obstacleOffsetBase.current.clear();
    await refreshEditGeometry();
    await reloadMaps();
  }, [sn, refreshEditGeometry, reloadMaps]);

  // Undo: move the pointer back one step and replay that snapshot. Moving the
  // pointer IS the history move — do NOT recordHistory here. Guarded by
  // historyBusy so rapid clicks don't overlap (each applySnapshot is awaited).
  const undo = useCallback(async () => {
    if (historyBusy || historyIndex <= 0) return;
    setHistoryBusy(true);
    const target = historyIndex - 1;
    setHistoryIndex(target);
    try { await applySnapshot(history[target]); }
    finally { setHistoryBusy(false); }
  }, [historyBusy, historyIndex, history, applySnapshot]);

  const redo = useCallback(async () => {
    if (historyBusy || historyIndex >= history.length - 1) return;
    setHistoryBusy(true);
    const target = historyIndex + 1;
    setHistoryIndex(target);
    try { await applySnapshot(history[target]); }
    finally { setHistoryBusy(false); }
  }, [historyBusy, historyIndex, history, applySnapshot]);

  const canUndo = historyIndex > 0 && !historyBusy;
  const canRedo = historyIndex < history.length - 1 && !historyBusy;

  // Mowing completion celebration + "vandaag gemaaid" tracking
  const [showCelebration, setShowCelebration] = useState(false);
  const [lastMowedDate, setLastMowedDate] = useState<string | null>(null);
  const prevWorkStatusRef = useRef<string>('0');
  const prevMowingRef = useRef(false);
  const celebrationArea = useRef(0);

  useEffect(() => {
    const ws = mowing?.workStatus ?? '0';
    const progress = parseInt(mowing?.mowingProgress ?? '0', 10);
    const nowMowing = !!mowingActive;
    // Maaien gestart → wis oude trail. Gebruik de msg-based mowingActive i.p.v.
    // work_status==='1' — dat veld staat tijdens maaien niet altijd op '1', wat
    // ervoor zorgde dat de trail nooit werd geleegd/opgebouwd.
    if (!prevMowingRef.current && nowMowing) {
      setTrail([]);
    }
    // Transitie: maaien klaar (was mowing, nu niet, met progress >=95%)
    if (prevMowingRef.current && !nowMowing && progress >= 95) {
      celebrationArea.current = parseFloat(mowing?.coveringArea ?? '0');
      setShowCelebration(true);
      setLastMowedDate(new Date().toLocaleDateString());
    }
    prevWorkStatusRef.current = ws;
    prevMowingRef.current = nowMowing;
  }, [mowingActive, mowing?.workStatus, mowing?.mowingProgress, mowing?.coveringArea]);

  // Place charger mode
  const [placingCharger, setPlacingCharger] = useState(false);

  // Navigate-to mode
  const [navigateMode, setNavigateMode] = useState(false);
  const [navigateTarget, setNavigateTarget] = useState<{ lat: number; lng: number } | null>(null);

  // Confirm delete dialog
  const [confirmDeleteMapId, setConfirmDeleteMapId] = useState<string | null>(null);
  const [confirmDeleteMapName, setConfirmDeleteMapName] = useState<string>('');

  // Charger calibration
  const [confirmCalibrate, setConfirmCalibrate] = useState(false);

  // Virtual walls
  const [walls, setWalls] = useState<VirtualWall[]>([]);
  const [wallDrawMode, setWallDrawMode] = useState(false);
  const [wallFirstCorner, setWallFirstCorner] = useState<{ lat: number; lng: number } | null>(null);

  // Charger GPS — used for local meter → GPS conversion for Leaflet display
  const [chargerGps, setChargerGps] = useState<GpsPoint | null>(null);
  // Charger pose in local meter frame (from map_info.json charging_pose).
  // Used to shift all local coords so that the physical charger position
  // projects onto chargerGps instead of the local origin (0,0).
  const [chargingPose, setChargingPose] = useState<{ x: number; y: number; orientation: number } | null>(null);

  // Calibration state
  const [savedCal, setSavedCal] = useState<MapCalibration>(DEFAULT_CAL);
  const [editCal, setEditCal] = useState<MapCalibration | null>(null);
  const calibrating = editCal !== null;
  const activeCal = editCal ?? savedCal;

  // Area type labels (translated)
  const AREA_TYPE_META: Record<AreaType, { color: string; label: string }> = useMemo(() => ({
    work:     { color: '#10b981', label: t('map.workArea') },
    obstacle: { color: '#ef4444', label: t('map.obstacle') },
    unicom:   { color: '#3b82f6', label: t('map.channel') },
  }), [t]);

  useEffect(() => {
    if (sn) {
      fetchMaps(sn).then(resp => {
        setMaps(resp.maps);
        setChargerGps(resp.chargerGps);
        setChargingPose(resp.chargingPose ?? null);
      }).catch(() => setMaps([]));
      fetchTrail(sn).then(setTrail).catch(() => setTrail([]));
      fetchCalibration(sn).then(setSavedCal).catch(() => {});
      // Initialize undo/redo history to a single fresh snapshot once the editor's
      // geometry has loaded for this mower (usually an empty snapshot = no drafts).
      refreshEditGeometry().then(resetHistory);
    } else {
      // No mower SN — load all maps and calibration as fallback
      fetchAllMaps().then(loaded => {
        setMaps(loaded);
        // Load calibration for the first map's owner SN
        const ownerSn = (loaded[0] as MapData & { mowerSn?: string })?.mowerSn;
        if (ownerSn) {
          fetchCalibration(ownerSn).then(setSavedCal).catch(() => {});
        }
      }).catch(() => setMaps([]));
      setTrail([]);
    }
  }, [sn]);

  // Fetch virtual walls
  useEffect(() => {
    if (sn) {
      fetchVirtualWalls(sn).then(setWalls).catch(() => setWalls([]));
    }
  }, [sn]);

  // Keyboard shortcuts for undo/redo while the map editor is mounted.
  // Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+Z (and Ctrl+Y) = redo. Ignored when the
  // focus is in a text field so typing in name/rename inputs is unaffected.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) void redo();
        else void undo();
      } else if (key === 'y') {
        e.preventDefault();
        void redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);


  // Append new trail points when lat/lng changes — only while actively mowing.
  // Gebruik mowingActive (msg-based) i.p.v. work_status==='1': dat veld klopt
  // niet altijd tijdens maaien, waardoor de trail leeg bleef.
  const isMowing = !!mowingActive || mowing?.workStatus === '1';
  useEffect(() => {
    if (!isMowing) return;
    if (!lat || !lng || lat === '0' || lng === '0') return;
    const numLat = parseFloat(lat);
    const numLng = parseFloat(lng);
    if (isNaN(numLat) || isNaN(numLng)) return;

    setTrail(prev => {
      if (prev.length > 0) {
        const last = prev[prev.length - 1];
        if (Math.abs(last.lat - numLat) < 0.0000005 && Math.abs(last.lng - numLng) < 0.0000005) {
          return prev;
        }
      }
      return [...prev, { lat: numLat, lng: numLng, ts: Date.now() }];
    });
  }, [lat, lng, isMowing]);

  const handleClearTrail = useCallback(() => {
    clearTrail(sn).then(() => setTrail([])).catch(() => {});
  }, [sn]);

  const handleDeleteMap = useCallback((mapId: string) => {
    deleteMap(sn, mapId).then(() => {
      setMaps(prev => prev.filter(m => m.mapId !== mapId));
      setSelectedMapId(null);
    }).catch(() => {});
  }, [sn]);

  // Inline rename state
  const [editingName, setEditingName] = useState<string | null>(null);

  const handleRenameMap = useCallback((mapId: string, newName: string) => {
    const trimmed = newName.trim();
    renameMap(sn, mapId, trimmed).then(() => {
      setMaps(prev => prev.map(m => m.mapId === mapId ? { ...m, mapName: trimmed || null } : m));
      setEditingName(null);
    }).catch(() => {});
  }, [sn]);

  // Start editing an existing polygon — accepts map data directly to avoid stale closure
  // Server stuurt al GPS coords (lokaal→GPS conversie) — direct bruikbaar voor Leaflet.
  const startEditMap = useCallback((mapId: string, mapArea: Array<{ lat: number; lng: number }>) => {
    if (mapArea.length < 3) return;
    // Mower-recorded rings carry hundreds of densely sampled points (~every
    // 0.4 m). Editing every one is impossible (overlapping handles). Simplify
    // adaptively to a manageable handle count via RDP in local meters
    // (translation-invariant; the gpsToLocal/localToGps round-trip is exact),
    // raising the tolerance until the ring drops to ~TARGET vertices. The saved
    // draft replaces the dense ring — fine for editing, the planner re-rasterizes.
    const TARGET = 28;
    let verts = mapArea.map(p => [p.lat, p.lng] as [number, number]);
    if (verts.length > TARGET && isUsableChargerGps(chargerGps)) {
      const local = verts.map(([lat, lng]) => gpsToLocal({ lat, lng }, chargerGps));
      let simplified = local;
      let tol = 0.05;
      for (let i = 0; i < 10 && simplified.length > TARGET; i++) {
        simplified = simplifyPolygon(local, tol);
        tol *= 1.7;
      }
      if (simplified.length >= 3 && simplified.length < verts.length) {
        verts = simplified.map(pt => {
          const g = localToGps(pt, chargerGps);
          return [g.lat, g.lng] as [number, number];
        });
      }
    }
    setEditingMapId(mapId);
    setEditVertices(verts);
    setEditMode('edit');
    setSelectedMapId(null);
    setEditingName(null);
    setMoveMode(false);
    setMoveTargetCanonical(null);
    setMoveWorking(null);
    setUserInteracted(true);
  }, [chargerGps]);

  // Start drawing a new polygon
  const startDrawMap = useCallback(() => {
    setEditingMapId(null);
    setEditVertices([]);
    setDrawName('');
    setEditMode('draw');
    setSelectedMapId(null);
    setMoveMode(false);
    setMoveTargetCanonical(null);
    setMoveWorking(null);
    setUserInteracted(true);
  }, []);

  // Determine editor polygon color based on context
  const editorColor = useMemo(() => {
    if (editMode === 'draw') return AREA_TYPE_META[drawType].color;
    if (editMode === 'edit' && editingMapId) {
      const m = maps.find(p => p.mapId === editingMapId);
      if (m) return getAreaStyle(m.mapType, m.mapId, m.mapName).color;
    }
    return '#10b981';
  }, [editMode, drawType, editingMapId, maps, AREA_TYPE_META]);

  // Convert local meter maps to GPS-projected maps for Leaflet rendering.
  // All rendering code uses gpsMaps (with lat/lng). Only save/create uses local meters.
  //
  // Shift: map_info.json declares charging_pose {x,y} in local meters. The
  // physical charger sits at that offset, NOT at local (0,0). We shift every
  // point by -(chargingPose.x, chargingPose.y) so that local (chargingPose.x,
  // chargingPose.y) projects onto chargerGps (where the user placed the icon).
  // Without this shift the unicom start (which begins at the actual charger pose)
  // appears offset from the rendered charger icon on the satellite tile.
  type GpsMapData = Omit<MapData, 'mapArea'> & { mapArea: Array<{ lat: number; lng: number }> };
  const gpsMaps: GpsMapData[] = useMemo(() => {
    if (!isUsableChargerGps(chargerGps)) return [];
    const offX = chargingPose?.x ?? 0;
    const offY = chargingPose?.y ?? 0;
    // Drop any vertex that becomes non-finite after projection — a single
    // NaN coord crashes Leaflet with "Invalid LatLng object" (issue #15).
    return maps.map(m => ({
      ...m,
      mapArea: m.mapArea.flatMap(p => {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return [];
        const gps = localToGps({ x: p.x - offX, y: p.y - offY }, chargerGps);
        if (!Number.isFinite(gps.lat) || !Number.isFinite(gps.lng)) return [];
        return [gps];
      }),
    }));
  }, [maps, chargerGps, chargingPose]);

  // Pending draft geometry (R2) projected to GPS for a dashed "pending" overlay.
  // Each draft with non-null geometry (and not deleted) is drawn on top of the
  // base maps so the user sees their edit before it is applied to the mower.
  const draftOverlays: Array<{ canonical: string; mapType: 'work' | 'obstacle' | 'unicom'; gps: Array<{ lat: number; lng: number }> }> = useMemo(() => {
    if (!editGeometry || !isUsableChargerGps(chargerGps)) return [];
    const offX = chargingPose?.x ?? 0;
    const offY = chargingPose?.y ?? 0;
    const out: Array<{ canonical: string; mapType: 'work' | 'obstacle' | 'unicom'; gps: Array<{ lat: number; lng: number }> }> = [];
    for (const entry of editGeometry.maps) {
      const draft = entry.draft;
      if (!draft || draft.deleted || draft.points.length < 3) continue;
      const gps = draft.points.flatMap(p => {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return [];
        const g = localToGps({ x: p.x - offX, y: p.y - offY }, chargerGps);
        if (!Number.isFinite(g.lat) || !Number.isFinite(g.lng)) return [];
        return [g];
      });
      if (gps.length >= 3) out.push({ canonical: entry.canonical, mapType: entry.mapType, gps });
    }
    return out;
  }, [editGeometry, chargerGps, chargingPose]);

  // Coverage-path sub-paths projected into the SAME GPS frame as gpsMaps /
  // draftOverlays (local → GPS with the chargingPose offset). Rendering then
  // applies calibratePoints(..., activeCal, polyCenter), identical to maps,
  // so the "black lines" land exactly on the work polygons.
  const coverageGps: Array<{ id: string; gps: Array<{ lat: number; lng: number }> }> = useMemo(() => {
    if (!coveragePath || !isUsableChargerGps(chargerGps)) return [];
    const offX = chargingPose?.x ?? 0;
    const offY = chargingPose?.y ?? 0;
    const out: Array<{ id: string; gps: Array<{ lat: number; lng: number }> }> = [];
    for (const entry of coveragePath) {
      const gps = entry.points.flatMap(p => {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return [];
        const g = localToGps({ x: p.x - offX, y: p.y - offY }, chargerGps);
        if (!Number.isFinite(g.lat) || !Number.isFinite(g.lng)) return [];
        return [g];
      });
      if (gps.length >= 2) out.push({ id: entry.id, gps });
    }
    return out;
  }, [coveragePath, chargerGps, chargingPose]);

  // Live coverage-voortgang — DEZELFDE classificatie als de OpenNova app
  // (MowingProgressMap), via de gedeelde util. finished → dik groen, actief →
  // emerald tot covering_area_points, resterend → dunne lijn.
  const coverProgress = useMemo(() => {
    const finished = new Set(
      parseFinishedAreas(mowingSensors.finished_area, mowingSensors.cover_map_id) ?? [],
    );
    const activeId = prefixedAreaId(mowingSensors.covering_area_id, mowingSensors.cover_map_id);
    const activePoints = parseInt(mowingSensors.covering_area_points ?? '0', 10) || 0;
    return { finished, activeId, activePoints };
  }, [
    mowingSensors.finished_area,
    mowingSensors.cover_map_id,
    mowingSensors.covering_area_id,
    mowingSensors.covering_area_points,
  ]);

  // ── Live plan-path polling (while mowing) ───────────────────────
  // Fetch the live plan path once (used by the poll loop AND the manual path).
  // Returns true if a non-empty path was applied. Never throws.
  const fetchPlanOnce = useCallback(async (refresh: boolean): Promise<boolean> => {
    if (!sn) return false;
    try {
      const paths = refresh ? await refreshPlanPath(sn) : await getPlanPath(sn);
      if (paths.length > 0) { setCoveragePath(paths); return true; }
    } catch { /* keep any existing path */ }
    return false;
  }, [sn]);

  const stopCoveragePoll = useCallback(() => {
    if (coveragePollRef.current) {
      clearInterval(coveragePollRef.current);
      coveragePollRef.current = null;
    }
  }, []);

  // Start (or restart) the ~5s live plan-path poll. The loop self-cancels if the
  // overlay is hidden; the auto-switch effect cancels it when mowing stops.
  const startCoveragePoll = useCallback(() => {
    stopCoveragePoll();
    coveragePollRef.current = setInterval(() => {
      if (!showCoverageRef.current) { stopCoveragePoll(); return; }
      void fetchPlanOnce(false).then((ok) => { if (!ok) void fetchPlanOnce(true); });
    }, 5000);
  }, [stopCoveragePoll, fetchPlanOnce]);

  // Show the LIVE plan path: refresh once, fall back to cache, then poll. Used
  // while the mower is mowing — no Error-128 risk (get_map_plan_path is safe).
  const showLiveCoverage = useCallback(async () => {
    if (!sn) return;
    setCoverageLive(true);
    setCoverageLoading(true);
    setCoverageStatus(t('map.edit.coverageLive'));
    try {
      // Show whatever is cached immediately, then refresh for the freshest plan.
      const cached = await getPlanPath(sn).catch(() => [] as CoveragePathEntry[]);
      if (cached.length > 0) setCoveragePath(cached);
      const ok = await fetchPlanOnce(true);
      if (!ok && cached.length === 0) {
        // No live plan came back and nothing cached — last resort: any cached
        // preview, else a short "couldn't compute" note (no scary busy error).
        const prev = await getPreviewPath(sn).catch(() => [] as CoveragePathEntry[]);
        if (prev.length > 0) setCoveragePath(prev);
        else setCoverageStatus(t('map.edit.coverageNone'));
      }
    } finally {
      setCoverageLoading(false);
      startCoveragePoll();
    }
  }, [sn, t, fetchPlanOnce, startCoveragePoll]);

  // Trigger a fresh coverage-path generation on the mower, then fetch + cache.
  // IDLE path: mirrors the app (mapIds 1, cov_direction 0). When the mower is
  // mowing this routes to showLiveCoverage instead. On the idle "busy" (409)
  // edge we DON'T show a scary error — we fall back to the live plan path.
  const refreshCoverage = useCallback(async () => {
    if (!sn) return;
    if (mowingActive) { stopCoveragePoll(); await showLiveCoverage(); return; }
    setCoverageLive(false);
    stopCoveragePoll();
    if (online === false) {
      setCoverageStatus(t('map.edit.coverageOffline'));
      return;
    }
    setCoverageLoading(true);
    setCoverageStatus(t('map.edit.coverageLoading'));
    try {
      const { paths, busy } = await refreshPreviewPath(sn, { mapIds: 1, covDirection: 0 });
      if (busy) {
        // Genuine busy on a (reportedly) idle mower — fall back to the live plan
        // path instead of refusing. Only if BOTH yield nothing show "none".
        if (paths.length > 0) setCoveragePath(paths);
        const ok = await fetchPlanOnce(true) || await fetchPlanOnce(false);
        if (ok) { setCoverageLive(true); setCoverageStatus(t('map.edit.coverageLive')); startCoveragePoll(); }
        else if (paths.length === 0) setCoverageStatus(t('map.edit.coverageNone'));
        else setCoverageStatus(null);
      } else {
        setCoveragePath(paths);
        setCoverageStatus(paths.length > 0 ? null : t('map.edit.coverageNone'));
      }
    } catch {
      // Thrown means the mower didn't return a preview in time. Try the live
      // plan path as a fallback before giving up.
      const ok = await fetchPlanOnce(true) || await fetchPlanOnce(false);
      if (ok) { setCoverageLive(true); setCoverageStatus(t('map.edit.coverageLive')); startCoveragePoll(); }
      else setCoverageStatus(t('map.edit.coverageNone'));
    } finally {
      setCoverageLoading(false);
    }
  }, [sn, mowingActive, online, t, showLiveCoverage, fetchPlanOnce, stopCoveragePoll, startCoveragePoll]);

  // Toggle handler: on first enable, show cached path instantly if present,
  // otherwise kick off the right fetch (live plan if mowing, else idle preview).
  // Disable hides the overlay, keeps the cache, and stops live polling.
  const toggleCoverage = useCallback(async () => {
    if (showCoverage) {
      setShowCoverage(false);
      stopCoveragePoll();
      return;
    }
    setShowCoverage(true);
    setCoverageStatus(null);
    if (!sn) return;
    if (mowingActive) { await showLiveCoverage(); return; }
    setCoverageLive(false);
    if (coveragePath && coveragePath.length > 0) return;
    // Try the cache first (cheap GET), then a full refresh if empty.
    try {
      const cached = await getPreviewPath(sn);
      if (cached.length > 0) { setCoveragePath(cached); return; }
    } catch { /* fall through to refresh */ }
    await refreshCoverage();
  }, [showCoverage, coveragePath, sn, mowingActive, showLiveCoverage, refreshCoverage, stopCoveragePoll]);

  // Auto-switch: when the mower transitions into/out of mowing WHILE the panel
  // is open, switch to/from the live plan path automatically. Also stops the
  // poll when the panel closes or the component unmounts.
  useEffect(() => {
    if (!showCoverage) { stopCoveragePoll(); return; }
    if (mowingActive) {
      if (!coveragePollRef.current) void showLiveCoverage();
    } else {
      // Stopped mowing: stop polling, drop the live indicator. Keep the last
      // path on screen (no auto preview-refresh — that needs a user action /
      // could 128 a just-finished task that hasn't cleared yet).
      stopCoveragePoll();
      setCoverageLive(false);
      setCoverageStatus((s) => (s === t('map.edit.coverageLive') ? null : s));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mowingActive, showCoverage]);

  // Auto-toon het maaipad zodra de maaier gaat maaien — geen knop-druk nodig.
  // Vuurt alleen op de overgang naar mowing (mowingActive in deps); sluit de
  // gebruiker de overlay handmatig, dan blijft die dicht tot de volgende sessie.
  useEffect(() => {
    if (mowingActive) setShowCoverage(true);
  }, [mowingActive]);

  // Cleanup poll on unmount.
  useEffect(() => () => stopCoveragePoll(), [stopCoveragePoll]);

  // Pending counts for the edit bar.
  const pendingDraftCount = useMemo(
    () => editGeometry ? editGeometry.maps.filter(m => m.draft).length : 0,
    [editGeometry],
  );
  // Keep the bar visible while there is any undo/redo history to traverse, even
  // after undoing back to an empty draft set — otherwise Redo becomes unreachable.
  const showEditBar = !!editGeometry && (pendingDraftCount > 0 || editGeometry.pendingSync || history.length > 1);

  // Save edited/drawn polygon — vertices zijn Leaflet GPS coords, converteer naar lokale meters voor API.
  //
  // Routing (R2): editing existing work/obstacle geometry and adding new
  // obstacles go through the DRAFT flow (saveEditDraft) — they become pending
  // changes that the MapEditBar applies/reverts. Drawing a brand-new work area
  // or unicom keeps the existing direct-create path (createMap); creating new
  // top-level areas is a separate existing feature, not part of edit/draft.
  const handleSavePolygon = useCallback(() => {
    if (editVertices.length < 3 || !chargerGps) return;
    const gpsArea = editVertices.map(([lat, lng]) => ({ lat, lng }));
    const localArea = gpsArea.map(p => gpsToLocal(p, chargerGps!));
    const points = localArea.map(p => ({ x: p.x, y: p.y }));

    const finishEdit = () => {
      setEditMode('none');
      setEditVertices([]);
      setEditingMapId(null);
    };

    if (editMode === 'edit' && editingMapId) {
      const target = maps.find(m => m.mapId === editingMapId);
      const canonical = target?.canonicalName ?? null;
      // Draft flow for existing work/obstacle geometry.
      if (canonical && (target!.mapType === 'work' || target!.mapType === 'obstacle')) {
        saveEditDraft(sn, { canonical, points }).then(async r => {
          if (r.ok) {
            await reloadMaps();
            await refreshEditGeometry();
            recordHistory();
            setEditStatus('');
            setEditStatusKind('info');
          } else {
            setEditStatus(r.error || t('map.edit.validationFailed'));
            setEditStatusKind('error');
          }
          finishEdit();
        }).catch(() => { finishEdit(); });
        return;
      }
      // Fallback: unicom (or legacy maps without canonical) — direct update.
      updateMapArea(sn, editingMapId, localArea).then(() => {
        setMaps(prev => prev.map(m => m.mapId === editingMapId ? { ...m, mapArea: localArea } : m));
        finishEdit();
      }).catch(() => { finishEdit(); });
    } else if (editMode === 'draw') {
      // New OBSTACLE → draft flow (attached to a parent work map).
      if (drawType === 'obstacle') {
        const selWork = maps.find(m => m.mapId === selectedMapId && m.mapType === 'work');
        const parent = selWork ?? maps.find(m => m.mapType === 'work');
        const parentMap = parent?.canonicalName ?? null;
        if (!parentMap) {
          setEditStatus(t('map.edit.validationFailed'));
          setEditStatusKind('error');
          finishEdit();
          return;
        }
        saveEditDraft(sn, { mapType: 'obstacle', parentMap, points }).then(async r => {
          if (r.ok) {
            await reloadMaps();
            await refreshEditGeometry();
            recordHistory();
            setEditStatus('');
            setEditStatusKind('info');
          } else {
            setEditStatus(r.error || t('map.edit.validationFailed'));
            setEditStatusKind('error');
          }
          finishEdit();
        }).catch(() => { finishEdit(); });
        return;
      }
      // New WORK area or UNICOM → existing direct-create path (unchanged).
      const typeMeta = AREA_TYPE_META[drawType];
      const trimmedName = drawName.trim();
      const name = trimmedName || (() => {
        const count = gpsMaps.filter(m => {
          const s = getAreaStyle(m.mapType, m.mapId, m.mapName);
          return s.color === typeMeta.color;
        }).length;
        return `${typeMeta.label} ${count + 1}`;
      })();
      createMap(sn, name, localArea, drawType).then(newMap => {
        setMaps(prev => [...prev, newMap]);
        setEditMode('none');
        setEditVertices([]);
        setSelectedMapId(newMap.mapId);
      }).catch(() => {});
    }
  }, [editVertices, editMode, editingMapId, sn, maps, selectedMapId, gpsMaps, drawType, drawName, AREA_TYPE_META, chargerGps, reloadMaps, refreshEditGeometry, recordHistory, t]);

  // Cancel edit/draw
  const cancelEditPolygon = useCallback(() => {
    setEditMode('none');
    setEditVertices([]);
    setEditingMapId(null);
  }, []);

  // ── Draft apply / revert / discard (R2) ─────────────────────────
  const handleApplyEdits = useCallback(async () => {
    if (!sn || applying) return;
    setApplying(true);
    const r = await applyEdits(sn).catch(() => null);
    setApplying(false);
    if (!r) {
      setEditStatus(t('map.edit.pushFailed'));
      setEditStatusKind('error');
      await refreshEditGeometry();
      return;
    }
    if (r.ok) {
      const warnings = r.validation?.warnings ?? [];
      const warnText = warnings.map(w => `${w.canonical}: ${w.message}`).join('\n');
      setEditStatus([t('map.edit.applied'), warnText].filter(Boolean).join('\n'));
      setEditStatusKind(warnings.length ? 'warn' : 'ok');
      // Drafts are committed → the obstacle base in maps is now the new origin.
      obstacleOffsetBase.current.clear();
      await reloadMaps();
      await refreshEditGeometry();
      resetHistory(); // drafts cleared after apply → fresh empty history
      return;
    }
    switch (r.reason) {
      case 'validation': {
        const errors = r.validation?.errors ?? [];
        setEditStatus(errors.map(e => `${e.canonical}: ${e.message}`).join('\n') || t('map.edit.validationFailed'));
        setEditStatusKind('error');
        break; // keep drafts
      }
      case 'busy':
      case 'locked':
        setEditStatus(t('map.edit.busy'));
        setEditStatusKind('error');
        break;
      case 'offline':
        setEditStatus(t('map.edit.offline'));
        setEditStatusKind('error');
        break;
      case 'no_changes':
        setEditStatus(t('map.edit.noChanges'));
        setEditStatusKind('info');
        await refreshEditGeometry();
        break;
      case 'push_failed':
      case 'bundle_failed':
        setEditStatus(t('map.edit.pushFailed'));
        setEditStatusKind('error');
        await refreshEditGeometry();
        break;
      default:
        setEditStatus(t('map.edit.validationFailed'));
        setEditStatusKind('error');
        await refreshEditGeometry();
    }
  }, [sn, applying, reloadMaps, refreshEditGeometry, resetHistory, t]);

  const handleRevertEdits = useCallback(async () => {
    if (!sn || applying) return;
    if (!window.confirm(t('map.edit.confirmRevert'))) return;
    setApplying(true);
    const r = await revertEdits(sn).catch(() => null);
    setApplying(false);
    if (r?.ok) {
      setEditStatus(t('map.edit.applied'));
      setEditStatusKind('ok');
    } else {
      setEditStatus(r?.reason === 'no_changes' ? t('map.edit.nothingToRevert') : t('map.edit.pushFailed'));
      setEditStatusKind(r?.reason === 'no_changes' ? 'info' : 'error');
    }
    obstacleOffsetBase.current.clear();
    await reloadMaps();
    await refreshEditGeometry();
    resetHistory(); // server-side revert cleared drafts → fresh history
  }, [sn, applying, reloadMaps, refreshEditGeometry, resetHistory, t]);

  const handleDiscardEdits = useCallback(async () => {
    if (!sn || applying) return;
    if (!window.confirm(t('map.edit.confirmDiscard'))) return;
    setApplying(true);
    await discardEditDrafts(sn).catch(() => {});
    setApplying(false);
    setEditStatus('');
    setEditStatusKind('info');
    obstacleOffsetBase.current.clear();
    await reloadMaps();
    await refreshEditGeometry();
    resetHistory(); // drafts discarded → fresh empty history
  }, [sn, applying, reloadMaps, refreshEditGeometry, resetHistory, t]);

  // Latest LOCAL points for a canonical: the pending DRAFT if one exists
  // (editGeometry mirrors the server draft store), else the committed geometry
  // from the maps list. Both are local meters (charger = 0,0); no GPS round-trip.
  const latestLocalPoints = useCallback((canonical: string): XY[] | null => {
    const draftEntry = editGeometry?.maps.find(e => e.canonical === canonical);
    if (draftEntry?.draft && !draftEntry.draft.deleted && draftEntry.draft.points.length >= 3) {
      return draftEntry.draft.points.map(p => ({ x: p.x, y: p.y }));
    }
    const m = maps.find(p => p.canonicalName === canonical);
    if (m && m.mapArea.length >= 3) return m.mapArea.map(p => ({ x: p.x, y: p.y }));
    return null;
  }, [editGeometry, maps]);

  // ── Obstacle expand / shrink (R3, Part A) ───────────────────────
  // LOCAL points come straight from the maps list (mapArea is local meters,
  // charger = 0,0) — never via a GPS round-trip. Cumulative offset is computed
  // from a cached ORIGINAL base by the accumulated distance, so repeated clicks
  // do NOT compound the miter-join rounding of offsetPolygon.
  const OBSTACLE_OFFSET_STEP = 0.05; // meters per click
  const MIN_OBSTACLE_OFFSET_AREA = 0.5; // m² floor when shrinking

  const offsetSelectedObstacle = useCallback(async (dir: 1 | -1) => {
    if (!sn || applying) return;
    const target = maps.find(m => m.mapId === selectedMapId);
    if (!target || target.mapType !== 'obstacle' || !target.canonicalName) return;
    const canonical = target.canonicalName;

    // Seed the offset base ONCE from the current geometry (a prior brush draft
    // if present, else the committed map). All subsequent clicks offset from
    // that FIXED base by the running `accum` total — never from the previous
    // offset result — so miter-join rounding never compounds across clicks.
    // The cache is cleared on apply/revert/discard so the next session re-seeds.
    let entry = obstacleOffsetBase.current.get(canonical);
    if (!entry) {
      const seed = latestLocalPoints(canonical) ?? target.mapArea.map(p => ({ x: p.x, y: p.y }));
      entry = { base: seed, accum: 0 };
      obstacleOffsetBase.current.set(canonical, entry);
    }

    const nextAccum = entry.accum + dir * OBSTACLE_OFFSET_STEP;
    const next = offsetPolygon(entry.base, nextAccum);

    if (dir < 0 && polygonArea(next) < MIN_OBSTACLE_OFFSET_AREA) {
      setEditStatus(t('map.edit.tooSmall'));
      setEditStatusKind('warn');
      return;
    }

    const r = await saveEditDraft(sn, { canonical, points: next.map(p => ({ x: p.x, y: p.y })) }).catch(() => null);
    if (!r || !r.ok) {
      setEditStatus(r?.error || t('map.edit.validationFailed'));
      setEditStatusKind('error');
      return;
    }
    entry.accum = nextAccum;
    setEditStatus('');
    setEditStatusKind('info');
    await refreshEditGeometry();
    recordHistory();
    await reloadMaps();
  }, [sn, applying, maps, selectedMapId, latestLocalPoints, refreshEditGeometry, reloadMaps, recordHistory, t]);

  // ── Obstacle copy / paste (R6) ──────────────────────────────────
  // COPY: read the selected obstacle's LOCAL points (same source expand/shrink
  // uses — the maps list `mapArea`, charger-relative meters) and stash them in
  // the persisted clipboard. Gated identically to expand/shrink (exactly one
  // obstacle map selected).
  const copySelectedObstacle = useCallback(() => {
    const target = maps.find(m => m.mapId === selectedMapId);
    if (!target || target.mapType !== 'obstacle' || !target.canonicalName) return;
    if (target.mapArea.length < 3) return;
    const points = target.mapArea.map(p => ({ x: p.x, y: p.y }));
    setObstacleClipboard({ points, sourceName: target.mapName ?? target.canonicalName ?? null });
    setEditStatus(t('map.edit.copied'));
    setEditStatusKind('info');
  }, [maps, selectedMapId, setObstacleClipboard, t]);

  // PASTE: drop the clipboard shape as a NEW obstacle DRAFT attached to a work
  // map. Parent work map preference:
  //   1. the selected map if it IS a work map (same-map / different-map paste —
  //      the user selects another work map first, then Paste),
  //   2. else the work map whose polygon CONTAINS the computed paste point,
  //   3. else the first work map.
  // Cross-mower: the clipboard persists via localStorage, so after switching
  // mowers Paste attaches the same relative shape to the NEW mower's work map.
  //
  // Placement: translate the clipboard points so their centroid lands at the
  // current Leaflet view CENTER (visible + not overlapping the original). If the
  // map instance / charger GPS isn't available, fall back to a small fixed +0.7m
  // x/y offset. The result becomes a pending dashed obstacle draft, included in
  // the next Apply and undoable via the F1 history.
  const pasteObstacle = useCallback(async () => {
    if (!sn || applying) return;
    const clip = obstacleClipboard;
    if (!clip || clip.points.length < 3) return;

    // Centroid of the clipboard shape (simple vertex average — adequate for
    // placement; exact area-centroid not needed here).
    const n = clip.points.length;
    const cx = clip.points.reduce((s, p) => s + p.x, 0) / n;
    const cy = clip.points.reduce((s, p) => s + p.y, 0) / n;

    // Desired centroid in the mapArea LOCAL frame. Prefer the Leaflet view
    // center → local (mirrors brushToLocal: gpsToLocal yields the charger-origin
    // frame, add the pose offset back to land in the mapArea frame). Fall back to
    // original-centroid + fixed delta when no map/GPS is available.
    let targetCx = cx + PASTE_FALLBACK_DELTA;
    let targetCy = cy + PASTE_FALLBACK_DELTA;
    const lmap = leafletMapRef.current;
    if (lmap && isUsableChargerGps(chargerGps)) {
      try {
        const center = lmap.getCenter();
        const offX = chargingPose?.x ?? 0;
        const offY = chargingPose?.y ?? 0;
        const l = gpsToLocal({ lat: center.lat, lng: center.lng }, chargerGps);
        const vc = { x: l.x + offX, y: l.y + offY };
        if (Number.isFinite(vc.x) && Number.isFinite(vc.y)) {
          targetCx = vc.x;
          targetCy = vc.y;
        }
      } catch { /* keep fixed-offset fallback */ }
    }

    const dx = targetCx - cx;
    const dy = targetCy - cy;
    const translated = clip.points.map(p => ({ x: p.x + dx, y: p.y + dy }));

    // Choose the parent work map canonical.
    const sel = maps.find(m => m.mapId === selectedMapId);
    const works = maps.filter(m => m.mapType === 'work' && m.canonicalName);
    let parent: MapData | undefined;
    if (sel && sel.mapType === 'work' && sel.canonicalName) {
      parent = sel; // explicit (same-map or different-map) selection
    } else {
      // Work map whose polygon contains the paste centroid, else the first work.
      parent = works.find(m => pointInPolygonXY({ x: targetCx, y: targetCy }, m.mapArea)) ?? works[0];
    }
    if (!parent || !parent.canonicalName) {
      setEditStatus(t('map.edit.pasteNoWork'));
      setEditStatusKind('warn');
      return;
    }

    const r = await saveEditDraft(sn, {
      mapType: 'obstacle',
      parentMap: parent.canonicalName,
      points: translated,
    }).catch(() => null);
    if (!r || !r.ok) {
      setEditStatus(r?.error || t('map.edit.validationFailed'));
      setEditStatusKind('error');
      return;
    }
    await refreshEditGeometry();
    recordHistory();
    await reloadMaps();
    // Auto-activate Move on the freshly pasted obstacle so the user can drag it
    // into position immediately. The paste's saveEditDraft response carries the
    // server-assigned canonical — the cleanest identifier (the pasted obstacle is
    // a draft-only map, may not be in the committed `maps` list). We do NOT touch
    // selectedMapId here: the draft obstacle has no maps-list entry to select, and
    // changing selectedMapId would trip the move-exit effect.
    if (r.canonical) {
      setMoveTargetCanonical(r.canonical);
      setMoveWorking(null);
      moveStroke.current = null;
      moveWorkingRef.current = null;
      setMoveMode(true);
    }
    setEditStatus(t('map.edit.pasted'));
    setEditStatusKind('info');
  }, [sn, applying, obstacleClipboard, maps, selectedMapId, chargerGps, chargingPose, refreshEditGeometry, recordHistory, reloadMaps, t]);

  // ── Push/pull brush (R3, Part B) ────────────────────────────────
  // Working state for a brush stroke: the densified base ring + the anchor that
  // was grabbed. delta is applied via applyBrush on every mousemove.
  const brushStroke = useRef<{ canonical: string; base: XY[]; anchor: XY } | null>(null);
  // Latest working polygon mirrored in a ref so mouseup reads the exact last
  // value regardless of React state-batching timing.
  const brushWorkingRef = useRef<XY[] | null>(null);

  // The selected map eligible for the brush (work or obstacle, not unicom).
  const brushTarget = useMemo(() => {
    const m = maps.find(p => p.mapId === selectedMapId);
    if (!m || !m.canonicalName) return null;
    if (m.mapType !== 'work' && m.mapType !== 'obstacle') return null;
    return m;
  }, [maps, selectedMapId]);

  const enterBrushMode = useCallback(() => {
    setEditMode('none');
    setEditVertices([]);
    setEditingMapId(null);
    setPaintMode(false);
    setPaintWorking(null);
    setMoveMode(false);
    setMoveTargetCanonical(null);
    setMoveWorking(null);
    setBrushMode(true);
    setBrushWorking(null);
    brushStroke.current = null;
  }, []);

  const exitBrushMode = useCallback(() => {
    setBrushMode(false);
    setBrushWorking(null);
    brushStroke.current = null;
  }, []);

  // Begin a stroke: hit-test the polygon edge near the pointer; if hit, grab.
  // Source from the LATEST geometry (prior brush draft if present) so successive
  // strokes accumulate rather than reverting to the committed base.
  const handleBrushDown = useCallback((m: XY) => {
    if (!brushTarget || !chargerGps) return false;
    const canonical = brushTarget.canonicalName!;
    const localPts = latestLocalPoints(canonical);
    if (!localPts || localPts.length < 3) return false;
    const hit = hitTestEdge(localPts, m, brushRadius * 2);
    if (!hit) return false;
    const base = densifyPolygon(localPts, brushRadius / 4);
    brushStroke.current = { canonical, base, anchor: m };
    brushWorkingRef.current = base;
    setBrushWorking(base);
    return true;
  }, [brushTarget, chargerGps, brushRadius, latestLocalPoints]);

  // During a stroke: push/pull the densified ring by the cursor delta.
  const handleBrushMove = useCallback((m: XY) => {
    const stroke = brushStroke.current;
    if (!stroke) return;
    const delta = { x: m.x - stroke.anchor.x, y: m.y - stroke.anchor.y };
    const next = applyBrush(stroke.base, stroke.anchor, delta, brushRadius);
    brushWorkingRef.current = next;
    setBrushWorking(next);
  }, [brushRadius]);

  // End a stroke: commit the working polygon as a draft, then re-source.
  const handleBrushUp = useCallback(async () => {
    const stroke = brushStroke.current;
    brushStroke.current = null;
    if (!stroke) return;
    const working = brushWorkingRef.current;
    brushWorkingRef.current = null;
    setBrushWorking(null);
    if (!working || working.length < 3 || !sn) return;
    const r = await saveEditDraft(sn, {
      canonical: stroke.canonical,
      points: working.map(p => ({ x: p.x, y: p.y })),
    }).catch(() => null);
    if (!r || !r.ok) {
      setEditStatus(r?.error || t('map.edit.validationFailed'));
      setEditStatusKind('error');
      return;
    }
    setEditStatus('');
    setEditStatusKind('info');
    await refreshEditGeometry();
    recordHistory();
    await reloadMaps();
  }, [sn, refreshEditGeometry, reloadMaps, recordHistory, t]);

  // Live in-progress brush overlay projected to GPS (same charger/pose shift as
  // gpsMaps / draftOverlays).
  const brushOverlayGps = useMemo(() => {
    if (!brushWorking || !isUsableChargerGps(chargerGps)) return null;
    const offX = chargingPose?.x ?? 0;
    const offY = chargingPose?.y ?? 0;
    const gps = brushWorking.flatMap(p => {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return [];
      const g = localToGps({ x: p.x - offX, y: p.y - offY }, chargerGps);
      if (!Number.isFinite(g.lat) || !Number.isFinite(g.lng)) return [];
      return [g];
    });
    return gps.length >= 3 ? gps : null;
  }, [brushWorking, chargerGps, chargingPose]);

  // GPS → mapArea-local frame for the brush. gpsToLocal yields {p.x-offX, p.y-offY}
  // (the frame gpsMaps renders into); add the pose offset back to match mapArea.
  const brushToLocal = useCallback((latlng: L.LatLng): XY => {
    if (!isUsableChargerGps(chargerGps)) return { x: NaN, y: NaN };
    const offX = chargingPose?.x ?? 0;
    const offY = chargingPose?.y ?? 0;
    const l = gpsToLocal({ lat: latlng.lat, lng: latlng.lng }, chargerGps);
    return { x: l.x + offX, y: l.y + offY };
  }, [chargerGps, chargingPose]);

  // ── Paint/erase brush (primary tool) ────────────────────────────
  // Working ring mirrored in a ref so mouseup reads the exact last value
  // regardless of React state-batching. canonical pins the stroke's target.
  const paintStroke = useRef<{ canonical: string } | null>(null);
  const paintWorkingRef = useRef<XY[] | null>(null);

  // The selected map eligible for paint (work or obstacle, not unicom) — same
  // gating as the push/pull brush.
  const paintTarget = useMemo(() => {
    const m = maps.find(p => p.mapId === selectedMapId);
    if (!m || !m.canonicalName) return null;
    if (m.mapType !== 'work' && m.mapType !== 'obstacle') return null;
    return m;
  }, [maps, selectedMapId]);

  const enterPaintMode = useCallback(() => {
    setEditMode('none');
    setEditVertices([]);
    setEditingMapId(null);
    setBrushMode(false);
    setBrushWorking(null);
    brushStroke.current = null;
    setMoveMode(false);
    setMoveTargetCanonical(null);
    setMoveWorking(null);
    setPaintMode(true);
    setPaintWorking(null);
    paintStroke.current = null;
    paintWorkingRef.current = null;
  }, []);

  const exitPaintMode = useCallback(() => {
    setPaintMode(false);
    setPaintWorking(null);
    paintStroke.current = null;
    paintWorkingRef.current = null;
  }, []);

  // Selecting a different map exits paint mode (the working ring was seeded from
  // the previous map). Re-enter from the new map's tool toolbar.
  useEffect(() => {
    setPaintMode(false);
    setPaintWorking(null);
    paintStroke.current = null;
    paintWorkingRef.current = null;
  }, [selectedMapId]);

  // Apply one brush op (paint=union / erase=difference) at a local point.
  const applyPaintOp = useCallback((prev: XY[], m: XY): XY[] => {
    return paintTool === 'paint'
      ? paintCircle(prev, m, paintRadius)
      : eraseCircle(prev, m, paintRadius);
  }, [paintTool, paintRadius]);

  // Begin a stroke: seed the working ring from the LATEST geometry (prior draft
  // if present) so successive strokes stack, then apply one op at the down point.
  const handlePaintDown = useCallback((m: XY) => {
    if (!paintTarget || !chargerGps) return false;
    const canonical = paintTarget.canonicalName!;
    const localPts = latestLocalPoints(canonical);
    if (!localPts || localPts.length < 3) return false;
    const next = (paintTool === 'paint' ? paintCircle : eraseCircle)(localPts, m, paintRadius);
    paintStroke.current = { canonical };
    paintWorkingRef.current = next;
    setPaintWorking(next);
    return true;
  }, [paintTarget, chargerGps, paintTool, paintRadius, latestLocalPoints]);

  // During a stroke: accumulate the op onto the working ring.
  const handlePaintMove = useCallback((m: XY) => {
    if (!paintStroke.current) return;
    const prev = paintWorkingRef.current;
    if (!prev || prev.length < 3) return;
    const next = applyPaintOp(prev, m);
    paintWorkingRef.current = next;
    setPaintWorking(next);
  }, [applyPaintOp]);

  // End a stroke: commit the working polygon as a draft, then re-source so the
  // next stroke stacks on the refreshed geometry. Paint mode stays ON.
  const handlePaintUp = useCallback(async () => {
    const stroke = paintStroke.current;
    paintStroke.current = null;
    if (!stroke) return;
    const working = paintWorkingRef.current;
    paintWorkingRef.current = null;
    setPaintWorking(null);
    if (!working || working.length < 3 || !sn) return;
    const r = await saveEditDraft(sn, {
      canonical: stroke.canonical,
      points: working.map(p => ({ x: p.x, y: p.y })),
    }).catch(() => null);
    if (!r || !r.ok) {
      setEditStatus(r?.error || t('map.edit.validationFailed'));
      setEditStatusKind('error');
      return;
    }
    setEditStatus('');
    setEditStatusKind('info');
    await refreshEditGeometry();
    recordHistory();
    await reloadMaps();
  }, [sn, refreshEditGeometry, reloadMaps, recordHistory, t]);

  // Live in-progress paint overlay projected to GPS (same charger/pose shift).
  const paintOverlayGps = useMemo(() => {
    if (!paintWorking || !isUsableChargerGps(chargerGps)) return null;
    const offX = chargingPose?.x ?? 0;
    const offY = chargingPose?.y ?? 0;
    const gps = paintWorking.flatMap(p => {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return [];
      const g = localToGps({ x: p.x - offX, y: p.y - offY }, chargerGps);
      if (!Number.isFinite(g.lat) || !Number.isFinite(g.lng)) return [];
      return [g];
    });
    return gps.length >= 3 ? gps : null;
  }, [paintWorking, chargerGps, chargingPose]);

  // GPS → mapArea-local frame for paint (same as brushToLocal).
  const paintToLocal = brushToLocal;
  // Identity latlng passthrough for the cursor preview (kept calibration-naive;
  // the brush operates in unrotated frame, like the live overlay before calibrate).
  const paintCursorLatLng = useCallback((latlng: L.LatLng): L.LatLng => latlng, []);

  // ── Move/translate tool ─────────────────────────────────────────
  // Current LOCAL points for a canonical = the pending DRAFT points if present
  // (a fresh paste / prior edit), else the committed `maps` entry's mapArea.
  // Same source ordering as latestLocalPoints, but keyed for the move target —
  // which may be a draft-only obstacle (paste) not yet in the maps list.
  const geometryFor = useCallback((canonical: string): XY[] | null => {
    const draftEntry = editGeometry?.maps.find(e => e.canonical === canonical);
    if (draftEntry?.draft && !draftEntry.draft.deleted && draftEntry.draft.points.length >= 3) {
      return draftEntry.draft.points.map(p => ({ x: p.x, y: p.y }));
    }
    const m = maps.find(p => p.canonicalName === canonical);
    if (m && m.mapArea.length >= 3) return m.mapArea.map(p => ({ x: p.x, y: p.y }));
    return null;
  }, [editGeometry, maps]);

  const exitMoveMode = useCallback(() => {
    setMoveMode(false);
    setMoveTargetCanonical(null);
    setMoveWorking(null);
    moveStroke.current = null;
    moveWorkingRef.current = null;
  }, []);

  // Enter move mode targeting a specific canonical. Mirrors how paint/brush
  // exit each other — this clears the other edit modes first.
  const enterMoveMode = useCallback((canonical: string) => {
    setEditMode('none');
    setEditVertices([]);
    setEditingMapId(null);
    setBrushMode(false);
    setBrushWorking(null);
    brushStroke.current = null;
    setPaintMode(false);
    setPaintWorking(null);
    paintStroke.current = null;
    paintWorkingRef.current = null;
    setMoveTargetCanonical(canonical);
    setMoveWorking(null);
    moveStroke.current = null;
    moveWorkingRef.current = null;
    setMoveMode(true);
  }, []);

  // Drag-in-progress state: the base points captured at mousedown + the grabbed
  // anchor. delta = current − anchor is added to every base point on mousemove.
  const moveStroke = useRef<{ canonical: string; base: XY[]; anchor: XY } | null>(null);
  const moveWorkingRef = useRef<XY[] | null>(null);

  // Begin a drag — only if the down point is INSIDE the target polygon (so the
  // user grabs the shape; outside lets the map pan). Seeds the base from the
  // LATEST geometry (draft if present) so successive nudges stack.
  const handleMoveDown = useCallback((m: XY): boolean => {
    if (!moveTargetCanonical || !chargerGps) return false;
    const pts = geometryFor(moveTargetCanonical);
    if (!pts || pts.length < 3) return false;
    if (!pointInPolygonXY(m, pts)) return false; // must press inside the shape
    moveStroke.current = { canonical: moveTargetCanonical, base: pts, anchor: m };
    moveWorkingRef.current = pts;
    setMoveWorking(pts);
    return true;
  }, [moveTargetCanonical, chargerGps, geometryFor]);

  // During a drag: translate every base point by (current − anchor).
  const handleMoveMove = useCallback((m: XY) => {
    const stroke = moveStroke.current;
    if (!stroke) return;
    const dx = m.x - stroke.anchor.x;
    const dy = m.y - stroke.anchor.y;
    const next = stroke.base.map(p => ({ x: p.x + dx, y: p.y + dy }));
    moveWorkingRef.current = next;
    setMoveWorking(next);
  }, []);

  // End a drag: commit the translated shape as a draft, refresh + record history,
  // then re-seed from the refreshed geometry. Move mode stays ON so the user can
  // nudge again. A zero-delta tap (anchor == release) writes the same points back
  // — harmless, the server validates identically; we skip it to avoid noise.
  const handleMoveUp = useCallback(async () => {
    const stroke = moveStroke.current;
    moveStroke.current = null;
    if (!stroke) return;
    const working = moveWorkingRef.current;
    moveWorkingRef.current = null;
    setMoveWorking(null);
    if (!working || working.length < 3 || !sn) return;
    // No-op tap (didn't actually move) → don't write a draft / history entry.
    const moved = working.some((p, i) => p.x !== stroke.base[i]?.x || p.y !== stroke.base[i]?.y);
    if (!moved) return;
    const r = await saveEditDraft(sn, {
      canonical: stroke.canonical,
      points: working.map(p => ({ x: p.x, y: p.y })),
    }).catch(() => null);
    if (!r || !r.ok) {
      setEditStatus(r?.error || t('map.edit.validationFailed'));
      setEditStatusKind('error');
      return;
    }
    setEditStatus('');
    setEditStatusKind('info');
    await refreshEditGeometry();
    recordHistory();
    await reloadMaps();
  }, [sn, refreshEditGeometry, reloadMaps, recordHistory, t]);

  // Live in-progress move overlay projected to GPS (same charger/pose shift as
  // gpsMaps / draftOverlays / paint overlay).
  const moveOverlayGps = useMemo(() => {
    if (!moveWorking || !isUsableChargerGps(chargerGps)) return null;
    const offX = chargingPose?.x ?? 0;
    const offY = chargingPose?.y ?? 0;
    const gps = moveWorking.flatMap(p => {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return [];
      const g = localToGps({ x: p.x - offX, y: p.y - offY }, chargerGps);
      if (!Number.isFinite(g.lat) || !Number.isFinite(g.lng)) return [];
      return [g];
    });
    return gps.length >= 3 ? gps : null;
  }, [moveWorking, chargerGps, chargingPose]);

  // GPS → mapArea-local frame for move (identical conversion to brushToLocal).
  const moveToLocal = brushToLocal;

  // Move mode is also a "selected map" type tool — selecting a different map (or
  // entering paint via the effect below) must exit it. The selectedMapId effect
  // (used by paint) is reused; mirror it for move so a new selection drops out.
  useEffect(() => {
    setMoveMode(false);
    setMoveTargetCanonical(null);
    setMoveWorking(null);
    moveStroke.current = null;
    moveWorkingRef.current = null;
  }, [selectedMapId]);

  // Add point in draw mode
  const handleDrawPoint = useCallback((latlng: [number, number]) => {
    setEditVertices(prev => [...prev, latlng]);
  }, []);

  const hasGps = lat && lng && lat !== '0' && lng !== '0';
  const position: [number, number] = (() => {
    const offLat = Number.isFinite(activeCal.offsetLat) ? activeCal.offsetLat : 0;
    const offLng = Number.isFinite(activeCal.offsetLng) ? activeCal.offsetLng : 0;
    // Prefer the live, cm-accurate local map_position projected through the
    // charger origin — exactly the same frame as the polygons. The mower's
    // reported GPS only updates sporadically (~every 50s) and carries the
    // ~base offset, so it makes a poor, frozen-looking marker. Fall back to the
    // reported GPS only when map_position or the charger origin is unavailable.
    const mx = mapX != null ? parseFloat(mapX) : NaN;
    const my = mapY != null ? parseFloat(mapY) : NaN;
    if (Number.isFinite(mx) && Number.isFinite(my) && isUsableChargerGps(chargerGps)) {
      const g = localToGps({ x: mx - (chargingPose?.x ?? 0), y: my - (chargingPose?.y ?? 0) }, chargerGps);
      const pLat = g.lat + offLat;
      const pLng = g.lng + offLng;
      if (Number.isFinite(pLat) && Number.isFinite(pLng)) return [pLat, pLng];
    }
    if (!hasGps) return DEFAULT_CENTER;
    const numLat = parseFloat(lat) + offLat;
    const numLng = parseFloat(lng) + offLng;
    if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) return DEFAULT_CENTER;
    return [numLat, numLng];
  })();

  const [userInteracted, setUserInteracted] = useState(false);
  const [mapsFitted, setMapsFitted] = useState(false);

  const polygonMaps = gpsMaps.filter(m => m.mapArea.length >= 3);
  // Totale zone-oppervlakte = som van de work-map polygon-area's (m², lokale
  // meters). Dit is de "echte" oppervlakte zoals de app toont (bv. 204 m²),
  // i.t.t. de coverage-planner-schatting cov_area+cov_remaining (lager).
  const totalWorkAreaM2 = useMemo(() => {
    const sum = maps
      .filter(m => m.mapType === 'work' && Array.isArray(m.mapArea) && m.mapArea.length >= 3)
      .reduce((acc, m) => acc + polygonArea(m.mapArea as XY[]), 0);
    return sum > 0 ? sum : null;
  }, [maps]);

  const trailPositions: [number, number][] = trail.flatMap(p => {
    const lat = p.lat + (Number.isFinite(activeCal.offsetLat) ? activeCal.offsetLat : 0);
    const lng = p.lng + (Number.isFinite(activeCal.offsetLng) ? activeCal.offsetLng : 0);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [[lat, lng] as [number, number]] : [];
  });

  // Mower heading icon — `heading` carries the firmware `theta` field in
  // radians using the ENU convention (0 = East, π/2 = North). The icon
  // helper expects compass degrees (0 = North, 90 = East), so we have to
  // convert ENU → compass before passing it in. Earlier code converted
  // radians → degrees but skipped the ENU→compass step, leaving the
  // arrow rotated 90° clockwise from reality (issue #50 follow-up).
  const thetaRad = heading ? parseFloat(heading) : 0;
  const enuDeg = isNaN(thetaRad) ? 0 : (thetaRad * 180 / Math.PI);
  const compassDeg = ((90 - enuDeg) % 360 + 360) % 360;
  const mowerIcon = useMemo(() => makeMowerIcon(compassDeg), [compassDeg]);
  // Coverage stats per polygon (trail points inside each work area)
  const coverageStats = useMemo(() => {
    if (trail.length === 0) return new Map<string, { points: number; area: number }>();
    const stats = new Map<string, { points: number; area: number }>();
    for (const m of polygonMaps) {
      const style = getAreaStyle(m.mapType, m.mapId, m.mapName);
      if (style !== AREA_STYLES.work) continue;
      const area = polygonAreaM2(m.mapArea);
      let count = 0;
      for (const tp of trail) {
        if (pointInPolygon(tp.lat, tp.lng, m.mapArea)) count++;
      }
      stats.set(m.mapId, { points: count, area });
    }
    return stats;
  }, [trail, polygonMaps]);

  // Charger GPS: ALLEEN uit opgeslagen calibratie — nooit live GPS (voorkomt drift bij refresh)
  const resolvedChargerLat = savedCal.chargerLat || null;
  const resolvedChargerLng = savedCal.chargerLng || null;
  const chargerIcon = useMemo(() => makeChargerIcon(false), []);
  const chargerHasGps = !!(resolvedChargerLat && resolvedChargerLng);

  // Set the charger's DISPLAYED position (menu "Laadstation" click OR marker drag
  // — both routes call this, so they behave identically). The mower-reported
  // GPS (charger base) stays the source of truth and is NEVER overwritten; we
  // only store a VISUAL offset = target − base. Nothing is pushed to the mower.
  // When there is no base yet (mower never auto-detected) we adopt the clicked
  // point as the base so a charger can still be placed manually.
  const handlePlaceCharger = useCallback((lat: number, lng: number) => {
    const baseLat = savedCal.chargerLat;
    const baseLng = savedCal.chargerLng;
    const updated: MapCalibration = (baseLat == null || baseLng == null)
      ? { ...savedCal, chargerLat: lat, chargerLng: lng, offsetLat: 0, offsetLng: 0 }
      : { ...savedCal, offsetLat: lat - baseLat, offsetLng: lng - baseLng };
    setSavedCal(updated);
    setPlacingCharger(false);
    saveCalibration(sn, updated).then(() => {
      toast(t('map.chargerSaved'), 'success');
    });
  }, [sn, savedCal, t]);

  // Export handler
  const handleExport = useCallback(() => {
    if (!chargerHasGps) return;
    exportMaps(sn, { lat: resolvedChargerLat!, lng: resolvedChargerLng! }).then(url => {
      window.open(url, '_blank');
      toast(t('map.exported'), 'success');
    }).catch(() => toast(t('map.exportFailed'), 'error'));
  }, [sn, resolvedChargerLat, resolvedChargerLng, chargerHasGps, t]);

  // Push maps to mower via SSH
  // Navigate-to handler — GPS coords direct van Leaflet klik
  const handleNavigateClick = useCallback((lat: number, lng: number) => {
    setNavigateTarget({ lat, lng });
    setNavigateMode(false);
    navigateToPosition(sn, lat, lng).then(() => {
      toast(`✓ ${t('controls.navigateTo')}`, 'success');
    }).catch(() => toast(`✗ ${t('controls.navigateTo')}`, 'error'));
    setTimeout(() => setNavigateTarget(null), 60_000);
  }, [sn, t, toast]);

  const handleStopNavigation = useCallback(() => {
    setNavigateTarget(null);
    stopNavigation(sn).then(() => {
      toast(`✓ ${t('controls.stopNavigation')}`, 'success');
    }).catch(() => {});
  }, [sn, t, toast]);

  // Virtual wall drawing — GPS coords direct van Leaflet klik
  const handleWallPoint = useCallback((lat: number, lng: number) => {
    if (!wallFirstCorner) {
      setWallFirstCorner({ lat, lng });
    } else {
      createVirtualWall(sn, {
        lat1: wallFirstCorner.lat,
        lng1: wallFirstCorner.lng,
        lat2: lat,
        lng2: lng,
      }).then(() => {
        fetchVirtualWalls(sn).then(setWalls).catch(() => {});
        toast(`✓ No-go zone saved`, 'success');
        setWallFirstCorner(null);
        setWallDrawMode(false);
      }).catch(() => toast(`✗ No-go zone`, 'error'));
    }
  }, [sn, wallFirstCorner, toast]);

  const handleDeleteWall = useCallback((wallId: string) => {
    deleteVirtualWall(sn, wallId).then(() => {
      setWalls(prev => prev.filter(w => w.wall_id !== wallId));
      toast(`✓ No-go zone deleted`, 'success');
    }).catch(() => toast(`✗ Delete failed`, 'error'));
  }, [sn, toast]);

  // Center of all polygon points (used as rotation/scale pivot). Skip
  // any non-finite vertex so a single NaN doesn't propagate into the
  // pathDirection preview polylines and crash Leaflet (issue #15).
  const polyCenter = useMemo(() => {
    let totalLat = 0, totalLng = 0, count = 0;
    for (const m of polygonMaps) {
      for (const p of m.mapArea) {
        if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
        totalLat += p.lat;
        totalLng += p.lng;
        count++;
      }
    }
    if (count === 0) {
      const [pLat, pLng] = position;
      if (Number.isFinite(pLat) && Number.isFinite(pLng)) {
        return { lat: pLat, lng: pLng };
      }
      return { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] };
    }
    return { lat: totalLat / count, lng: totalLng / count };
  }, [polygonMaps, position]);

  // Calibration handlers
  const startCalibrating = useCallback(() => {
    setEditCal({ ...savedCal });
    setUserInteracted(true); // prevent auto-recenter during calibration
  }, [savedCal]);

  const cancelCalibrating = useCallback(() => {
    setEditCal(null);
  }, []);

  const resetCalibrating = useCallback(() => {
    setEditCal(DEFAULT_CAL);
  }, []);

  const handleSaveCalibration = useCallback(() => {
    if (!editCal) return;
    saveCalibration(sn, editCal).then(() => {
      setSavedCal(editCal);
      setEditCal(null);
    }).catch(() => {});
  }, [sn, editCal]);

  const nudge = useCallback((dLat: number, dLng: number) => {
    setEditCal(prev => prev ? { ...prev, offsetLat: prev.offsetLat + dLat, offsetLng: prev.offsetLng + dLng } : prev);
  }, []);

  return (
    <div className="bg-gray-800 rounded-none md:rounded-xl border-0 md:border md:border-gray-700 overflow-hidden flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-1.5 md:px-4 py-1.5 md:py-2 border-b border-gray-700 flex-shrink-0 overflow-x-auto gap-1 md:gap-2">
        <div className="flex items-center gap-1.5 md:gap-3">
          <MapPin className="w-4 h-4 text-blue-400 hidden md:block" />
          {/* Signal icon bar */}
          {signals && (() => {
            const rssi = signals.wifiRssi ? parseInt(signals.wifiRssi, 10) : null;
            const sats = signals.rtkSat ? parseInt(signals.rtkSat, 10) : null;
            const loc = signals.locQuality ? parseInt(signals.locQuality, 10) : null;
            const bat = signals.batteryPower ? parseInt(signals.batteryPower, 10) : null;
            const charging = signals.batteryState?.toUpperCase() === 'CHARGING';
            const BatIcon = charging ? BatteryCharging : bat !== null && bat <= 15 ? BatteryLow : bat !== null && bat >= 80 ? BatteryFull : Battery;
            return (
              <div className="flex items-center gap-1 md:gap-2">
                <span className={`inline-flex items-center gap-0.5 ${bat !== null ? batteryColor(bat) : 'text-gray-600'}`} title={bat !== null ? (charging ? t('devices.batteryCharging', { pct: bat }) : t('devices.batteryLabel', { pct: bat })) : t('devices.batteryNoData')}>
                  <BatIcon className="w-3.5 h-3.5" />
                  {bat !== null && <span className="hidden md:inline text-[10px] font-mono">{bat}%</span>}
                </span>
                <span className={`inline-flex items-center gap-0.5 ${rssi !== null ? wifiColor(rssi) : 'text-gray-600'}`} title={rssi !== null ? t('devices.wifiLabel', { rssi }) : t('devices.wifiNoData')}>
                  {rssi !== null ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                  {rssi !== null && <span className="hidden md:inline text-[10px] font-mono">{rssi}</span>}
                </span>
                <span className={`inline-flex items-center gap-0.5 ${sats !== null ? gpsColor(sats) : 'text-gray-600'}`} title={sats !== null ? t('devices.rtkLabel', { sats }) : t('devices.rtkNoData')}>
                  <Satellite className="w-3.5 h-3.5" />
                  {sats !== null && <span className="hidden md:inline text-[10px] font-mono">{sats}</span>}
                </span>
                <span className={`hidden md:inline-flex items-center gap-0.5 ${loc !== null ? locColor(loc) : 'text-gray-600'}`} title={loc !== null ? t('devices.locLabel', { loc }) : t('devices.locNoData')}>
                  <Crosshair className="w-3.5 h-3.5" />
                  {loc !== null && <span className="text-[10px] font-mono">{loc}%</span>}
                </span>
              </div>
            );
          })()}
        </div>
        <div className="flex items-center gap-1 md:gap-3">
          {lastMowedDate && (
            <span className="inline-flex items-center gap-1 text-xs px-1.5 md:px-2 py-0.5 rounded bg-emerald-900/50 text-emerald-400" title={`Laatst gemaaid: ${lastMowedDate}`}>
              <CheckCircle2 className="w-3 h-3" />
              <span className="hidden md:inline">Gemaaid</span>
            </span>
          )}
          {trail.length > 0 && (
            <button
              onClick={() => setShowTrail(!showTrail)}
              className={`inline-flex items-center gap-1 text-xs px-1.5 md:px-2 py-0.5 rounded transition-colors ${
                showTrail ? 'bg-cyan-900/50 text-cyan-400' : 'bg-gray-700/50 text-gray-500'
              }`}
              title={showTrail ? t('map.hideTrail') : t('map.showTrail')}
            >
              <Route className="w-3 h-3" />
              <span className="hidden md:inline">{trail.length} pts</span>
            </button>
          )}
          {trail.length > 0 && (
            <button
              onClick={handleClearTrail}
              className="hidden md:inline-flex text-gray-500 hover:text-red-400 transition-colors"
              title="Clear GPS trail"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {/* Draw new polygon */}
          {editMode === 'none' && !calibrating && (
            <button
              onClick={startDrawMap}
              className="inline-flex items-center gap-1 text-xs px-1.5 md:px-2 py-0.5 rounded transition-colors bg-gray-700/50 text-gray-400 hover:text-emerald-400 hover:bg-emerald-900/30"
              title={t('map.drawNew')}
            >
              <Pencil className="w-3 h-3" />
              <span className="hidden md:inline">{t('map.draw')}</span>
            </button>
          )}
          {/* Navigate-to toggle */}
          {editMode === 'none' && !calibrating && sn && (
            navigateMode ? (
              <button
                onClick={() => { setNavigateMode(false); setWallDrawMode(false); }}
                className="inline-flex items-center gap-1 text-xs px-1.5 md:px-2 py-0.5 rounded transition-colors bg-blue-600 text-white animate-pulse"
                title={t('controls.navigateTo')}
              >
                <Target className="w-3 h-3" />
                <span className="hidden md:inline">{t('controls.navigateTo')}</span>
              </button>
            ) : (
              <button
                onClick={() => { setNavigateMode(true); setWallDrawMode(false); setPlacingCharger(false); }}
                className="inline-flex items-center gap-1 text-xs px-1.5 md:px-2 py-0.5 rounded transition-colors bg-gray-700/50 text-gray-400 hover:text-blue-400 hover:bg-blue-900/30"
                title={t('controls.navigateTo')}
              >
                <Target className="w-3 h-3" />
              </button>
            )
          )}
          {/* Navigate target cancel */}
          {navigateTarget && (
            <button
              onClick={handleStopNavigation}
              className="inline-flex items-center gap-1 text-xs px-1.5 md:px-2 py-0.5 rounded transition-colors bg-red-900/50 text-red-400 hover:bg-red-800/50"
              title={t('controls.stopNavigation')}
            >
              <XCircle className="w-3 h-3" />
            </button>
          )}
          {/* Virtual wall draw toggle */}
          {editMode === 'none' && !calibrating && sn && (
            wallDrawMode ? (
              <button
                onClick={() => { setWallDrawMode(false); setWallFirstCorner(null); }}
                className="inline-flex items-center gap-1 text-xs px-1.5 md:px-2 py-0.5 rounded transition-colors bg-red-600 text-white animate-pulse"
                title="No-go zone"
              >
                <Fence className="w-3 h-3" />
                <span className="hidden md:inline">No-go</span>
              </button>
            ) : (
              <button
                onClick={() => { setWallDrawMode(true); setNavigateMode(false); setPlacingCharger(false); setWallFirstCorner(null); }}
                className="inline-flex items-center gap-1 text-xs px-1.5 md:px-2 py-0.5 rounded transition-colors bg-gray-700/50 text-gray-400 hover:text-red-400 hover:bg-red-900/30"
                title="No-go zone"
              >
                <Fence className="w-3 h-3" />
              </button>
            )
          )}
          {/* Calibrate toggle */}
          {polygonMaps.length > 0 && !calibrating && editMode === 'none' && (
            <button
              onClick={startCalibrating}
              className="inline-flex items-center gap-1 text-xs px-1.5 md:px-2 py-0.5 rounded transition-colors bg-gray-700/50 text-gray-400 hover:text-amber-400 hover:bg-amber-900/30"
              title={t('map.calibrateOverlay')}
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span className="hidden md:inline">{t('map.calibrate')}</span>
            </button>
          )}
          {/* Heatmap toggle */}
          {trail.length > 10 && (
            <button
              onClick={() => setShowHeatmap(!showHeatmap)}
              className={`inline-flex items-center gap-1 text-xs px-1.5 md:px-2 py-0.5 rounded transition-colors ${
                showHeatmap ? 'bg-orange-900/50 text-orange-400' : 'bg-gray-700/50 text-gray-500'
              }`}
              title={showHeatmap ? t('map.hideHeatmap') : t('map.showHeatmap')}
            >
              <Flame className="w-3 h-3" />
              <span className="hidden md:inline">{t('map.heat')}</span>
            </button>
          )}
          {/* Coverage-path preview toggle — the real "black lines" the mower
              will cut, so the user can verify edits cut closer. */}
          {polygonMaps.length > 0 && editMode === 'none' && !calibrating && sn && (
            <button
              onClick={toggleCoverage}
              disabled={coverageLoading}
              className={`inline-flex items-center gap-1 text-xs px-1.5 md:px-2 py-0.5 rounded transition-colors ${
                showCoverage ? 'bg-zinc-900/70 text-zinc-200 border border-zinc-600' : 'bg-gray-700/50 text-gray-400 hover:text-zinc-200 hover:bg-zinc-900/40'
              } ${coverageLoading ? 'opacity-60 cursor-wait' : ''}`}
              title={t('map.edit.coverageShow')}
            >
              {coverageLoading
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Spline className="w-3 h-3" />}
              <span className="hidden md:inline">{t('map.edit.coverageShow')}</span>
              {coverageLive && !coverageLoading && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title={t('map.edit.coverageLive')} />
              )}
            </button>
          )}
          {/* Refresh coverage path — re-trigger after an Apply to mower */}
          {showCoverage && editMode === 'none' && !calibrating && sn && (
            <button
              onClick={refreshCoverage}
              disabled={coverageLoading}
              className={`inline-flex items-center gap-1 text-xs px-1.5 md:px-2 py-0.5 rounded transition-colors bg-gray-700/50 text-gray-400 hover:text-zinc-200 hover:bg-zinc-900/40 ${coverageLoading ? 'opacity-60 cursor-wait' : ''}`}
              title={t('map.edit.coverageRefresh')}
            >
              <RefreshCw className={`w-3 h-3 ${coverageLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
          {/* Export button (hidden on mobile) */}
          {polygonMaps.length > 0 && editMode === 'none' && !calibrating && (
            <button
              onClick={handleExport}
              disabled={!chargerHasGps}
              className={`hidden md:inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors ${
                chargerHasGps
                  ? 'bg-gray-700/50 text-gray-400 hover:text-cyan-400 hover:bg-cyan-900/30'
                  : 'bg-gray-700/30 text-gray-600 cursor-not-allowed'
              }`}
              title={chargerHasGps ? t('map.exportTooltip') : t('map.exportNoCharger')}
            >
              <Download className="w-3 h-3" />
              {t('map.export')}
            </button>
          )}
          {/* Place/reposition charger button — highlighted when no charger position set */}
          {editMode === 'none' && !calibrating && (
            <button
              onClick={() => setPlacingCharger(!placingCharger)}
              className={`inline-flex items-center gap-1 text-xs px-1.5 md:px-2 py-0.5 rounded transition-colors ${
                placingCharger
                  ? 'bg-amber-600 text-white animate-pulse'
                  : !chargerHasGps
                    ? 'bg-amber-900/50 text-amber-400 border border-amber-700/50 hover:bg-amber-800/50'
                    : 'bg-gray-700/50 text-gray-400 hover:text-amber-400 hover:bg-amber-900/30'
              }`}
              title={placingCharger ? t('map.placeChargerClick') : !chargerHasGps ? t('map.chargerNotSet') : t('map.placeChargerTooltip')}
            >
              <MapPin className="w-3 h-3" />
              <span className="hidden md:inline">{placingCharger ? t('map.placeChargerActive') : t('map.charger')}</span>
            </button>
          )}
          {/* Calibrate charger — drive mower out and back for ArUco scan */}
          {editMode === 'none' && !calibrating && chargerHasGps && sn && (
            <button
              onClick={() => setConfirmCalibrate(true)}
              className="inline-flex items-center gap-1 text-xs px-1.5 md:px-2 py-0.5 rounded bg-gray-700/50 text-gray-400 hover:text-blue-400 hover:bg-blue-900/30 transition-colors"
              title={t('map.calibrateCharger')}
            >
              <Navigation className="w-3 h-3" />
              <span className="hidden md:inline">{t('map.calibrateCharger')}</span>
            </button>
          )}
          <button
            onClick={() => setTileLayer(tileLayer === 'satellite' ? 'street' : 'satellite')}
            className={`inline-flex items-center gap-1 text-xs px-1.5 md:px-2 py-0.5 rounded transition-colors ${
              tileLayer === 'satellite' ? 'bg-blue-900/50 text-blue-400' : 'bg-gray-700/50 text-gray-500'
            }`}
            title={tileLayer === 'satellite' ? t('map.switchToStreet') : t('map.switchToSatellite')}
          >
            <Layers className="w-3 h-3" />
            <span className="hidden md:inline">{tileLayer === 'satellite' ? t('map.sat') : t('map.streetMap')}</span>
          </button>
          {polygonMaps.length > 0 && (() => {
            const counts = { work: 0, obstacle: 0, unicom: 0, other: 0 };
            // Channel filename pattern: only inter-map unicoms are user-
            // visible "channels". `mapXtochargeY_unicom` is the dock-route
            // helper line and isn't counted (matches dir26738's expectation
            // in #28: "I have 2 channels" for a mower with 1 charge + 2
            // inter-map unicoms).
            const isChannelUnicom = (m: { fileName?: string | null; canonicalName?: string | null; mapName?: string | null }) =>
              !/tocharge/i.test(`${m.fileName ?? ''} ${m.canonicalName ?? ''} ${m.mapName ?? ''}`);
            // Work + obstacle still need 3+ points to be a real polygon.
            for (const m of polygonMaps) {
              const s = getAreaStyle(m.mapType, m.mapId, m.mapName);
              if (s === AREA_STYLES.work) counts.work++;
              else if (s === AREA_STYLES.obstacle) counts.obstacle++;
              else if (s === AREA_STYLES.unicom) {
                if (isChannelUnicom(m)) counts.unicom++;
              }
              else counts.other++;
            }
            // Issue #28 round 2: LFI cloud stores inter-map channels as
            // metadata-only (empty CSV by design — see setup.ts line 396),
            // so they have mapArea.length === 0 and were dropped by both
            // the polygon-only filter AND the previous "2-point lines"
            // fallback. Count any DB row of mapType === 'unicom' as a
            // channel regardless of point count, dedup against polygons
            // already counted by mapId.
            const polygonUnicomIds = new Set(polygonMaps.filter(m => m.mapType === 'unicom').map(m => m.mapId));
            for (const m of maps) {
              if (m.mapType === 'unicom' && !polygonUnicomIds.has(m.mapId) && isChannelUnicom(m)) {
                counts.unicom++;
              }
            }
            const parts: string[] = [];
            if (counts.work > 0) parts.push(t('map.maps', { count: counts.work }));
            if (counts.obstacle > 0) parts.push(t('map.obstacles', { count: counts.obstacle }));
            if (counts.unicom > 0) parts.push(t('map.channels', { count: counts.unicom }));
            if (counts.other > 0) parts.push(t('map.otherCount', { count: counts.other }));
            return (
              <span className="hidden md:inline-flex items-center gap-1 text-xs text-gray-500">
                <MapIcon className="w-3 h-3" />
                {parts.join(', ')}
              </span>
            );
          })()}
          {hasGps ? (
            <span className="hidden md:inline text-xs text-gray-500 font-mono">
              {parseFloat(lat).toFixed(6)}, {parseFloat(lng).toFixed(6)}
            </span>
          ) : (
            <span className="hidden md:inline text-xs text-gray-600">{t('map.noGps')}</span>
          )}
        </div>
      </div>
      <div className="relative flex-1 min-h-0">
        <MapContainer
          center={position}
          zoom={20}
          maxZoom={25}
          className="h-full w-full"
          zoomControl={true}
          scrollWheelZoom={true}
          whenReady={() => setUserInteracted(false)}
        >
          <TileLayer
            key={tileLayer}
            attribution={TILE_LAYERS[tileLayer].attribution}
            url={TILE_LAYERS[tileLayer].url}
            maxZoom={TILE_LAYERS[tileLayer].maxZoom}
            maxNativeZoom={TILE_LAYERS[tileLayer].maxNativeZoom}
          />
          {/* Capture the Leaflet instance so paste can read the view center (R6) */}
          <MapInstanceCapture mapRef={leafletMapRef} />
          {/* Saved map polygons with calibration applied */}
          {polygonMaps.map(m => {
            const positions = calibratePoints(m.mapArea, activeCal, polyCenter);
            const baseStyle = getAreaStyle(m.mapType, m.mapId, m.mapName);
            const isBeingEdited = editMode === 'edit' && editingMapId === m.mapId;
            const isSelected = selectedMapId === m.mapId;
            // Dim the polygon being edited (the editor shows its own)
            const style = isBeingEdited
              ? { ...baseStyle, fillOpacity: 0.1, weight: 1, opacity: 0.3, dashArray: '4, 4' }
              : isSelected
                ? { ...baseStyle, fillOpacity: 0.5, weight: 3, opacity: 1 }
                : baseStyle;
            return (
              <Polygon
                key={m.mapId}
                positions={positions}
                pathOptions={style}
                eventHandlers={{
                  click: editMode === 'none' ? (e) => {
                    L.DomEvent.stopPropagation(e);
                    setSelectedMapId(prev => prev === m.mapId ? null : m.mapId);
                  } : undefined,
                }}
              >
                {m.mapName && editMode === 'none' && (
                  <Tooltip sticky>{m.mapName}</Tooltip>
                )}
              </Polygon>
            );
          })}
          {/* Pending draft overlays (R2) — dashed, drawn on top of saved maps.
              Hidden while actively editing so the in-progress editor is clear. */}
          {editMode === 'none' && draftOverlays.map(d => {
            const positions = calibratePoints(d.gps, activeCal, polyCenter);
            const base = getAreaStyle(d.mapType);
            return (
              <Polygon
                key={`draft-${d.canonical}`}
                positions={positions}
                pathOptions={{ ...base, dashArray: '6 4', weight: 2, fillOpacity: 0.18, opacity: 0.9 }}
              />
            );
          })}
          {/* Coverage-path preview — the real boustrophedon mowing lines the
              mower will cut ("black lines"). Drawn above the satellite tiles,
              projected into the same frame as the work polygons. */}
          {showCoverage && coverageGps.map(cp => {
            const isFinished = coverProgress.finished.has(cp.id);
            const isActive = cp.id === coverProgress.activeId;
            const full = calibratePoints(cp.gps, activeCal, polyCenter);
            // Finished sub-area → dik groen ("gemaaid"), zoals de app.
            if (isFinished) {
              return (
                <Polyline key={`cov-${cp.id}`} positions={full}
                  pathOptions={{ color: 'rgba(34,197,94,0.9)', weight: 3.5, opacity: 1, lineCap: 'round', lineJoin: 'round' }} />
              );
            }
            // Resterend → dunne hint-lijn; voor het actieve sub-path tekenen we
            // de al-gedekte portie (0..covering_area_points) dik-groen eroverheen.
            const done = isActive && coverProgress.activePoints >= 2
              ? calibratePoints(cp.gps.slice(0, coverProgress.activePoints), activeCal, polyCenter)
              : null;
            return (
              <Fragment key={`cov-${cp.id}`}>
                <Polyline positions={full}
                  pathOptions={{ color: 'rgba(255,255,255,0.35)', weight: 1, opacity: 0.8, lineCap: 'round', lineJoin: 'round' }} />
                {done && done.length >= 2 && (
                  <Polyline positions={done}
                    pathOptions={{ color: 'rgba(34,197,94,0.95)', weight: 3.5, opacity: 1, lineCap: 'round', lineJoin: 'round' }} />
                )}
              </Fragment>
            );
          })}
          {/* Push/pull brush (R3): live in-progress stroke + pointer handler. */}
          {brushMode && brushOverlayGps && brushOverlayGps.length >= 3 && (
            <Polygon
              positions={calibratePoints(brushOverlayGps, activeCal, polyCenter)}
              pathOptions={{ color: '#a78bfa', weight: 2, dashArray: '6 4', fillOpacity: 0.12, fillColor: '#a78bfa' }}
            />
          )}
          {brushMode && editMode === 'none' && !calibrating && (
            <BrushPointerHandler
              toLocal={brushToLocal}
              onDown={handleBrushDown}
              onMove={handleBrushMove}
              onUp={handleBrushUp}
            />
          )}
          {/* Paint/erase brush (primary tool): live in-progress stroke. */}
          {paintMode && paintOverlayGps && paintOverlayGps.length >= 3 && (
            <Polygon
              positions={calibratePoints(paintOverlayGps, activeCal, polyCenter)}
              pathOptions={{
                color: paintTool === 'paint' ? '#34d399' : '#f59e0b',
                weight: 2, dashArray: '6 4', fillOpacity: 0.14,
                fillColor: paintTool === 'paint' ? '#34d399' : '#f59e0b',
              }}
            />
          )}
          {paintMode && editMode === 'none' && !calibrating && (
            <PaintPointerHandler
              toLatLng={paintCursorLatLng}
              toLocal={paintToLocal}
              radius={paintRadius}
              onDown={handlePaintDown}
              onMove={handlePaintMove}
              onUp={handlePaintUp}
            />
          )}
          {/* Move/translate tool: live in-progress dashed overlay of the shape at
              its dragged position, plus the pointer handler. */}
          {moveMode && moveOverlayGps && moveOverlayGps.length >= 3 && (
            <Polygon
              positions={calibratePoints(moveOverlayGps, activeCal, polyCenter)}
              pathOptions={{ color: '#22d3ee', weight: 2, dashArray: '6 4', fillOpacity: 0.14, fillColor: '#22d3ee' }}
            />
          )}
          {moveMode && moveTargetCanonical && editMode === 'none' && !calibrating && (
            <MovePointerHandler
              toLocal={moveToLocal}
              onDown={handleMoveDown}
              onMove={handleMoveMove}
              onUp={handleMoveUp}
            />
          )}
          {/* Polygon editor overlay */}
          {editMode !== 'none' && editVertices.length >= 2 && (
            <PolygonEditor vertices={editVertices} onChange={setEditVertices} color={editorColor} />
          )}
          {/* Draw mode: click handler to add points */}
          {editMode === 'draw' && (
            <DrawClickHandler onPoint={handleDrawPoint} />
          )}
          {/* Edge offset preview (dashed polygon) */}
          {offsetPreview && offsetPreview.length >= 3 && (
            <Polygon
              positions={offsetPreview.map(p => [p.lat, p.lng] as [number, number])}
              pathOptions={{ color: '#22d3ee', weight: 2, dashArray: '6 4', fillOpacity: 0.05, fillColor: '#22d3ee' }}
            />
          )}
          {/* Afgelegde maai-banen (dunne lijntjes geclipt aan polygon) */}
          {coveredLanes && coveredLanes.length > 0 && (() => {
            const wPolys = polygonMaps
              .filter(m => getAreaStyle(m.mapType, m.mapId, m.mapName) === AREA_STYLES.work)
              .map(m => {
                const calPts = calibratePoints(m.mapArea, activeCal, polyCenter);
                return calPts.map(([lat, lng]) => ({ lat, lng }));
              });
            return <CoverageStripes lanes={coveredLanes} workPolys={wPolys} />;
          })()}
          {/* GPS trail centerline — ook TIJDENS maaien tonen als voortgang (waar de
              maaier al geweest is). Eerder verborgen bij work_status==='1', maar dat
              verstopte de maai-voortgang precies wanneer je 'm wilt zien. */}
          {showTrail && !showHeatmap && trailPositions.length >= 2 && (
            <Polyline
              positions={trailPositions}
              pathOptions={{
                color: '#06b6d4',
                weight: 1.5,
                opacity: 0.5,
                dashArray: '4, 3',
              }}
            />
          )}
          {/* Heatmap mode: color trail segments by recency */}
          {showHeatmap && trailPositions.length >= 2 && (() => {
            const chunkSize = Math.max(2, Math.floor(trailPositions.length / 30));
            const chunks: [number, number][][] = [];
            for (let i = 0; i < trailPositions.length; i += chunkSize) {
              const chunk = trailPositions.slice(i, i + chunkSize + 1);
              if (chunk.length >= 2) chunks.push(chunk);
            }
            return chunks.map((chunk, idx) => {
              const tp = chunks.length > 1 ? idx / (chunks.length - 1) : 1;
              const r = Math.round(255 * (1 - tp));
              const g = Math.round(200 * tp);
              const b = Math.round(50 + 100 * (1 - tp));
              return (
                <Polyline
                  key={`heat-${idx}`}
                  positions={chunk}
                  pathOptions={{
                    color: `rgb(${r},${g},${b})`,
                    weight: 4,
                    opacity: 0.3 + 0.5 * tp,
                    lineCap: 'round',
                  }}
                />
              );
            });
          })()}
          {/* Live outline during autonomous mapping (report_state_map_outline) */}
          {liveOutline && liveOutline.length >= 3 && (
            <Polygon
              positions={liveOutline.map(p => [p.lat, p.lng] as [number, number])}
              pathOptions={{
                color: '#a855f7',
                fillColor: '#a855f7',
                fillOpacity: 0.08,
                weight: 2.5,
                opacity: 0.85,
                dashArray: '8, 5',
              }}
            />
          )}
          {/* Mower marker with heading arrow */}
          {hasGps && (
            <Marker position={position} icon={mowerIcon}>
              <Popup>
                <div className="text-xs">
                  <div className="font-semibold">{t('map.mower')}</div>
                  <div>{parseFloat(lat).toFixed(6)}, {parseFloat(lng).toFixed(6)}</div>
                  {heading && <div>{t('map.headingLabel', { deg: parseFloat(heading).toFixed(0) })}</div>}
                </div>
              </Popup>
            </Marker>
          )}
          {/* Click-to-place charger handler */}
          {placingCharger && <ChargerPlacer onPlace={handlePlaceCharger} />}
          {/* Charger marker (draggable to reposition) — apply same calibration offset as polygons */}
          {chargerHasGps && (
            <Marker
              position={[resolvedChargerLat! + activeCal.offsetLat, resolvedChargerLng! + activeCal.offsetLng]}
              icon={chargerIcon}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  // Same path as the menu "Laadstation" placement: store a visual
                  // offset only, never the base, never push to the mower.
                  const { lat, lng } = e.target.getLatLng();
                  handlePlaceCharger(lat, lng);
                },
              }}
            >
              <Popup>
                <div className="text-xs">
                  <div className="font-semibold">{t('map.chargingStation')}</div>
                  <div>{(resolvedChargerLat! + activeCal.offsetLat).toFixed(6)}, {(resolvedChargerLng! + activeCal.offsetLng).toFixed(6)}</div>
                  {(activeCal.offsetLat !== 0 || activeCal.offsetLng !== 0) && (
                    <div className="mt-1 font-medium text-gray-500">
                      {t('map.chargerVisualOffset', 'Visuele offset — maaier-data ongemoeid')}
                    </div>
                  )}
                  <div className="text-gray-400 mt-0.5">{t('map.dragToReposition')}</div>
                </div>
              </Popup>
            </Marker>
          )}
          {/* Path direction preview: blauwe lijnen bij richting selectie */}
          {pathDirectionPreview != null && Number.isFinite(polyCenter.lat) && Number.isFinite(polyCenter.lng) && polyCenter.lat !== 0 && (() => {
            const deg = pathDirectionPreview;
            const rad = (deg * Math.PI) / 180;
            const dLat = Math.cos(rad);
            const dLng = Math.sin(rad);
            const pLat = -dLng;
            const pLng = dLat;

            const workPolys = polygonMaps
              .filter(m => getAreaStyle(m.mapType, m.mapId, m.mapName) === AREA_STYLES.work)
              .map(m => {
                const calPts = calibratePoints(m.mapArea, activeCal, polyCenter);
                return calPts.map(([lat, lng]) => ({ lat, lng }));
              });
            if (workPolys.length === 0) return null;

            let minPerp = Infinity, maxPerp = -Infinity;
            let minPar = Infinity, maxPar = -Infinity;
            for (const poly of workPolys) {
              for (const p of poly) {
                const dL = p.lat - polyCenter.lat;
                const dN = p.lng - polyCenter.lng;
                const perp = dL * pLat + dN * pLng;
                const par = dL * dLat + dN * dLng;
                if (perp < minPerp) minPerp = perp;
                if (perp > maxPerp) maxPerp = perp;
                if (par < minPar) minPar = par;
                if (par > maxPar) maxPar = par;
              }
            }

            const spacing = 0.000008;
            const margin = spacing * 2;
            const lineExtent = Math.max(Math.abs(maxPar), Math.abs(minPar)) + margin;
            const startPerp = Math.floor((minPerp - margin) / spacing) * spacing;
            const endPerp = maxPerp + margin;

            const allSegments: [number, number][][] = [];
            for (let offset = startPerp; offset <= endPerp; offset += spacing) {
              const cLat = polyCenter.lat + pLat * offset;
              const cLng = polyCenter.lng + pLng * offset;
              const rawLine: [[number, number], [number, number]] = [
                [cLat - dLat * lineExtent, cLng - dLng * lineExtent],
                [cLat + dLat * lineExtent, cLng + dLng * lineExtent],
              ];
              for (const poly of workPolys) {
                const clipped = clipLineToPolygon(rawLine, poly);
                for (const seg of clipped) allSegments.push(seg);
              }
            }

            return allSegments.map((seg, idx) => (
              <Polyline
                key={`dir-${idx}`}
                positions={seg}
                pathOptions={{ color: '#60a5fa', weight: 2, opacity: 0.7 }}
              />
            ));
          })()}
          {/* Pattern overlay (placed pattern preview) */}
          {patternPlacement && <PatternOverlay placement={patternPlacement} />}
          {/* Pattern placement click handler */}
          {onMapClickForPattern && !placingCharger && editMode === 'none' && (
            <PatternClickHandler onClick={onMapClickForPattern} />
          )}
          {/* Navigate-to click handler */}
          {navigateMode && !placingCharger && editMode === 'none' && !wallDrawMode && (
            <NavigateClickHandler onClick={handleNavigateClick} />
          )}
          {/* Navigate-to target marker */}
          {navigateTarget && (
            <Marker position={[navigateTarget.lat, navigateTarget.lng]} icon={targetIcon}>
              <Popup>
                <div className="text-xs">
                  <div className="font-semibold">Navigation target</div>
                  <div>{navigateTarget.lat.toFixed(6)}, {navigateTarget.lng.toFixed(6)}</div>
                </div>
              </Popup>
            </Marker>
          )}
          {/* Virtual wall draw click handler */}
          {wallDrawMode && !placingCharger && editMode === 'none' && (
            <WallDrawClickHandler onPoint={handleWallPoint} />
          )}
          {/* Virtual wall first corner preview */}
          {wallDrawMode && wallFirstCorner && (
            <Marker
              position={[wallFirstCorner.lat, wallFirstCorner.lng]}
              icon={L.divIcon({
                className: '',
                html: '<div style="width:12px;height:12px;background:#ef4444;border:2px solid white;border-radius:2px"></div>',
                iconSize: [12, 12],
                iconAnchor: [6, 6],
              })}
            />
          )}
          {/* Virtual walls rendered as rectangles */}
          {walls.filter(w => w.enabled).map(w => {
            const bounds: [number, number][] = [
              [w.lat1, w.lng1],
              [w.lat1, w.lng2],
              [w.lat2, w.lng2],
              [w.lat2, w.lng1],
            ];
            return (
              <Polygon
                key={w.wall_id}
                positions={bounds}
                pathOptions={{
                  color: '#ef4444',
                  fillColor: '#ef4444',
                  fillOpacity: 0.25,
                  weight: 2,
                  dashArray: '6, 3',
                }}
                eventHandlers={{
                  click: editMode === 'none' ? (e) => {
                    L.DomEvent.stopPropagation(e);
                  } : undefined,
                }}
              >
                <Popup>
                  <div className="text-xs">
                    <div className="font-semibold text-red-600">{w.wall_name || 'No-go zone'}</div>
                    <button
                      onClick={() => handleDeleteWall(w.wall_id)}
                      className="mt-1 text-red-500 hover:text-red-400 underline"
                    >
                      Delete
                    </button>
                  </div>
                </Popup>
              </Polygon>
            );
          })}
          <FitToMaps maps={polygonMaps} onFitted={() => { setMapsFitted(true); setUserInteracted(true); }} />
          <RecenterMap position={position} hasManualInteraction={userInteracted} waitForFit={polygonMaps.length > 0 && !mapsFitted} />
          <UserInteractionTracker onInteract={() => setUserInteracted(true)} />
          {editMode === 'none' && !brushMode && !paintMode && !moveMode && <MapClickDeselect onDeselect={() => setSelectedMapId(null)} />}
          <ResizeHandler />
        </MapContainer>

        {/* Mowing stats — floating card op de kaart tijdens maaien (compact). */}
        {mowingActive && (
          <div className="absolute bottom-3 left-3 z-[1000] w-[calc(100vw-1.5rem)] sm:w-72 pointer-events-none">
            <MowingStatsCard sensors={mowingSensors} compact totalAreaM2={totalWorkAreaM2} />
          </div>
        )}

        {/* Calibration panel — floating on map */}
        {calibrating && (
          <div className="absolute top-3 left-3 z-[1000] bg-gray-900/95 backdrop-blur border border-gray-700 rounded-lg p-3 w-[calc(100vw-1.5rem)] sm:w-64 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">{t('map.calibrationTitle')}</span>
              <button onClick={cancelCalibrating} className="text-gray-500 hover:text-gray-300" title={t('common.cancel')}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Nudge controls */}
            <div className="mb-3">
              <label className="text-[10px] text-gray-500 uppercase tracking-wide">{t('map.position')}</label>
              <div className="flex items-center justify-center gap-1 mt-1">
                <div className="grid grid-cols-3 gap-0.5 w-fit">
                  <div />
                  <button onClick={() => nudge(NUDGE_STEP, 0)} className="bg-gray-700 hover:bg-gray-600 rounded p-1.5 flex items-center justify-center" title={t('map.moveNorth')}>
                    <ChevronUp className="w-3.5 h-3.5 text-gray-300" />
                  </button>
                  <div />
                  <button onClick={() => nudge(0, -NUDGE_STEP)} className="bg-gray-700 hover:bg-gray-600 rounded p-1.5 flex items-center justify-center" title={t('map.moveWest')}>
                    <ChevronLeft className="w-3.5 h-3.5 text-gray-300" />
                  </button>
                  <div className="bg-gray-800 rounded p-1.5 flex items-center justify-center">
                    <span className="text-[9px] text-gray-500 font-mono">0.5m</span>
                  </div>
                  <button onClick={() => nudge(0, NUDGE_STEP)} className="bg-gray-700 hover:bg-gray-600 rounded p-1.5 flex items-center justify-center" title={t('map.moveEast')}>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                  </button>
                  <div />
                  <button onClick={() => nudge(-NUDGE_STEP, 0)} className="bg-gray-700 hover:bg-gray-600 rounded p-1.5 flex items-center justify-center" title={t('map.moveSouth')}>
                    <ChevronDown className="w-3.5 h-3.5 text-gray-300" />
                  </button>
                  <div />
                </div>
              </div>
            </div>

            {/* Rotation */}
            <div className="mb-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-gray-500 uppercase tracking-wide">{t('map.rotation')}</label>
                <span className="text-[10px] text-gray-400 font-mono">{editCal!.rotation.toFixed(1)}&deg;</span>
              </div>
              <input
                type="range"
                min={-180}
                max={180}
                step={0.5}
                value={editCal!.rotation}
                onChange={e => setEditCal(prev => prev ? { ...prev, rotation: parseFloat(e.target.value) } : prev)}
                className="w-full h-1.5 mt-1 accent-amber-500 bg-gray-700 rounded-full appearance-none cursor-pointer"
              />
            </div>

            {/* Scale */}
            <div className="mb-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-gray-500 uppercase tracking-wide">{t('map.scale')}</label>
                <span className="text-[10px] text-gray-400 font-mono">{editCal!.scale.toFixed(3)}x</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.01}
                value={editCal!.scale}
                onChange={e => setEditCal(prev => prev ? { ...prev, scale: parseFloat(e.target.value) } : prev)}
                className="w-full h-1.5 mt-1 accent-amber-500 bg-gray-700 rounded-full appearance-none cursor-pointer"
              />
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-700">
              <button
                onClick={resetCalibrating}
                className="flex-1 inline-flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
                title={t('map.resetToDefault')}
              >
                <RotateCcw className="w-3 h-3" />
                {t('common.reset')}
              </button>
              <button
                onClick={handleSaveCalibration}
                className="flex-1 inline-flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded bg-amber-600 text-white hover:bg-amber-500 transition-colors"
              >
                <Save className="w-3 h-3" />
                {t('common.save')}
              </button>
            </div>
          </div>
        )}

        {/* Mowing progress overlay — alleen tonen tijdens actief maaien */}
        {mowing && mowing.workStatus === '1' && (() => {
          const progress = parseInt(mowing.mowingProgress ?? '0', 10);
          if (progress <= 0) return null;
          const covering = parseFloat(mowing.coveringArea ?? '0');
          const finished = parseFloat(mowing.finishedArea ?? '0');
          const speed = parseFloat(mowing.mowSpeed ?? '0');
          const direction = mowing.covDirection ? parseFloat(mowing.covDirection) : null;
          return (
            <div className="absolute top-3 right-3 z-[1000] bg-gray-900/95 backdrop-blur border border-gray-700 rounded-lg p-3 shadow-xl w-[calc(100vw-1.5rem)] sm:w-52">
              <div className="flex items-center gap-2 mb-2">
                <Scissors className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">{t('map.mowing')}</span>
                {direction !== null && !isNaN(direction) && (
                  <span className="inline-flex items-center gap-0.5 text-gray-400" title={t('map.direction', { deg: direction.toFixed(0) })}>
                    <Navigation className="w-3.5 h-3.5 text-emerald-300 transition-transform duration-300" style={{ transform: `rotate(${direction}deg)` }} />
                    <span className="text-[10px] font-mono">{direction.toFixed(0)}&deg;</span>
                  </span>
                )}
                <span className="ml-auto text-sm font-bold text-white">{progress}%</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                {covering > 0 && (
                  <>
                    <span className="text-gray-500">{t('map.area')}</span>
                    <span className="text-gray-300 text-right">{covering.toFixed(0)} m&sup2;</span>
                  </>
                )}
                {finished > 0 && (
                  <>
                    <span className="text-gray-500">{t('map.mowed')}</span>
                    <span className="text-gray-300 text-right">{finished.toFixed(0)} m&sup2;</span>
                  </>
                )}
                {speed > 0 && (
                  <>
                    <span className="text-gray-500">{t('map.speed')}</span>
                    <span className="text-gray-300 text-right">{speed.toFixed(1)} m/s</span>
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {/* Mowing complete celebration */}
        {showCelebration && (
          <CelebrationOverlay area={celebrationArea.current} onDismiss={() => setShowCelebration(false)} />
        )}

        {/* Wall drawing hint */}
        {wallDrawMode && (
          <div className="absolute top-3 left-3 z-[1000] bg-gray-900/95 backdrop-blur border border-red-700/50 rounded-lg p-3 shadow-xl w-[calc(100vw-1.5rem)] sm:w-56">
            <div className="flex items-center gap-2 mb-2">
              <Fence className="w-4 h-4 text-red-400" />
              <span className="text-xs font-semibold text-red-400 uppercase tracking-wide">No-go zone</span>
            </div>
            <p className="text-[11px] text-gray-400 mb-2">
              {!wallFirstCorner
                ? 'Click first corner of the no-go rectangle'
                : 'Click opposite corner to complete'}
            </p>
            <button
              onClick={() => { setWallDrawMode(false); setWallFirstCorner(null); }}
              className="w-full text-xs py-1.5 rounded bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors flex items-center justify-center gap-1"
            >
              <X className="w-3 h-3" />
              {t('common.cancel')}
            </button>
          </div>
        )}

        {/* Edit/Draw control panel */}
        {editMode !== 'none' && (
          <div className="absolute top-3 left-3 z-[1000] bg-gray-900/95 backdrop-blur border border-gray-700 rounded-lg p-3 shadow-xl w-[calc(100vw-1.5rem)] sm:w-64">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: editorColor }}>
                {editMode === 'edit' ? t('map.editMap') : t('map.drawNewMap')}
              </span>
              <button onClick={cancelEditPolygon} className="text-gray-500 hover:text-gray-300" title={t('common.cancel')}>
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Area type selector (only in draw mode) */}
            {editMode === 'draw' && (
              <div className="flex gap-1.5 mb-3">
                {(Object.keys(AREA_TYPE_META) as AreaType[]).map(type => {
                  const meta = AREA_TYPE_META[type];
                  const active = drawType === type;
                  return (
                    <button
                      key={type}
                      onClick={() => setDrawType(type)}
                      className={`flex-1 text-[11px] py-1.5 rounded border transition-colors ${
                        active
                          ? 'border-current font-medium'
                          : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500'
                      }`}
                      style={active ? { color: meta.color, borderColor: meta.color, backgroundColor: meta.color + '20' } : undefined}
                    >
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            )}
            {/* Name input (draw mode only) */}
            {editMode === 'draw' && (
              <input
                type="text"
                value={drawName}
                onChange={e => setDrawName(e.target.value)}
                placeholder={t('map.mapNamePlaceholder')}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-emerald-600 transition-colors mb-3"
              />
            )}
            <p className="text-[11px] text-gray-400 mb-3">
              {editMode === 'draw'
                ? t('map.drawHelp')
                : t('map.editHelp')}
            </p>
            <div className="flex items-center gap-2 text-[11px] text-gray-500 mb-3">
              <span>{t('map.points', { count: editVertices.length })}</span>
              {editMode === 'draw' && editVertices.length < 3 && (
                <span className="text-amber-400">{t('map.needMore', { count: 3 - editVertices.length })}</span>
              )}
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-gray-700">
              <button
                onClick={cancelEditPolygon}
                className="flex-1 inline-flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
              >
                <X className="w-3 h-3" />
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSavePolygon}
                disabled={editVertices.length < 3}
                className="flex-1 inline-flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded transition-colors text-white disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundColor: editorColor }}
              >
                <Save className="w-3 h-3" />
                {t('common.save')}
              </button>
            </div>
          </div>
        )}

        {/* Selected map info panel */}
        {selectedMapId && !calibrating && editMode === 'none' && !brushMode && !paintMode && !moveMode && (() => {
          const m = polygonMaps.find(p => p.mapId === selectedMapId);
          if (!m) return null;
          const style = getAreaStyle(m.mapType, m.mapId, m.mapName);
          return (
            <div className="absolute bottom-3 left-3 z-[1000] bg-gray-900/95 backdrop-blur border border-gray-700 rounded-lg p-3 shadow-xl max-w-72">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: style.color }} />
                {editingName !== null ? (
                  <form
                    className="flex items-center gap-1 flex-1 min-w-0"
                    onSubmit={e => { e.preventDefault(); handleRenameMap(m.mapId, editingName); }}
                  >
                    <input
                      autoFocus
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Escape') setEditingName(null); }}
                      className="flex-1 min-w-0 text-sm bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-gray-200 focus:outline-none focus:border-blue-500"
                    />
                    <button type="submit" className="text-green-400 hover:text-green-300 flex-shrink-0" title={t('map.saveRename')}>
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => setEditingName(null)} className="text-gray-500 hover:text-gray-300 flex-shrink-0" title={t('map.cancelRename')}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="text-sm font-medium text-gray-200 truncate">
                      {m.mapName || m.mapId}
                    </span>
                    <button
                      onClick={() => setEditingName(m.mapName ?? '')}
                      className="text-gray-500 hover:text-gray-300 flex-shrink-0"
                      title={t('map.rename')}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => { setSelectedMapId(null); setEditingName(null); }}
                  className="ml-auto text-gray-500 hover:text-gray-300 flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-gray-400">
                <span>{t('map.points', { count: m.mapArea.length })}</span>
                {(() => {
                  const area = polygonAreaM2(m.mapArea);
                  return area > 0 ? <span>{area.toFixed(0)} m&sup2;</span> : null;
                })()}
                {m.mapType === 'unicom' && (() => {
                  const len = polylineLengthM(m.mapArea);
                  return len > 0 ? <span>{len.toFixed(1)} m</span> : null;
                })()}
                {m.createdAt && (
                  <span>{new Date(m.createdAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                )}
              </div>
              {/* Coverage stats for work areas */}
              {coverageStats.has(m.mapId) && (() => {
                const stats = coverageStats.get(m.mapId)!;
                // Rough coverage: each trail point covers ~0.25m² (0.5m mow width × 0.5m spacing)
                const coveredM2 = stats.points * 0.25;
                const pct = stats.area > 0 ? Math.min(100, (coveredM2 / stats.area) * 100) : 0;
                return (
                  <div className="mt-1.5">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-gray-500">{t('map.coverage')}</span>
                      <span className="text-emerald-400 font-mono">{pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500">
                      <span>{t('map.trailPts', { count: stats.points })}</span>
                      <span>{t('map.mowedArea', { area: coveredM2.toFixed(0) })}</span>
                    </div>
                  </div>
                );
              })()}
              <div className="mt-2 pt-2 border-t border-gray-700">
                {/* PRIMARY tool: Paint brush — work + obstacle only */}
                {(m.mapType === 'work' || m.mapType === 'obstacle') && m.canonicalName && (
                  <button
                    onClick={(e) => { e.stopPropagation(); enterPaintMode(); }}
                    className="w-full mb-2 inline-flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded bg-amber-500 text-gray-900 hover:bg-amber-400 transition-colors shadow"
                    title={t('map.edit.paintHint')}
                  >
                    <Paintbrush className="w-4 h-4" />
                    {t('map.edit.paintTool')}
                  </button>
                )}
                {/* Secondary tools */}
                <div className="flex items-center flex-wrap gap-2">
                  {/* Push/pull brush (R3) — work + obstacle only */}
                  {(m.mapType === 'work' || m.mapType === 'obstacle') && m.canonicalName && (
                    <button
                      onClick={(e) => { e.stopPropagation(); enterBrushMode(); }}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-violet-900/40 text-violet-300 hover:bg-violet-900/70 hover:text-violet-200 transition-colors"
                      title={t('map.edit.brushOn')}
                    >
                      <Brush className="w-3 h-3" />
                      {t('map.edit.brush')}
                    </button>
                  )}
                  {/* Move/translate the whole shape — work + obstacle (with a
                      canonical, since the draft flow keys on it). Primary use is
                      repositioning a pasted obstacle, but allowed for work too. */}
                  {(m.mapType === 'work' || m.mapType === 'obstacle') && m.canonicalName && (
                    <button
                      onClick={(e) => { e.stopPropagation(); enterMoveMode(m.canonicalName!); }}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-cyan-900/40 text-cyan-300 hover:bg-cyan-900/70 hover:text-cyan-200 transition-colors"
                      title={t('map.edit.moveHint')}
                    >
                      <MoveIcon className="w-3 h-3" />
                      {t('map.edit.move')}
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); startEditMap(m.mapId, m.mapArea); }}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-emerald-900/40 text-emerald-400 hover:bg-emerald-900/70 hover:text-emerald-300 transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                    {t('common.edit')}
                  </button>
                  {/* Obstacle expand / shrink (R3, Part A) */}
                  {m.mapType === 'obstacle' && m.canonicalName && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); offsetSelectedObstacle(1); }}
                        disabled={applying}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-sky-900/40 text-sky-300 hover:bg-sky-900/70 hover:text-sky-200 transition-colors disabled:opacity-50"
                        title={t('map.edit.expand')}
                      >
                        <Plus className="w-3 h-3" />
                        {t('map.edit.expand')}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); offsetSelectedObstacle(-1); }}
                        disabled={applying}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-sky-900/40 text-sky-300 hover:bg-sky-900/70 hover:text-sky-200 transition-colors disabled:opacity-50"
                        title={t('map.edit.shrink')}
                      >
                        <Minus className="w-3 h-3" />
                        {t('map.edit.shrink')}
                      </button>
                      {/* Copy obstacle to clipboard (R6) — persists for paste onto
                          this or another work map, even after switching mowers. */}
                      <button
                        onClick={(e) => { e.stopPropagation(); copySelectedObstacle(); }}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-indigo-900/40 text-indigo-300 hover:bg-indigo-900/70 hover:text-indigo-200 transition-colors"
                        title={t('map.edit.copy')}
                      >
                        <Copy className="w-3 h-3" />
                        {t('map.edit.copy')}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      setConfirmDeleteMapId(m.mapId);
                      setConfirmDeleteMapName(m.mapName || m.mapId);
                    }}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-900/40 text-red-400 hover:bg-red-900/70 hover:text-red-300 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Obstacle paste button (R6) — reachable even with nothing selected,
            since paste targets a WORK map (not the selected obstacle). Disabled
            when there is no work map to attach to. Hidden during edit/draw/brush/
            paint/calibrate to avoid clutter. The clipboard persists across mower
            switches (localStorage), so this stays available after switching. */}
        {obstacleClipboard && !calibrating && editMode === 'none' && !brushMode && !paintMode && !moveMode && (() => {
          const hasWork = maps.some(m => m.mapType === 'work' && m.canonicalName);
          return (
            <div className="absolute bottom-3 right-3 z-[1000]">
              <button
                onClick={(e) => { e.stopPropagation(); pasteObstacle(); }}
                disabled={applying || !hasWork}
                className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shadow disabled:opacity-50 disabled:cursor-not-allowed"
                title={hasWork ? t('map.edit.paste') : t('map.edit.pasteNoWork')}
              >
                <ClipboardPaste className="w-4 h-4" />
                {t('map.edit.paste')}
              </button>
            </div>
          );
        })()}

        {/* Push/pull brush control panel (R3) */}
        {brushMode && !calibrating && (
          <div className="absolute bottom-3 left-3 z-[1000] bg-gray-900/95 backdrop-blur border border-violet-700/60 rounded-lg p-3 shadow-xl w-64">
            <div className="flex items-center gap-2 mb-2">
              <Brush className="w-4 h-4 text-violet-300" />
              <span className="text-sm font-medium text-violet-200">{t('map.edit.brushOn')}</span>
              <button
                onClick={exitBrushMode}
                className="ml-auto text-gray-500 hover:text-gray-300 flex-shrink-0"
                title={t('common.cancel')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-gray-400">
              <span className="whitespace-nowrap">{t('map.edit.radius')}</span>
              <input
                type="range"
                min={0.3}
                max={2.0}
                step={0.1}
                value={brushRadius}
                onChange={e => setBrushRadius(parseFloat(e.target.value))}
                className="flex-1 accent-violet-500"
              />
              <span className="font-mono text-violet-300 w-10 text-right">{brushRadius.toFixed(1)}m</span>
            </div>
          </div>
        )}

        {/* Paint/erase brush control panel (primary tool) */}
        {paintMode && !calibrating && (
          <div className="absolute bottom-3 left-3 z-[1000] bg-gray-900/95 backdrop-blur border border-amber-600/60 rounded-lg p-3 shadow-xl w-72">
            <div className="flex items-center gap-2 mb-2">
              <Paintbrush className="w-4 h-4 text-amber-300" />
              <span className="text-sm font-medium text-amber-200">{t('map.edit.paintTool')}</span>
              <button
                onClick={exitPaintMode}
                className="ml-auto text-gray-500 hover:text-gray-300 flex-shrink-0"
                title={t('common.done')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* Paint / Erase toggle */}
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              <button
                onClick={() => setPaintTool('paint')}
                className={`inline-flex items-center justify-center gap-1.5 text-xs font-medium px-2 py-1.5 rounded transition-colors ${
                  paintTool === 'paint'
                    ? 'bg-emerald-500 text-gray-900'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                <Paintbrush className="w-3.5 h-3.5" />
                {t('map.edit.paint')}
              </button>
              <button
                onClick={() => setPaintTool('erase')}
                className={`inline-flex items-center justify-center gap-1.5 text-xs font-medium px-2 py-1.5 rounded transition-colors ${
                  paintTool === 'erase'
                    ? 'bg-amber-500 text-gray-900'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                <Eraser className="w-3.5 h-3.5" />
                {t('map.edit.erase')}
              </button>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-gray-400">
              <span className="whitespace-nowrap">{t('map.edit.paintRadius')}</span>
              <input
                type="range"
                min={0.15}
                max={1.2}
                step={0.05}
                value={paintRadius}
                onChange={e => setPaintRadius(parseFloat(e.target.value))}
                className="flex-1 accent-amber-500"
              />
              <span className="font-mono text-amber-300 w-10 text-right">{paintRadius.toFixed(2)}m</span>
            </div>
            <p className="mt-2 text-[10px] text-gray-500 leading-snug">{t('map.edit.paintHint')}</p>
          </div>
        )}

        {/* Move/translate control panel */}
        {moveMode && !calibrating && (
          <div className="absolute bottom-3 left-3 z-[1000] bg-gray-900/95 backdrop-blur border border-cyan-600/60 rounded-lg p-3 shadow-xl w-64">
            <div className="flex items-center gap-2 mb-1.5">
              <MoveIcon className="w-4 h-4 text-cyan-300" />
              <span className="text-sm font-medium text-cyan-200">{t('map.edit.move')}</span>
              <button
                onClick={exitMoveMode}
                className="ml-auto text-gray-500 hover:text-gray-300 flex-shrink-0"
                title={t('common.done')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-gray-400 leading-snug">{t('map.edit.moveHint')}</p>
          </div>
        )}

        {/* Geen floating hint-paneel meer — alleen de toolbar-toggle + refresh-icon
            bovenin (met live-stip + spinner) is genoeg. coverageStatus wordt nog
            in de logica gezet maar bewust niet als paneel getoond. */}

        {/* Draft → apply-to-mower bar (R2) */}
        {showEditBar && (
          <MapEditBar
            pendingCount={pendingDraftCount}
            pendingSync={editGeometry!.pendingSync}
            hasVersions={editGeometry!.hasVersions}
            status={editStatus}
            statusKind={editStatusKind}
            busy={applying || historyBusy}
            onApply={handleApplyEdits}
            onRevert={handleRevertEdits}
            onDiscard={handleDiscardEdits}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
          />
        )}
      </div>

      {/* Confirm map delete dialog */}
      <ConfirmDialog
        open={!!confirmDeleteMapId}
        title={t('map.confirmDelete', { name: confirmDeleteMapName })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          if (confirmDeleteMapId) handleDeleteMap(confirmDeleteMapId);
          setConfirmDeleteMapId(null);
        }}
        onCancel={() => setConfirmDeleteMapId(null)}
      />
      <ConfirmDialog
        open={confirmCalibrate}
        title={t('map.calibrateConfirm')}
        confirmLabel={t('map.calibrateCharger')}
        cancelLabel={t('common.cancel')}
        onConfirm={async () => {
          setConfirmCalibrate(false);
          try {
            await calibrateCharger(sn);
            toast(t('map.calibrateStarted'), 'success');
          } catch {
            toast(t('map.calibrateCharger') + ' ✗', 'error');
          }
        }}
        onCancel={() => setConfirmCalibrate(false)}
      />

      {/* Charger placement is now a single unified action (menu click OR marker
          drag → handlePlaceCharger), which stores a VISUAL offset only and never
          pushes to the mower. The old relocate-vs-correct dialog (which could
          recalc + push maps to the mower) has been removed. */}
    </div>
  );
}
