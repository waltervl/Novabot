import { useCallback, useMemo } from 'react';
import { Marker, Polygon } from 'react-leaflet';
import L from 'leaflet';

// ── Custom marker icons ─────────────────────────────────────────

function makeVertexIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="width:12px;height:12px;background:${color};border:2px solid white;border-radius:50%;cursor:grab;box-shadow:0 1px 4px rgba(0,0,0,.4)" />`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

const midpointIcon = L.divIcon({
  className: '',
  html: '<div style="width:8px;height:8px;background:#6b7280;border:1px solid white;border-radius:50%;cursor:pointer;opacity:.6" />',
  iconSize: [8, 8],
  iconAnchor: [4, 4],
});

// ── Component ───────────────────────────────────────────────────

interface Props {
  vertices: [number, number][];
  onChange: (v: [number, number][]) => void;
  color?: string;
  /**
   * Max number of draggable handles. Dense mower-recorded rings (hundreds of
   * points) keep ALL their points — we just render evenly-spaced handles and
   * warp the dense ring around the dragged handle (cosine falloff), so the
   * contour detail is never discarded. Small rings (draw mode) show a handle
   * per vertex with classic add/remove.
   */
  maxHandles?: number;
}

export function PolygonEditor({ vertices, onChange, color = '#10b981', maxHandles = 48 }: Props) {
  const vertexIcon = useMemo(() => makeVertexIcon(color), [color]);
  const n = vertices.length;
  const dense = n > maxHandles;

  // Handle indices into the FULL ring. Dense → evenly spaced subset; else all.
  const handleIdx = useMemo(() => {
    if (!dense) return vertices.map((_, i) => i);
    const set = new Set<number>();
    for (let k = 0; k < maxHandles; k++) set.add(Math.round((k * n) / maxHandles) % n);
    return Array.from(set).sort((a, b) => a - b);
  }, [vertices, dense, maxHandles, n]);

  // Falloff window (in points) ≈ the spacing between handles, so a drag blends
  // smoothly into the surrounding dense points instead of leaving a 1-px spike.
  const win = dense ? Math.max(1, Math.round(n / handleIdx.length)) : 0;

  // Drag a handle. Dense: warp ±win neighbours with a cosine weight (centre = 1).
  // Sparse: move just that vertex.
  const handleVertexDrag = useCallback((index: number, e: L.DragEndEvent) => {
    const pos = e.target.getLatLng();
    const orig = vertices[index];
    const dLat = pos.lat - orig[0];
    const dLng = pos.lng - orig[1];
    const next = vertices.map(v => [v[0], v[1]] as [number, number]);
    if (!dense || win <= 0) {
      next[index] = [pos.lat, pos.lng];
    } else {
      for (let off = -win; off <= win; off++) {
        const j = (((index + off) % n) + n) % n;
        const w = 0.5 * (1 + Math.cos((Math.PI * Math.abs(off)) / (win + 1)));
        next[j] = [next[j][0] + dLat * w, next[j][1] + dLng * w];
      }
    }
    onChange(next);
  }, [vertices, onChange, dense, win, n]);

  // Remove a vertex (right-click), minimum 3. Sparse rings only — removing one
  // of a thousand dense points is meaningless and would risk slicing the ring.
  const handleVertexRemove = useCallback((index: number) => {
    if (dense || vertices.length <= 3) return;
    const next = vertices.filter((_, i) => i !== index);
    onChange(next);
  }, [vertices, onChange, dense]);

  // Insert a new vertex between index and index+1 (sparse rings only).
  const handleMidpointClick = useCallback((index: number) => {
    const a = vertices[index];
    const b = vertices[(index + 1) % vertices.length];
    const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const next = [...vertices];
    next.splice(index + 1, 0, mid);
    onChange(next);
  }, [vertices, onChange]);

  // Midpoints between consecutive vertices (sparse rings only).
  const midpoints = useMemo(() => {
    if (dense || vertices.length < 2) return [];
    return vertices.map((v, i) => {
      const next = vertices[(i + 1) % vertices.length];
      return {
        index: i,
        pos: [(v[0] + next[0]) / 2, (v[1] + next[1]) / 2] as [number, number],
      };
    });
  }, [vertices, dense]);

  if (vertices.length < 2) return null;

  return (
    <>
      {/* Live polygon outline — always the FULL ring, so the contour is exact. */}
      <Polygon
        positions={vertices}
        pathOptions={{
          color,
          fillColor: color + '40',
          fillOpacity: 0.3,
          weight: 2,
          dashArray: '6, 4',
        }}
      />

      {/* Draggable handles (subset over the full ring when dense) */}
      {handleIdx.map((i) => (
        <Marker
          key={`v-${i}`}
          position={vertices[i]}
          icon={vertexIcon}
          draggable
          eventHandlers={{
            dragend: (e) => handleVertexDrag(i, e),
            contextmenu: (e) => {
              if (e.originalEvent) {
                e.originalEvent.preventDefault();
                e.originalEvent.stopPropagation();
              }
              handleVertexRemove(i);
            },
          }}
        />
      ))}

      {/* Midpoint markers (click to insert) — sparse rings only */}
      {midpoints.map(({ index, pos }) => (
        <Marker
          key={`m-${index}`}
          position={pos}
          icon={midpointIcon}
          eventHandlers={{
            click: (e) => {
              L.DomEvent.stopPropagation(e);
              handleMidpointClick(index);
            },
          }}
        />
      ))}
    </>
  );
}
