import { useId } from 'react';

// Builds a smooth curve through a series of points using quadratic Bezier
// segments (each segment's control point is the real data point, ending at
// the midpoint to the next one) — a lightweight way to turn a jagged
// point-to-point line into a smooth, continuous one without pulling in a
// charting library.
export function smoothPath(points) {
  let d = `M ${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    d += ` Q ${x0},${y0} ${mx},${my}`;
  }
  const [lx, ly] = points[points.length - 1];
  d += ` L ${lx},${ly}`;
  return d;
}

// Minimal glowing-area sparkline, pure SVG — no charting library. Used on
// the Command Centre stat cards to show each metric's real 7-day trend.
export default function Sparkline({ data, color = '#3b82f6', width = 140, height = 32 }) {
  const gradientId = useId();
  if (!data || data.length < 2) return <svg width="100%" height={height} style={{ display: 'block', minWidth: 0 }} />;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data.map((v, i) => [i * stepX, height - ((v - min) / range) * (height - 4) - 2]);
  const linePath = smoothPath(points);
  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block', minWidth: 0 }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
