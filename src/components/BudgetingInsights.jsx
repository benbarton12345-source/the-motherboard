import { useState, useEffect, useMemo } from 'react'
import {
  ComposedChart, Bar, Cell, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, LabelList, ResponsiveContainer,
} from 'recharts'
import { supabase } from '../supabase'
import { useCurrency } from '../CurrencyContext'
import {
  SPENDING_CATEGORIES,
  addMonths, monthLabel, lastNMonths, daysInMonth,
  categoryMatrix, catCell, monthTotals, waterfallData, forecastVsActual,
  merchantBreakdown, savingsSeries, healthScore, needsWants, needsWantsTrend,
  trendDirection, unusualSpend, subscriptionCreep, oneOffTimeline,
  spendingVelocity, fiTrajectory, clamp,
} from '../utils/insightsData'
import { DEFAULT_SETTINGS, loadSettings, saveSettings, monthsToTarget } from '../utils/insightsSettings'

// Design tokens (README) → hex, for SVG/Recharts. Tailwind classes are used for
// text/borders; these raw values are for chart strokes/fills only.
const C = {
  emerald: '#10b981', purple: '#7c6ef8', purpleLight: '#a78bfa',
  amber: '#f59e0b', red: '#f87171', blue: '#60a5fa', slate: '#94a3b8',
  grid: 'rgba(255,255,255,0.045)', track: 'rgba(255,255,255,0.07)',
}
const WATERFALL_FILL = {
  income: C.emerald, rent: 'rgba(167,139,250,0.62)',
  want: 'rgba(251,191,36,0.52)', need: 'rgba(148,163,184,0.42)', other: 'rgba(148,163,184,0.42)',
  'net-pos': C.emerald, 'net-neg': C.red,
}

const WHATIF_MAP = [
  { key: 'groceries', cat: 'Groceries' },
  { key: 'eatingOut', cat: 'Eating Out' },
  { key: 'clothing', cat: 'Clothing & Retail' },
  { key: 'health', cat: 'Health & Wellness' },
  { key: 'entertainment', cat: 'Entertainment' },
  { key: 'personalCare', cat: 'Personal Care' },
]

// ── Shared bits ──────────────────────────────────────────────────────
function AccentLabel({ color, children, className = '' }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span className="w-[3px] h-3.5 rounded shrink-0" style={{ background: color }} />
      <span className="text-[10px] tracking-widest uppercase font-bold" style={{ color }}>{children}</span>
    </div>
  )
}
const Card = ({ children, className = '' }) => (
  <div className={`bg-gray-900 border border-gray-800 rounded-xl p-5 ${className}`}>{children}</div>
)

function ChartTooltip({ active, payload, label, fmt }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg bg-gray-950 border border-gray-700 px-3 py-2 text-xs shadow-lg">
      {label != null && <div className="text-gray-400 mb-1">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-sm" style={{ background: p.color || p.fill }} />
          <span className="text-gray-300">{p.name}</span>
          <span className="font-mono text-white ml-auto">{fmt.compact(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────
export default function BudgetingInsights({ selectedMonth, snapshots = [], onOpenImport, reloadKey = 0 }) {
  const { convert, format, currency, rate } = useCurrency()
  const [entries, setEntries] = useState([])
  const [imports, setImports] = useState([])
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [settingsId, setSettingsId] = useState(null)
  const [showSettings, setShowSettings] = useState(false)

  // Load insight targets from Supabase (app_settings single row)
  useEffect(() => {
    let cancelled = false
    loadSettings().then(({ settings, id }) => {
      if (cancelled) return
      setSettings(settings)
      setSettingsId(id)
    })
    return () => { cancelled = true }
  }, [])

  const [activeTab, setActiveTab] = useState('overview')
  const [expandedCategory, setExpandedCategory] = useState(null)
  const [whatIf, setWhatIf] = useState(null)

  // ── Fetch a 13-month window + import audit rows ────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const start = addMonths(selectedMonth, -12)
    const end = addMonths(selectedMonth, 1)
    Promise.all([
      supabase.from('budget_entries').select('*').gte('month', start).lt('month', end),
      supabase.from('statement_imports').select('statement_month'),
    ]).then(([be, si]) => {
      if (cancelled) return
      setEntries(be.data || [])
      setImports(si.data || [])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [selectedMonth, reloadKey])

  const hasImport = useMemo(
    () => imports.some(i => i.statement_month === selectedMonth),
    [imports, selectedMonth],
  )

  // ── Everything derived (recomputed on data / currency / settings) ──
  const d = useMemo(() => {
    const conv = convert
    const months12 = lastNMonths(selectedMonth, 12)
    const months6 = lastNMonths(selectedMonth, 6)
    const matrix = categoryMatrix(entries, conv)
    const totals = monthTotals(entries, conv)
    const cur = totals[selectedMonth] || { income: 0, expense: 0, net: 0, variable: 0, fixed: 0, oneOff: 0 }

    const waterfall = waterfallData(entries, conv, selectedMonth)
    const fva = forecastVsActual(entries, conv, selectedMonth)
    const savings = savingsSeries(entries, conv, months6)
    const savings12 = savingsSeries(entries, conv, months12)
    const score = healthScore(entries, conv, selectedMonth, settings.savingsTarget)
    const nw = needsWants(matrix, selectedMonth)
    const nwTrend = needsWantsTrend(matrix, months6)
    const unusual = unusualSpend(entries, conv, selectedMonth)
    const creep = subscriptionCreep(matrix, months12)
    const oneOffs = oneOffTimeline(entries, conv)

    // forecast pace total for velocity = sum of trailing-avg forecasts
    const forecastTotal = fva.reduce((s, r) => s + r.forecast, 0)
    const velocity = spendingVelocity(entries, conv, selectedMonth, forecastTotal)

    // heatmap rows (categories with any spend in window)
    const heatRows = SPENDING_CATEGORIES
      .map(cat => ({ cat, cells: months12.map(m => catCell(matrix, cat, m).all) }))
      .filter(r => r.cells.some(v => v > 0))

    // small-multiples series per category
    const trends = SPENDING_CATEGORIES
      .map(cat => {
        const series = months12.map(m => ({ month: m, value: catCell(matrix, cat, m).all }))
        return { cat, series, dir: trendDirection(series), current: catCell(matrix, cat, selectedMonth).all }
      })
      .filter(t => t.series.some(p => p.value > 0))

    // savings rate this month
    const rateNow = cur.income > 0 ? cur.net / cur.income : 0

    // FI trajectory
    const recentSnap = [...snapshots].sort((a, b) => new Date(b.date) - new Date(a.date))[0]
    const currentNW = recentSnap ? conv(recentSnap.total, 'GBP') : 0
    const monthsToFI = monthsToTarget(settings.fiTargetDate)
    const monthlySavings = cur.net
    const fiTargetDisp = conv(settings.fiTarget, 'GBP')
    const currentFIMonths = monthlySavings > 0 ? (fiTargetDisp - currentNW) / monthlySavings : null
    const requiredMonthly = monthsToFI > 0 ? (fiTargetDisp - currentNW) / monthsToFI : 0
    const traj = fiTrajectory({ snaps: snapshots, conv, months: months12, monthlySavings, fiTarget: settings.fiTarget, monthsToTarget: monthsToFI, currentNW })

    return {
      months12, months6, matrix, totals, cur, waterfall, fva, savings, savings12,
      score, nw, nwTrend, unusual, creep, oneOffs, velocity, heatRows, trends,
      rateNow, currentNW, monthlySavings, fiTargetDisp, currentFIMonths, requiredMonthly, monthsToFI, traj,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, snapshots, selectedMonth, currency, rate, settings])

  // What-if defaults from current-month actuals whenever data/month changes
  useEffect(() => {
    if (!hasImport) return
    const init = {}
    for (const { key, cat } of WHATIF_MAP) init[key] = Math.round(catCell(d.matrix, cat, selectedMonth).all)
    setWhatIf(init)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, hasImport, entries, currency, rate])

  function switchTab(tab) { setActiveTab(tab); setExpandedCategory(null) }

  // formatting bag passed to charts
  const sym = currency === 'GBP' ? '£' : 'A$'
  const fmt = useMemo(() => {
    const compact = (v) => {
      const a = Math.abs(v || 0), s = v < 0 ? '-' : ''
      if (a >= 1e6) return `${s}${sym}${+(a / 1e6).toFixed(a >= 1e7 ? 0 : 2)}M`
      if (a >= 1e3) return `${s}${sym}${+(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`
      return `${s}${sym}${Math.round(a)}`
    }
    return {
      sym, compact, format,
      money: (v) => `${v < 0 ? '-' : ''}${sym}${Math.abs(Math.round(v || 0)).toLocaleString('en-GB')}`,
      signed: (v) => `${v > 0 ? '+' : v < 0 ? '-' : ''}${sym}${Math.abs(Math.round(v || 0)).toLocaleString('en-GB')}`,
      pct: (n) => `${n >= 0 ? '+' : ''}${n.toFixed(0)}%`,
    }
  }, [sym, format])

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
      {/* Header + tabs */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm tracking-widest uppercase text-gray-400">Budgeting Insights</h2>
          <span className="text-xs text-gray-600">{monthLabel(selectedMonth, { month: 'long', year: 'numeric' })}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-800 border border-gray-700 rounded-lg p-0.5">
            {[['overview', 'Overview'], ['intelligence', 'Spending Intelligence']].map(([id, label]) => (
              <button key={id} onClick={() => switchTab(id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === id ? 'bg-violet-500 text-white' : 'text-gray-400 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={() => setShowSettings(s => !s)} title="Insight targets"
            className="w-8 h-8 rounded-lg border border-gray-700 bg-gray-800 text-gray-500 hover:text-white flex items-center justify-center transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      {showSettings && <SettingsPanel settings={settings} onSave={(s) => { setSettings(s); saveSettings(s, settingsId).then(setSettingsId); setShowSettings(false) }} onClose={() => setShowSettings(false)} sym={sym} convert={convert} />}

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-600">Loading insights…</div>
      ) : !hasImport ? (
        <EmptyState month={selectedMonth} onOpenImport={onOpenImport} />
      ) : activeTab === 'overview' ? (
        <OverviewTab d={d} fmt={fmt} settings={settings} selectedMonth={selectedMonth}
          expandedCategory={expandedCategory} setExpandedCategory={setExpandedCategory} entries={entries} convert={convert} />
      ) : (
        <IntelligenceTab d={d} fmt={fmt} whatIf={whatIf} setWhatIf={setWhatIf} selectedMonth={selectedMonth} />
      )}
    </div>
  )
}

// ── Empty state ──────────────────────────────────────────────────────
function EmptyState({ month, onOpenImport }) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-4">
      <div className="w-14 h-14 rounded-2xl bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-500 mb-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
        </svg>
      </div>
      <div className="text-base font-semibold text-white mb-1.5">No statement imported for {monthLabel(month, { month: 'long', year: 'numeric' })}</div>
      <p className="text-sm text-gray-500 max-w-[340px] mb-5">Import this month's CommBank and/or Amex statement to unlock the waterfall, forecast variance, savings trajectory and spending intelligence.</p>
      {onOpenImport && (
        <button onClick={onOpenImport}
          className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-400 text-white text-xs font-bold tracking-widest uppercase rounded-lg transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Import Statement
        </button>
      )}
      <ul className="mt-6 text-left text-xs text-gray-600 space-y-1.5">
        {['Income vs spending waterfall', 'Savings rate gauge + month health score', 'Forecast vs actual by category', 'Savings trajectory to your FI target'].map(t => (
          <li key={t} className="flex items-center gap-2"><span className="text-violet-400/60">›</span>{t}</li>
        ))}
      </ul>
    </div>
  )
}

// ── Settings panel ───────────────────────────────────────────────────
function SettingsPanel({ settings, onSave, onClose, sym, convert }) {
  const [target, setTarget] = useState(String(Math.round(settings.savingsTarget * 100)))
  const [fi, setFi] = useState(String(settings.fiTarget))
  const [date, setDate] = useState(settings.fiTargetDate?.slice(0, 7) || '')
  return (
    <div className="mb-5 rounded-xl border border-violet-400/20 bg-violet-400/[0.03] p-4">
      <div className="flex items-center gap-4 flex-wrap">
        <label className="text-xs text-gray-400">Savings target %
          <input type="number" value={target} onChange={e => setTarget(e.target.value)}
            className="ml-2 w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm font-mono" />
        </label>
        <label className="text-xs text-gray-400">FI target (GBP)
          <input type="number" value={fi} onChange={e => setFi(e.target.value)}
            className="ml-2 w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm font-mono" />
        </label>
        <label className="text-xs text-gray-400">Target date
          <input type="month" value={date} onChange={e => setDate(e.target.value)}
            className="ml-2 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm" />
        </label>
        <div className="flex-1" />
        <button onClick={() => onSave({
          savingsTarget: clamp((parseFloat(target) || 45) / 100, 0.01, 1),
          fiTarget: parseFloat(fi) || 1500000,
          fiTargetDate: date ? `${date}-01` : settings.fiTargetDate,
        })} className="px-3 py-1.5 bg-violet-500 hover:bg-violet-400 text-white text-xs font-bold tracking-widest uppercase rounded-lg">Save</button>
        <button onClick={onClose} className="text-xs text-gray-500 hover:text-white">Cancel</button>
      </div>
      <p className="text-[11px] text-gray-600 mt-2">FI target is held in GBP ({sym}{Math.round(convert(settings.fiTarget, 'GBP')).toLocaleString('en-GB')} shown). Settings persist locally.</p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// TAB 1 — OVERVIEW
// ═══════════════════════════════════════════════════════════════════
function OverviewTab({ d, fmt, settings, selectedMonth, expandedCategory, setExpandedCategory, entries, convert }) {
  return (
    <div className="space-y-3">
      {/* Row 1 — hero */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_190px_190px] gap-3">
        <Card>
          <div className="flex items-baseline justify-between mb-1">
            <h3 className="text-sm font-semibold text-white">Income vs Spending</h3>
            <span className="text-xs text-gray-600">{monthLabel(selectedMonth, { month: 'long', year: 'numeric' })}</span>
          </div>
          <WaterfallChart data={d.waterfall} fmt={fmt} />
        </Card>
        <Card><SavingsGauge rate={d.rateNow} target={settings.savingsTarget} history={d.savings} fmt={fmt} /></Card>
        <Card><MonthScore score={d.score} fmt={fmt} /></Card>
      </div>

      {/* Row 2 — forecast vs actual */}
      <Card>
        <div className="flex items-center gap-2.5 mb-4">
          <AccentLabel color={C.blue}>Forecast vs Actual</AccentLabel>
          <span className="text-[11px] text-gray-600">· vs trailing 3-mo average, ranked by overspend</span>
        </div>
        <ForecastVsActual rows={d.fva} fmt={fmt} expanded={expandedCategory} setExpanded={setExpandedCategory}
          entries={entries} convert={convert} selectedMonth={selectedMonth} />
      </Card>

      {/* Row 3 — net savings + projected + callouts */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-3">
        <ProjectedSavings d={d} fmt={fmt} selectedMonth={selectedMonth} />
        <Card>
          <div className="flex items-center gap-2.5 mb-3">
            <AccentLabel color={C.amber}>Unusual Spend</AccentLabel>
            <span className="text-[10px] text-amber-400/70 border border-amber-400/30 rounded-full px-2 py-0.5">vs 3-month average</span>
          </div>
          <UnusualSpend items={d.unusual} fmt={fmt} />
        </Card>
      </div>
    </div>
  )
}

// ── Waterfall ────────────────────────────────────────────────────────
function WaterfallChart({ data, fmt }) {
  const bars = data.bars.map(b => ({
    name: b.name, short: b.name.length > 9 ? b.name.slice(0, 8) + '…' : b.name,
    base: Math.min(b.start, b.end), size: Math.abs(b.end - b.start), kind: b.kind, value: b.value,
  }))
  const renderLabel = (props) => {
    const { x, y, width, index } = props
    const b = bars[index]
    if (!b || (b.name !== 'Income' && b.name !== 'Net')) return null
    return <text x={x + width / 2} y={y - 5} textAnchor="middle" fontSize="10" fill={b.value < 0 ? C.red : C.emerald} fontFamily="monospace">{fmt.compact(b.value)}</text>
  }
  return (
    <ResponsiveContainer width="100%" height={230}>
      <ComposedChart data={bars} margin={{ top: 18, right: 6, bottom: 4, left: -8 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="short" tick={{ fontSize: 8, fill: 'rgba(214,218,234,0.4)' }} interval={0} axisLine={false} tickLine={false} angle={-30} textAnchor="end" height={44} />
        <YAxis tick={{ fontSize: 9, fill: 'rgba(214,218,234,0.4)' }} tickFormatter={fmt.compact} axisLine={false} tickLine={false} width={44} />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<ChartTooltip fmt={fmt} />} />
        <Bar dataKey="base" stackId="a" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="size" stackId="a" isAnimationActive={false} radius={[2, 2, 0, 0]}>
          {bars.map((b, i) => <Cell key={i} fill={WATERFALL_FILL[b.kind]} />)}
          <LabelList content={renderLabel} />
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ── Savings gauge + sparkline ───────────────────────────────────────
function polar(cx, cy, r, deg) { const a = (deg - 90) * Math.PI / 180; return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) } }
function arcPath(cx, cy, r, startDeg, endDeg) {
  const s = polar(cx, cy, r, endDeg), e = polar(cx, cy, r, startDeg)
  const large = endDeg - startDeg <= 180 ? 0 : 1
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`
}
function SavingsGauge({ rate, target, history }) {
  const START = -135, SWEEP = 270
  const frac = clamp(rate, 0, 1)
  const cx = 80, cy = 80, r = 62
  const fillEnd = START + SWEEP * frac
  const targetDeg = START + SWEEP * clamp(target, 0, 1)
  const tp1 = polar(cx, cy, r - 9, targetDeg), tp2 = polar(cx, cy, r + 9, targetDeg)
  return (
    <div className="flex flex-col items-center">
      <div className="text-[10px] tracking-widest uppercase text-gray-500 self-start mb-1">Savings Rate</div>
      <svg width="160" height="150" viewBox="0 0 160 150">
        <path d={arcPath(cx, cy, r, START, START + SWEEP)} stroke={C.track} strokeWidth="11" fill="none" strokeLinecap="round" />
        {frac > 0 && <path d={arcPath(cx, cy, r, START, fillEnd)} stroke={C.emerald} strokeWidth="11" fill="none" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 4px rgba(16,185,129,0.5))' }} />}
        <line x1={tp1.x} y1={tp1.y} x2={tp2.x} y2={tp2.y} stroke={C.amber} strokeWidth="2" />
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize="26" fontWeight="700" fill="#e8ecf8" fontFamily="monospace">{(rate * 100).toFixed(0)}%</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="9" fill="rgba(214,218,234,0.4)">of income saved</text>
      </svg>
      <div className="text-[8.5px] text-amber-400/70 -mt-1">▸ Target {(target * 100).toFixed(0)}%</div>
      <div className="w-full mt-3">
        <div className="text-[9px] text-gray-500 mb-1">6-month trend</div>
        <ResponsiveContainer width="100%" height={34}>
          <LineChart data={history.map(h => ({ v: h.rate == null ? 0 : h.rate * 100 }))}>
            <Line type="monotone" dataKey="v" stroke={C.emerald} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── Month score ──────────────────────────────────────────────────────
function MonthScore({ score }) {
  const color = score.grade === 'A' || score.grade === 'B' ? C.emerald : score.grade === 'C' ? C.amber : C.red
  return (
    <div className="flex flex-col h-full">
      <div className="text-[10px] tracking-widest uppercase text-gray-500 mb-1">Month Score</div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono font-bold leading-none" style={{ fontSize: 56, color }}>{score.grade}</span>
        <div>
          <div className="font-mono text-sm text-white">{score.score}/10</div>
          <div className="text-[11px]" style={{ color }}>{score.label}</div>
        </div>
      </div>
      <div className="mt-auto pt-3">
        <div className="rounded-lg bg-white/[0.03] p-2.5 text-[11px] text-gray-500 leading-relaxed">{score.note}</div>
      </div>
    </div>
  )
}

// ── Forecast vs actual ───────────────────────────────────────────────
function ForecastVsActual({ rows, fmt, expanded, setExpanded, entries, convert, selectedMonth }) {
  if (!rows.length) return <div className="text-sm text-gray-600">No categorised spending yet.</div>
  const max = Math.max(...rows.flatMap(r => [r.forecast, r.actual]), 1)
  const varColor = (r) => r.variance > 100 ? C.red : r.variance > 0 ? C.amber : r.variance < 0 ? C.emerald : C.slate
  return (
    <div>
      <div className="space-y-2.5">
        {rows.map(r => (
          <div key={r.cat} className="flex items-center gap-3">
            <span className="w-[130px] shrink-0 text-[13px] text-gray-300 truncate">{r.cat}</span>
            <div className="flex-1 min-w-0">
              <div className="h-[3px] rounded-full" style={{ width: `${(r.forecast / max) * 100}%`, background: 'rgba(255,255,255,0.18)', minWidth: r.forecast > 0 ? 2 : 0 }} />
              <div className="h-[6px] rounded-full mt-1" style={{ width: `${(r.actual / max) * 100}%`, background: varColor(r), minWidth: r.actual > 0 ? 2 : 0 }} />
            </div>
            <span className="w-[62px] shrink-0 text-right text-[11px] font-mono text-gray-500">{fmt.money(r.forecast)}</span>
            <span className="w-[62px] shrink-0 text-right text-[11px] font-mono text-white">{fmt.money(r.actual)}</span>
            <span className="w-[58px] shrink-0 text-right text-[11px] font-mono" style={{ color: varColor(r) }}>
              {r.variance === 0 ? '—' : fmt.signed(r.variance)}
            </span>
            <button onClick={() => setExpanded(expanded === r.cat ? null : r.cat)}
              className="w-6 shrink-0 text-gray-600 hover:text-white text-xs">{expanded === r.cat ? '▲' : '▼'}</button>
          </div>
        ))}
      </div>
      {expanded && <MerchantBreakdown cat={expanded} entries={entries} convert={convert} selectedMonth={selectedMonth} fmt={fmt} />}
    </div>
  )
}

function MerchantBreakdown({ cat, entries, convert, selectedMonth, fmt }) {
  const { items, total } = useMemo(() => merchantBreakdown(entries, convert, selectedMonth, cat), [entries, convert, selectedMonth, cat])
  const max = Math.max(...items.map(i => i.amount), 1)
  return (
    <div className="mt-4 rounded-xl border p-4 animate-[fadeIn_0.18s_ease]" style={{ background: 'rgba(124,110,248,0.05)', borderColor: 'rgba(124,110,248,0.25)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] tracking-widest uppercase font-bold" style={{ color: C.purpleLight }}>{cat} — merchants</span>
        <span className="text-sm font-mono text-white">{fmt.money(total)}</span>
      </div>
      {items.length === 0 ? <div className="text-xs text-gray-600">No merchant detail.</div> : (
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className={`w-[130px] shrink-0 text-[12px] truncate ${it.aggregated ? 'text-gray-500 italic' : 'text-gray-300'}`}>{it.merchant}{it.oneOff && <span className="text-amber-400"> ·1×</span>}</span>
              <div className="flex-1 h-[8px] rounded-full overflow-hidden bg-white/5">
                <div className="h-full rounded-full" style={{ width: `${(it.amount / max) * 100}%`, background: it.aggregated ? 'rgba(148,163,184,0.4)' : C.purple }} />
              </div>
              <span className="w-[60px] shrink-0 text-right text-[11px] font-mono text-gray-300">{fmt.money(it.amount)}</span>
              <span className="w-[42px] shrink-0 text-right text-[10px] font-mono text-gray-600">{((it.amount / total) * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-gray-600 mt-3">Only one-off transactions keep individual merchant lines; the rest is stored aggregated at import.</p>
    </div>
  )
}

// ── Projected / net savings card ─────────────────────────────────────
function ProjectedSavings({ d, fmt, selectedMonth }) {
  const now = new Date()
  const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const isCurrent = selectedMonth === curKey
  const dim = daysInMonth(selectedMonth)
  const day = Math.min(now.getDate(), dim)
  const net = d.cur.net
  // project variable spend forward if the month is still in progress
  const projectedNet = isCurrent && day < dim && d.cur.variable > 0
    ? d.cur.income - d.cur.fixed - (d.cur.variable * dim / day)
    : null
  const fiYears = d.currentFIMonths != null && d.currentFIMonths > 0 ? d.currentFIMonths / 12 : null
  return (
    <Card>
      <div className="text-[10px] tracking-widest uppercase text-gray-500 mb-2">{projectedNet != null ? 'Projected Net Savings' : 'Net Savings'}</div>
      <div className="font-mono font-bold" style={{ fontSize: 30, color: net >= 0 ? C.emerald : C.red }}>{fmt.money(net)}</div>
      <div className="text-xs text-gray-500 mt-0.5">{d.cur.income > 0 ? `${(d.rateNow * 100).toFixed(0)}% of income` : '—'}</div>
      {projectedNet != null && (
        <div className="mt-2 rounded-lg bg-white/[0.03] p-2.5">
          <div className="text-[10px] text-gray-500">Projected end of month</div>
          <div className="font-mono text-lg" style={{ color: projectedNet >= 0 ? C.emerald : C.red }}>{fmt.money(projectedNet)}</div>
          <div className="text-[10px] text-gray-600">day {day} of {dim} · at current pace</div>
        </div>
      )}
      <div className="border-t border-gray-800 mt-3 pt-3">
        <div className="text-[10px] text-gray-500">At this rate, FI in approx.</div>
        <div className="font-mono text-lg text-gray-300">{fiYears ? `${fiYears.toFixed(1)} yrs` : '—'}</div>
        <div className="text-[10px] text-gray-600">{fmt.compact(d.fiTargetDisp)} target</div>
      </div>
    </Card>
  )
}

// ── Unusual spend ────────────────────────────────────────────────────
const capPct = (p) => p >= 500 ? '500%+' : `${p.toFixed(0)}%`
function UnusualSpend({ items, fmt }) {
  if (!items.length) return <div className="text-sm text-gray-600">Nothing unusual — every category is within ~20% of its 3-month average.</div>
  const col = { high: C.red, medium: C.amber, good: C.emerald }
  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
      {items.map(it => (
        <div key={it.cat} className="rounded-lg bg-white/[0.02] border border-gray-800 p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ background: col[it.severity] }} />
            <span className="text-[12.5px] font-medium" style={{ color: col[it.severity] }}>
              {it.cat} {capPct(Math.abs(it.pct))} {it.pct >= 0 ? 'above' : 'below'} average
            </span>
          </div>
          <div className="text-[11px] text-gray-500 font-mono">{fmt.money(it.avg)} avg → {fmt.money(it.actual)}</div>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// TAB 2 — SPENDING INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════
function IntelligenceTab({ d, fmt, whatIf, setWhatIf, selectedMonth }) {
  return (
    <div className="space-y-3">
      {/* Callouts up top */}
      <Card>
        <AccentLabel color={C.amber} className="mb-3">Unusual Spend Callouts</AccentLabel>
        <UnusualSpend items={d.unusual} fmt={fmt} />
      </Card>

      {/* FI trajectory — prominent */}
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <AccentLabel color={C.purpleLight}>Savings Trajectory to {fmt.compact(d.fiTargetDisp)}</AccentLabel>
          <div className="flex items-center gap-4 text-[11px]">
            <span className="text-gray-500">Balance <span className="font-mono font-bold" style={{ color: C.blue }}>{fmt.compact(d.currentNW)}</span></span>
            <span className="text-gray-500">FI in <span className="font-mono font-bold" style={{ color: C.purpleLight }}>{d.currentFIMonths ? `${(d.currentFIMonths / 12).toFixed(1)} yrs` : '—'}</span></span>
            <span className="text-gray-500">Required/mo <span className="font-mono font-bold" style={{ color: C.amber }}>{fmt.compact(d.requiredMonthly)}</span></span>
          </div>
        </div>
        <FITrajectory d={d} fmt={fmt} selectedMonth={selectedMonth} />
      </Card>

      {/* Heatmap */}
      <Card>
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <AccentLabel color={C.emerald}>Category Heatmap</AccentLabel>
          <span className="text-[11px] text-gray-600">{monthLabel(d.months12[0])} – {monthLabel(selectedMonth)}</span>
          <div className="flex items-center gap-1 ml-auto text-[9px] text-gray-600">low
            {[0.15, 0.35, 0.6, 0.85].map(o => <span key={o} className="w-3 h-3 rounded-sm" style={{ background: `rgba(16,185,129,${o})` }} />)}high
          </div>
        </div>
        <Heatmap rows={d.heatRows} months={d.months12} selectedMonth={selectedMonth} fmt={fmt} />
      </Card>

      {/* Small multiples */}
      <Card>
        <AccentLabel color={C.blue} className="mb-3">Category Trend Lines <span className="text-gray-600 font-normal normal-case tracking-normal">· 12 months</span></AccentLabel>
        <SmallMultiples trends={d.trends} fmt={fmt} />
      </Card>

      {/* Velocity + needs/wants */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <AccentLabel color={C.blue} className="mb-1">Spending Velocity</AccentLabel>
          <p className="text-[11px] text-gray-600 mb-2">Cumulative spend vs forecast pace</p>
          <SpendingVelocity velocity={d.velocity} fmt={fmt} />
        </Card>
        <Card>
          <AccentLabel color={C.purpleLight} className="mb-3">Needs vs Wants</AccentLabel>
          <NeedsWants nw={d.nw} trend={d.nwTrend} fmt={fmt} />
        </Card>
      </div>

      {/* What-if */}
      <Card>
        <AccentLabel color={C.purpleLight} className="mb-1">What-If Savings Simulator</AccentLabel>
        <p className="text-[11px] text-gray-600 mb-3">Adjust category spend to see the impact on your FI date</p>
        <WhatIf d={d} fmt={fmt} whatIf={whatIf} setWhatIf={setWhatIf} />
      </Card>

      {/* Spend creep + one-offs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <AccentLabel color={C.purpleLight} className="mb-1">Subscription Spend Creep</AccentLabel>
          <p className="text-[11px] text-gray-600 mb-2">Total subscriptions · 12 months</p>
          <SpendCreep creep={d.creep} fmt={fmt} months={d.months12} />
        </Card>
        <Card>
          <AccentLabel color={C.amber} className="mb-3">One-Off Items</AccentLabel>
          <OneOffTimeline items={d.oneOffs} fmt={fmt} />
        </Card>
      </div>
    </div>
  )
}

// ── FI trajectory ────────────────────────────────────────────────────
function FITrajectory({ d, fmt, selectedMonth }) {
  const { traj, months12 } = d
  const anchor = traj.anchorIdx
  const maxI = anchor + traj.horizon
  const data = []
  for (let i = 0; i <= maxI; i++) {
    const a = traj.actual.find(x => x.i === i)
    const f = i >= anchor ? traj.forward[i - anchor] : null
    data.push({ i, actual: i <= anchor ? (i === anchor ? d.currentNW : (a ? a.actual : null)) : null, projected: f ? f.projected : null, required: f ? f.required : null })
  }
  const ticks = [0]
  for (let t = anchor; t <= maxI; t += 24) ticks.push(t)
  if (ticks[ticks.length - 1] !== maxI) ticks.push(maxI)
  const tickFmt = (i) => {
    if (i === 0) return monthLabel(months12[0])
    if (i === anchor) return 'Today'
    return monthLabel(addMonths(selectedMonth, i - anchor), { year: 'numeric' })
  }
  return (
    <ResponsiveContainer width="100%" height={230}>
      <LineChart data={data} margin={{ top: 6, right: 12, bottom: 4, left: -4 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="i" type="number" domain={[0, maxI]} ticks={ticks} tickFormatter={tickFmt} tick={{ fontSize: 9, fill: 'rgba(214,218,234,0.4)' }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmt.compact} tick={{ fontSize: 9, fill: 'rgba(214,218,234,0.4)' }} axisLine={false} tickLine={false} width={46} />
        <Tooltip content={<ChartTooltip fmt={fmt} />} labelFormatter={tickFmt} />
        <ReferenceLine y={traj.targetDisp} stroke={C.emerald} strokeDasharray="4 4" strokeOpacity={0.6} />
        <ReferenceLine x={anchor} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" />
        <Line name="Actual" dataKey="actual" stroke={C.blue} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
        <Line name="Projected (current rate)" dataKey="projected" stroke={C.purple} strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
        <Line name="Required for target" dataKey="required" stroke={C.amber} strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Heatmap ──────────────────────────────────────────────────────────
function Heatmap({ rows, months, selectedMonth, fmt }) {
  if (!rows.length) return <div className="text-sm text-gray-600">Not enough history yet.</div>
  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <div className="grid gap-1" style={{ gridTemplateColumns: `132px repeat(${months.length}, minmax(26px, 1fr))` }}>
          <div />
          {months.map(m => (
            <div key={m} className={`text-[9px] text-center ${m === selectedMonth ? 'text-emerald-400' : 'text-gray-600'}`}>{monthLabel(m, { month: 'short' })}</div>
          ))}
          {rows.map(row => {
            const vals = row.cells.filter(v => v > 0)
            const min = vals.length ? Math.min(...vals) : 0
            const max = vals.length ? Math.max(...vals) : 0
            const range = max - min || 1
            return (
              <FragmentRow key={row.cat}>
                <div className="text-[11px] text-gray-400 text-right pr-2 self-center truncate">{row.cat}</div>
                {row.cells.map((v, i) => {
                  const intensity = v > 0 ? 0.07 + ((v - min) / range) * 0.76 : 0.02
                  return (
                    <div key={i} title={`${monthLabel(months[i], { month: 'short', year: 'numeric' })} · ${fmt.money(v)}`}
                      className="h-5 rounded-[3px]"
                      style={{ background: `rgba(16,185,129,${intensity})`, outline: months[i] === selectedMonth ? '1.5px solid rgba(16,185,129,0.9)' : 'none', outlineOffset: '-1.5px' }} />
                  )
                })}
              </FragmentRow>
            )
          })}
        </div>
      </div>
    </div>
  )
}
const FragmentRow = ({ children }) => <>{children}</>

// ── Small multiples ──────────────────────────────────────────────────
function SmallMultiples({ trends, fmt }) {
  if (!trends.length) return <div className="text-sm text-gray-600">Not enough history yet.</div>
  const arrow = { up: '↑', down: '↓', flat: '→' }
  const col = { up: C.red, down: C.emerald, flat: C.blue }
  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
      {trends.map(t => (
        <div key={t.cat} className="rounded-lg bg-white/[0.025] border border-gray-800 p-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[8.5px] text-gray-400 truncate">{t.cat}</span>
            <span className="text-[9px] font-mono text-gray-500">{fmt.compact(t.current)}</span>
          </div>
          <ResponsiveContainer width="100%" height={52}>
            <AreaChart data={t.series.map(p => ({ v: p.value }))} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
              <defs>
                <linearGradient id={`g-${t.cat.replace(/\W/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={col[t.dir]} stopOpacity={0.18} /><stop offset="100%" stopColor={col[t.dir]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area dataKey="v" stroke={col[t.dir]} strokeWidth={1.5} fill={`url(#g-${t.cat.replace(/\W/g, '')})`} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-between text-[7px] text-gray-600 -mt-0.5">
            <span>{monthLabel(t.series[0].month, { month: 'short' })}</span>
            <span style={{ color: col[t.dir] }}>{arrow[t.dir]}</span>
            <span>{monthLabel(t.series[t.series.length - 1].month, { month: 'short' })}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Spending velocity ────────────────────────────────────────────────
function SpendingVelocity({ velocity, fmt }) {
  const over = velocity.actualTotal > velocity.budgetTotal
  const actualColor = over ? C.amber : C.blue
  return (
    <div>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={velocity.points} margin={{ top: 6, right: 8, bottom: 0, left: -6 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <defs>
            <linearGradient id="velGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={actualColor} stopOpacity={0.16} /><stop offset="100%" stopColor={actualColor} stopOpacity={0} /></linearGradient>
          </defs>
          <XAxis dataKey="day" ticks={[1, Math.round(velocity.days / 2), velocity.days]} tick={{ fontSize: 9, fill: 'rgba(214,218,234,0.4)' }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={fmt.compact} tick={{ fontSize: 9, fill: 'rgba(214,218,234,0.4)' }} axisLine={false} tickLine={false} width={40} />
          <Tooltip content={<ChartTooltip fmt={fmt} />} labelFormatter={(d) => `Day ${d}`} />
          <Area name="Actual" dataKey="actual" stroke={actualColor} strokeWidth={2} fill="url(#velGrad)" dot={false} isAnimationActive={false} />
          <Line name="Budget pace" dataKey="budget" stroke="rgba(255,255,255,0.22)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-1 text-[10px]">
        <span className="flex items-center gap-1.5"><span className="w-3 h-[2px]" style={{ background: actualColor }} /><span className="text-gray-500">Actual {fmt.money(velocity.actualTotal)}</span></span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-[2px] border-t border-dashed border-white/40" /><span className="text-gray-500">Pace {fmt.money(velocity.budgetTotal)}</span></span>
      </div>
      <p className="text-[10px] text-gray-600 mt-1.5">Daily detail is approximated — transaction dates aren't retained after import.</p>
    </div>
  )
}

// ── Needs vs wants ───────────────────────────────────────────────────
function NeedsWants({ nw, trend, fmt }) {
  if (nw.denom === 0) return <div className="text-sm text-gray-600">No classified spend this month.</div>
  return (
    <div>
      <div className="flex gap-0.5 h-2 rounded-full overflow-hidden mb-2">
        <div style={{ width: `${nw.needsPct * 100}%`, background: C.emerald }} />
        <div style={{ width: `${nw.wantsPct * 100}%`, background: C.amber }} />
      </div>
      <div className="flex justify-between text-[11px] mb-4">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: C.emerald }} /><span className="text-gray-400">Needs {(nw.needsPct * 100).toFixed(0)}% · {fmt.money(nw.needs)}</span></span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: C.amber }} /><span className="text-gray-400">Wants {(nw.wantsPct * 100).toFixed(0)}% · {fmt.money(nw.wants)}</span></span>
      </div>
      <div className="text-[9.5px] text-gray-500 mb-1.5">6-month trend</div>
      <div className="space-y-1">
        {trend.map(t => (
          <div key={t.month} className="flex items-center gap-2">
            <span className="w-7 text-[9px] text-gray-600 shrink-0">{monthLabel(t.month, { month: 'short' })}</span>
            <div className="flex-1 flex gap-0.5 h-1 rounded-full overflow-hidden">
              {t.denom > 0 ? <>
                <div style={{ width: `${t.needsPct * 100}%`, background: C.emerald }} />
                <div style={{ width: `${t.wantsPct * 100}%`, background: C.amber }} />
              </> : <div className="w-full bg-white/5" />}
            </div>
            <span className="w-10 text-right text-[9px] font-mono text-gray-500 shrink-0">{t.denom > 0 ? `${(t.needsPct * 100).toFixed(0)}%` : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── What-if ──────────────────────────────────────────────────────────
function WhatIf({ d, fmt, whatIf, setWhatIf }) {
  if (!whatIf) return <div className="text-sm text-gray-600">Loading…</div>
  const defaults = {}
  for (const { key, cat } of WHATIF_MAP) defaults[key] = Math.round(catCell(d.matrix, cat, d.months12[d.months12.length - 1] || '').all)
  const sumDefaults = Object.values(defaults).reduce((a, b) => a + b, 0)
  const sumSliders = Object.values(whatIf).reduce((a, b) => a + b, 0)
  const currentSavings = d.cur.net
  const adjustedSavings = currentSavings + sumDefaults - sumSliders
  const delta = adjustedSavings - currentSavings
  const gap = d.fiTargetDisp - d.currentNW
  const curMonths = currentSavings > 0 ? gap / currentSavings : null
  const adjMonths = adjustedSavings > 0 ? gap / adjustedSavings : null
  const monthsSaved = curMonths != null && adjMonths != null ? curMonths - adjMonths : null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-5">
      <div className="space-y-3">
        {WHATIF_MAP.map(({ key, cat }) => {
          const val = whatIf[key], def = defaults[key]
          const max = Math.max(Math.round(def * 2.2), 100)
          const diff = val - def
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12.5px] text-gray-400">{cat}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px]" style={{ color: diff < 0 ? C.emerald : diff > 0 ? C.amber : 'rgba(214,218,234,0.4)' }}>
                    {diff === 0 ? 'no change' : diff < 0 ? `${fmt.money(-diff)} saved` : `+${fmt.money(diff)} more`}
                  </span>
                  <span className="text-[13.5px] font-mono font-bold text-white w-16 text-right">{fmt.money(val)}</span>
                </div>
              </div>
              <input type="range" min={0} max={max} value={val}
                onChange={e => setWhatIf(w => ({ ...w, [key]: Number(e.target.value) }))}
                className="w-full accent-violet-500" />
            </div>
          )
        })}
      </div>
      <div className="rounded-xl bg-white/[0.025] border border-gray-800 p-4 self-start">
        <div className="text-[10px] text-gray-500">Currently saving</div>
        <div className="font-mono text-lg text-gray-400 mb-3">{fmt.money(currentSavings)}/mo</div>
        <div className="text-[10px] text-gray-500">Adjusted savings</div>
        <div className="font-mono text-2xl font-bold" style={{ color: adjustedSavings >= currentSavings ? C.emerald : C.amber }}>{fmt.money(adjustedSavings)}/mo</div>
        <div className="font-mono text-xs mb-3" style={{ color: delta > 0 ? C.emerald : delta < 0 ? C.amber : 'rgba(214,218,234,0.4)' }}>{delta === 0 ? '—' : `${fmt.signed(delta)}/mo`}</div>
        <div className="border-t border-gray-800 pt-3">
          <div className="text-[10px] text-gray-500">FI timeline</div>
          <div className="font-mono text-sm text-gray-300">
            {curMonths ? `${(curMonths / 12).toFixed(1)}yr` : '—'} <span className="text-gray-600">→</span>{' '}
            <span style={{ color: adjMonths && curMonths && adjMonths < curMonths ? C.emerald : C.amber }}>{adjMonths ? `${(adjMonths / 12).toFixed(1)}yr` : '—'}</span>
          </div>
          {monthsSaved != null && (
            <div className="text-[11px] mt-0.5" style={{ color: monthsSaved > 0 ? C.emerald : monthsSaved < 0 ? C.amber : 'rgba(214,218,234,0.4)' }}>
              {monthsSaved > 0 ? `${Math.abs(monthsSaved).toFixed(0)} months sooner` : monthsSaved < 0 ? `${Math.abs(monthsSaved).toFixed(0)} months further` : 'no change'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Spend creep ──────────────────────────────────────────────────────
function SpendCreep({ creep, fmt, months }) {
  const data = creep.points.map((p, i) => ({ month: p.month, value: p.value, trend: creep.trend[i].value }))
  const hasData = creep.points.some(p => p.value > 0)
  return (
    <div>
      {!hasData ? <div className="text-sm text-gray-600 py-6">No subscription spend recorded yet.</div> : (
        <ResponsiveContainer width="100%" height={110}>
          <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
            <defs><linearGradient id="creepGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.purpleLight} stopOpacity={0.22} /><stop offset="100%" stopColor={C.purpleLight} stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="month" ticks={[months[0], months[months.length - 1]]} tickFormatter={m => monthLabel(m)} tick={{ fontSize: 8, fill: 'rgba(214,218,234,0.4)' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmt.compact} tick={{ fontSize: 8, fill: 'rgba(214,218,234,0.4)' }} axisLine={false} tickLine={false} width={38} />
            <Tooltip content={<ChartTooltip fmt={fmt} />} labelFormatter={m => monthLabel(m, { month: 'short', year: 'numeric' })} />
            <Area name="Subscriptions" dataKey="value" stroke={C.purpleLight} strokeWidth={1.5} fill="url(#creepGrad)" dot={false} isAnimationActive={false} />
            <Line name="Trend" dataKey="trend" stroke={C.amber} strokeWidth={1.2} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
      {creep.rising && (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-400/[0.06] border border-amber-400/20 p-2.5">
          <span className="text-amber-400 text-sm leading-none">⚠</span>
          <span className="text-[11px] text-amber-200/80">+{fmt.money(creep.increase)}/mo increase in subscriptions observed over the window.</span>
        </div>
      )}
    </div>
  )
}

// ── One-off timeline ─────────────────────────────────────────────────
function OneOffTimeline({ items, fmt }) {
  return (
    <div>
      {items.length === 0 ? (
        <div className="text-sm text-gray-600 py-4">No one-off items flagged yet. Mark irregular costs (rego, car service, annual fees) as one-off during statement import.</div>
      ) : (
        <div className="space-y-1.5">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-[9.5px] font-semibold uppercase tracking-wider text-amber-400 border border-amber-400/40 rounded px-1.5 py-0.5 shrink-0">{monthLabel(it.month)}</span>
              <span className="flex-1 text-[13px] text-gray-400 truncate">{it.merchant}<span className="text-gray-600"> · {it.category}</span></span>
              <span className="font-mono text-[13px] shrink-0" style={{ color: C.amber }}>{fmt.money(it.amount)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-gray-600 mt-3">One-off items are flagged during import review and excluded from category averages.</p>
    </div>
  )
}
