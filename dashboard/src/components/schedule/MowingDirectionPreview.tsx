// MowingDirectionPreview — small SVG lawn with mowing stripes that rotate with
// the selected direction. Web port of the OpenNova app component
// (app/src/components/MowingDirectionPreview.tsx) so the dashboard schedule form
// shows the exact same visual the app does.
import { useMemo } from 'react';

interface Props {
  /** Degrees: 0 = N/S stripes, rotates clockwise. */
  direction: number;
  size?: number;
}

export function MowingDirectionPreview({ direction, size = 96 }: Props) {
  const padding = 10;
  const lawnSize = size - padding * 2;

  // Slightly irregular 8-point lawn so it reads as grass, not a circle.
  const lawnPoints = useMemo(() => {
    const cx = size / 2;
    const cy = size / 2;
    const r = lawnSize / 2 - 2;
    const pts = [
      { x: cx - r * 0.85, y: cy - r * 0.7 },
      { x: cx - r * 0.3, y: cy - r * 0.95 },
      { x: cx + r * 0.4, y: cy - r * 0.85 },
      { x: cx + r * 0.9, y: cy - r * 0.4 },
      { x: cx + r * 0.85, y: cy + r * 0.3 },
      { x: cx + r * 0.5, y: cy + r * 0.9 },
      { x: cx - r * 0.2, y: cy + r * 0.85 },
      { x: cx - r * 0.9, y: cy + r * 0.35 },
    ];
    return pts.map(p => `${p.x},${p.y}`).join(' ');
  }, [size, lawnSize]);

  // Stripes run ALONG the direction; spacing is perpendicular.
  const stripes = useMemo(() => {
    const cx = size / 2;
    const cy = size / 2;
    const diagonal = size * 1.5;
    const spacing = 6;
    const count = Math.ceil(diagonal / spacing);

    const rad = (direction * Math.PI) / 180;
    const perpRad = ((direction + 90) * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const px = Math.cos(perpRad);
    const py = Math.sin(perpRad);

    const lines: Array<{ x1: number; y1: number; x2: number; y2: number; alt: boolean }> = [];
    for (let i = -count; i <= count; i++) {
      const ox = cx + px * i * spacing;
      const oy = cy + py * i * spacing;
      lines.push({
        x1: ox - dx * diagonal,
        y1: oy - dy * diagonal,
        x2: ox + dx * diagonal,
        y2: oy + dy * diagonal,
        alt: i % 2 === 0,
      });
    }
    return lines;
  }, [direction, size]);

  // Amber heading arrow.
  const arrowRad = ((direction - 90) * Math.PI) / 180;
  const arrowLen = 12;
  const acx = size / 2;
  const acy = size / 2;
  const ax = acx + Math.cos(arrowRad) * arrowLen;
  const ay = acy + Math.sin(arrowRad) * arrowLen;
  const clipId = `lawnClip-${size}`;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <defs>
        <clipPath id={clipId}>
          <polygon points={lawnPoints} />
        </clipPath>
      </defs>

      {/* Lawn fill */}
      <polygon points={lawnPoints} fill="#065f46" stroke="#059669" strokeWidth={1.5} strokeLinejoin="round" />

      {/* Stripes, clipped to the lawn */}
      <g clipPath={`url(#${clipId})`}>
        {stripes.map((l, i) => (
          <line
            key={i}
            x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke={l.alt ? 'rgba(52,211,153,0.35)' : 'rgba(16,185,129,0.2)'}
            strokeWidth={5}
          />
        ))}
      </g>

      {/* Outline on top */}
      <polygon points={lawnPoints} fill="none" stroke="#34d399" strokeWidth={1.5} strokeLinejoin="round" opacity={0.5} />

      {/* Heading arrow */}
      <line x1={acx} y1={acy} x2={ax} y2={ay} stroke="#fbbf24" strokeWidth={2} strokeLinecap="round" />
      <circle cx={ax} cy={ay} r={3} fill="#fbbf24" />
      <circle cx={acx} cy={acy} r={2} fill="#fbbf24" opacity={0.5} />
    </svg>
  );
}
