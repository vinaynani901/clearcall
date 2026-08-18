// Hand-rolled SVG donut — avoids pulling in a charting library for one
// simple 4-segment ring. `segments` is [{ label, value, color }]; renders
// clockwise starting at 12 o'clock, with the total shown in the centre.
export default function DonutChart({ segments, size = 160, strokeWidth = 22, centerLabel, centerSubLabel }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  let offset = 0;
  const arcs = segments.map((s) => {
    const fraction = total > 0 ? s.value / total : 0;
    const dash = fraction * circumference;
    const arc = { ...s, dash, offset };
    offset += dash;
    return arc;
  });

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--grey-200)" strokeWidth={strokeWidth} />
        {total > 0 && arcs.map((a, i) => (
          a.value > 0 && (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={a.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${a.dash} ${circumference - a.dash}`}
              strokeDashoffset={-a.offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              strokeLinecap="butt"
            />
          )
        ))}
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center',
      }}>
        <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{centerLabel}</div>
        {centerSubLabel && <div className="muted xs" style={{ marginTop: 4 }}>{centerSubLabel}</div>}
      </div>
    </div>
  );
}
