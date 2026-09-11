// Asset-class breakdown as a segmented ring. One arc per leaf class that has a
// balance, in ASSET_CLASS_ORDER so a class keeps its colour as others come and
// go. Segments are separated by a small surface-coloured gap, and callers pair
// this with a legend naming every class, so identity is never colour-alone.
//
// Shared by the Net Worth page and the Home Assets card — one implementation so
// the two can never drift in colour, ordering or geometry. `size` lets the Home
// card render a smaller ring inside its narrow 200px column.
export default function AssetClassDonut({ segments, centreLabel, centreValue, size = 132 }) {
  const sw = Math.max(9, Math.round(size * 0.114))
  const r = (size - sw) / 2
  const c = size / 2
  const circ = 2 * Math.PI * r
  const GAP = 2 // px of surface between adjacent arcs

  const arcs = segments.map((seg, i) => {
    const before = segments.slice(0, i).reduce((sum, s) => sum + s.pct, 0)
    return {
      ...seg,
      len: Math.max(0, (seg.pct / 100) * circ - GAP),
      offset: (before / 100) * circ,
    }
  })

  // Centre text scales with the ring so the total stays inside the hole.
  const valueSize = Math.max(10, Math.round(size * 0.114))
  const labelSize = Math.max(7, Math.round(size * 0.068))

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" role="img"
      aria-label={segments.map(s => `${s.label} ${s.pct.toFixed(1)}%`).join(', ')}>
      <g transform={`rotate(-90 ${c} ${c})`}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#1f2937" strokeWidth={sw} />
        {arcs.map(a => (
          <circle
            key={a.key} cx={c} cy={c} r={r} fill="none"
            stroke={a.color} strokeWidth={sw}
            strokeDasharray={`${a.len} ${circ - a.len}`}
            strokeDashoffset={-a.offset}
          >
            <title>{`${a.label}: ${a.pct.toFixed(1)}%`}</title>
          </circle>
        ))}
      </g>
      {centreValue && (
        <text x={c} y={c - valueSize * 0.25} textAnchor="middle" className="fill-white"
          style={{ fontSize: valueSize, fontWeight: 700 }}>
          {centreValue}
        </text>
      )}
      {centreLabel && (
        <text x={c} y={c + labelSize * 1.35} textAnchor="middle" className="fill-gray-500"
          style={{ fontSize: labelSize, letterSpacing: '0.08em' }}>
          {centreLabel}
        </text>
      )}
    </svg>
  )
}
