// ── Shared Health UI primitives ─────────────────────────────────────────────
// Small building blocks used across the Health sub-pages so cards, labels,
// toggles and sparklines stay consistent. Colours come from the design handoff
// palette (see C in healthHelpers). Charts use Recharts to match the rest of
// the app (weight tracker, Finance analytics).
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { C } from '../utils/healthHelpers'

// Primary card surface (#111726 fill, #1e2635 border, 12px radius).
export function HCard({ children, className = '', style, onClick, hoverable = false }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border ${hoverable ? 'transition-colors' : ''} ${className}`}
      style={{
        background: C.card,
        borderColor: C.border,
        ...(onClick ? { cursor: 'pointer' } : null),
        ...style,
      }}
      onMouseEnter={hoverable ? e => { e.currentTarget.style.borderColor = C.emerald } : undefined}
      onMouseLeave={hoverable ? e => { e.currentTarget.style.borderColor = C.border } : undefined}
    >
      {children}
    </div>
  )
}

// Uppercase eyebrow / section label (~10.5–11px, 0.06em tracking, weight 600).
export function Eyebrow({ children, className = '', style }) {
  return (
    <div
      className={`uppercase font-semibold ${className}`}
      style={{ fontSize: 10.5, letterSpacing: '0.06em', color: C.label, ...style }}
    >
      {children}
    </div>
  )
}

export function CardTitle({ children, className = '' }) {
  return (
    <div className={`font-semibold ${className}`} style={{ fontSize: 13.5, color: C.text }}>
      {children}
    </div>
  )
}

export function CardSub({ children, className = '' }) {
  return (
    <div className={className} style={{ fontSize: 11.5, color: C.label }}>{children}</div>
  )
}

// Segmented pill toggle (7D / 30D, macro views, etc.).
export function PillToggle({ options, value, onChange, size = 'md' }) {
  const pad = size === 'sm' ? 'px-3 py-[5px]' : 'px-3.5 py-1.5'
  const fs = size === 'sm' ? 11 : 12
  return (
    <div
      className="inline-flex rounded-lg overflow-hidden"
      style={{ background: C.cardNested, border: `1px solid ${C.border}` }}
    >
      {options.map(opt => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`${pad} font-semibold transition-colors`}
            style={{
              fontSize: fs,
              color: active ? C.emerald : C.text3,
              background: active ? 'rgba(16,185,129,0.10)' : 'transparent',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// Solid emerald / outline buttons matching the handoff actions.
export function EmeraldButton({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg font-semibold transition-colors disabled:opacity-50"
      style={{ background: C.emerald, color: '#06120c', fontSize: 13, padding: '8px 16px' }}
    >
      {children}
    </button>
  )
}

export function OutlineButton({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg transition-colors disabled:opacity-50"
      style={{ border: `1px solid ${C.border}`, color: C.text2, fontSize: 13, padding: '8px 16px' }}
    >
      {children}
    </button>
  )
}

// Muted "no data yet" placeholder for tiles/cards before data has synced.
export function NoData({ label = 'No data yet', height }) {
  return (
    <div
      className="flex items-center justify-center text-center"
      style={{ color: C.faint, fontSize: 12, minHeight: height }}
    >
      {label}
    </div>
  )
}

// Small nested stat tile (#0c1019 fill) — used in stat rows.
export function StatTile({ label, value, valueColor }) {
  return (
    <div className="rounded-[10px]" style={{ background: C.cardNested, padding: '12px 14px' }}>
      <Eyebrow style={{ fontSize: 10 }}>{label}</Eyebrow>
      <div className="font-semibold" style={{ fontSize: 16, color: valueColor || C.text, marginTop: 4 }}>
        {value}
      </div>
    </div>
  )
}

// Axis-free Recharts sparkline (directional; no labels).
export function Sparkline({ data, color, height = 32 }) {
  const points = (data || []).filter(v => v != null)
  if (points.length < 2) return <NoData height={height} label="—" />
  const chartData = points.map((v, i) => ({ i, v }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 3, right: 1, bottom: 3, left: 1 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// Coloured dot indicator (needs-attention rows, scorecard).
export function Dot({ color, size = 7, style }) {
  return (
    <span
      className="rounded-full inline-block shrink-0"
      style={{ width: size, height: size, background: color, ...style }}
    />
  )
}
