import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useCurrency } from '../CurrencyContext'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot, Legend,
} from 'recharts'
import { latestBalance, groupSnapshots } from '../utils/netWorthHelpers'
import { FI_PROJECTION_YEARS } from '../utils/financeTaxonomy'
import {
  projectSeries, yearlySlice, findCrossingMonth, monthsToLabel, reverseCalc, sensitivity,
  MILESTONES, NET_WORTH_TARGET_GBP,
} from '../utils/projectionEngine'

// Projections — forward net-worth projection to the £1.5m target. Monthly-resolution
// engine (shared with Overview's FI-pace) run in GBP off the REAL current net worth,
// displayed in the active currency. A single in-memory assumption set for now
// (persistence is a follow-on migration); sliders recompute the chart/numbers live.
const DEFAULT_ASSUMPTIONS = { contribution: 1800, growth: 7, salary: 3, inflation: 2.5, advicePct: 70 }

const LINE = { total: '#34d399', advice: '#5b93c4', trading: '#f59e0b' }

function soonerLabel(m) {
  if (m <= 0) return 'no change'
  if (m < 24) return `${m} month${m === 1 ? '' : 's'} sooner`
  return `${Math.floor(m / 12)}y ${m % 12}m sooner`
}

function Slider({ label, value, min, max, step, onChange, fmt }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11px] font-bold uppercase tracking-widest text-gray-500">{label}</label>
        <span className="text-[13px] font-semibold text-white tabular-nums">{fmt(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full accent-emerald-400"
      />
    </div>
  )
}

export default function ProjectionsPage() {
  const { convert, format, rate, currency } = useCurrency()
  const [snaps, setSnaps] = useState({})
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState(DEFAULT_ASSUMPTIONS)
  const [tool, setTool] = useState('reverse')
  const nowYear = new Date().getFullYear()
  const [revTarget, setRevTarget] = useState(NET_WORTH_TARGET_GBP)
  const [revYear, setRevYear] = useState(nowYear + 15)
  const [revMode, setRevMode] = useState('monthly') // 'monthly' | 'lump'

  useEffect(() => {
    Promise.all([
      supabase.from('accounts').select('*').eq('active', true),
      supabase.from('account_snapshots').select('*'),
    ]).then(([a, s]) => {
      if (a.data) setAccounts(a.data)
      if (s.data) setSnaps(groupSnapshots(s.data))
      setLoading(false)
    })
  }, [])

  // Current net worth in GBP (canonical for projection math). AUD accounts → GBP via rate.
  const fx = rate || 2.05
  const startGbp = accounts.reduce((sum, a) => {
    const native = latestBalance(snaps[a.id])
    return sum + (a.currency === 'GBP' ? native : native / fx)
  }, 0)

  const updateActive = patch => setActive(prev => ({ ...prev, ...patch }))

  const cDisp = gbp => convert(gbp, 'GBP') // GBP → active display currency
  const compact = v => {
    const sym = currency === 'GBP' ? '£' : 'A$'
    if (Math.abs(v) >= 1e6) return `${sym}${(v / 1e6).toFixed(1)}m`
    if (Math.abs(v) >= 1e3) return `${sym}${Math.round(v / 1e3)}k`
    return `${sym}${Math.round(v)}`
  }

  // ── Projection ──────────────────────────────────────────────────────────────
  const series = projectSeries(active, startGbp, FI_PROJECTION_YEARS)
  const projMonth = findCrossingMonth(series, NET_WORTH_TARGET_GBP)
  const finalTotal = series[series.length - 1].total
  const realFinal = finalTotal / Math.pow(1 + active.inflation / 100, FI_PROJECTION_YEARS)

  const chartData = yearlySlice(series).map(pt => ({
    year: pt.month / 12,
    total: Math.round(cDisp(pt.total)),
    advice: Math.round(cDisp(pt.total * active.advicePct / 100)),
    trading: Math.round(cDisp(pt.total * (100 - active.advicePct) / 100)),
  }))
  const targetDisp = cDisp(NET_WORTH_TARGET_GBP)

  const milestoneCards = MILESTONES.map(v => ({
    value: v,
    label: compact(cDisp(v)),
    month: findCrossingMonth(series, v),
  }))

  // ── Reverse calc ────────────────────────────────────────────────────────────
  const monthsToTarget = Math.max(1, (revYear - nowYear) * 12)
  const rev = reverseCalc(startGbp, active.growth, revTarget, monthsToTarget)
  const sens = sensitivity(active, startGbp, NET_WORTH_TARGET_GBP, FI_PROJECTION_YEARS)

  const card = 'bg-gray-900 border border-gray-800 rounded-lg'

  if (loading) return <div className="text-sm text-gray-600">Loading…</div>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        {/* Assumptions */}
        <div className={`${card} p-5 lg:col-span-2 min-w-0 space-y-5`}>
          <div className="text-[12px] font-bold uppercase tracking-widest text-gray-500">Assumptions</div>
          <Slider label="Monthly contribution" value={active.contribution} min={0} max={5000} step={50}
            onChange={v => updateActive({ contribution: v })} fmt={v => format(convert(v, 'GBP'))} />
          <Slider label="Growth rate" value={active.growth} min={0} max={15} step={0.5}
            onChange={v => updateActive({ growth: v })} fmt={v => `${v}%`} />
          <Slider label="Salary growth" value={active.salary} min={0} max={10} step={0.5}
            onChange={v => updateActive({ salary: v })} fmt={v => `${v}%`} />
          <Slider label="Inflation" value={active.inflation} min={0} max={8} step={0.5}
            onChange={v => updateActive({ inflation: v })} fmt={v => `${v}%`} />
          <div className="border-t border-gray-800 pt-4">
            <Slider label="Income mix — advice" value={active.advicePct} min={0} max={100} step={5}
              onChange={v => updateActive({ advicePct: v })} fmt={v => `${v}%`} />
            <div className="flex items-center gap-4 mt-2 text-[12px]">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: LINE.advice }} /><span className="text-gray-400">Advice {active.advicePct}%</span></span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: LINE.trading }} /><span className="text-gray-400">Trading {100 - active.advicePct}%</span></span>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className={`${card} p-5 lg:col-span-3 min-w-0`}>
          <div className="flex items-end justify-between flex-wrap gap-2 mb-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Projected to reach {compact(targetDisp)}</div>
              <div className="text-2xl font-extrabold text-white mt-0.5">{monthsToLabel(projMonth)}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-gray-500">In {FI_PROJECTION_YEARS}y ({nowYear + FI_PROJECTION_YEARS})</div>
              <div className="text-[15px] font-bold text-white">{format(cDisp(finalTotal))}</div>
              <div className="text-[11px] text-gray-600">≈ {format(cDisp(realFinal))} in today's money</div>
            </div>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: 4 }}>
                <XAxis dataKey="year" type="number" domain={[0, FI_PROJECTION_YEARS]}
                  ticks={[0, 5, 10, 15, 20, 25]} tickFormatter={y => nowYear + y}
                  tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={compact} tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} width={44} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, fontSize: 12 }}
                  labelFormatter={y => nowYear + y}
                  formatter={(v, n) => [format(v), n[0].toUpperCase() + n.slice(1)]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={targetDisp} stroke="#6b7280" strokeDasharray="5 4" strokeWidth={1}
                  label={{ value: compact(targetDisp), position: 'right', fill: '#9ca3af', fontSize: 10 }} />
                {milestoneCards.filter(m => m.month != null).map(m => (
                  <ReferenceDot key={m.value} x={m.month / 12} y={Math.round(cDisp(m.value))} r={3.5}
                    fill="#34d399" stroke="#0a0e16" strokeWidth={1.5} />
                ))}
                <Line type="monotone" dataKey="total" name="Total" stroke={LINE.total} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="advice" name="Advice" stroke={LINE.advice} strokeWidth={1.75} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="trading" name="Trading" stroke={LINE.trading} strokeWidth={1.75} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Milestone cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {milestoneCards.map(m => (
          <div key={m.value} className={`${card} p-4`}>
            <div className="text-[11px] font-bold uppercase tracking-widest text-gray-500">{m.label}</div>
            <div className={`text-lg font-bold mt-1 ${m.month != null ? 'text-white' : 'text-gray-600'}`}>{monthsToLabel(m.month)}</div>
          </div>
        ))}
      </div>

      {/* Secondary tools */}
      <div className={`${card} p-5`}>
        <div className="inline-flex rounded-lg border border-gray-800 p-1 mb-4">
          {[['reverse', 'Time to £X'], ['sensitivity', 'Sensitivity']].map(([k, label]) => (
            <button key={k} onClick={() => setTool(k)}
              className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
                tool === k ? 'bg-emerald-400/10 text-emerald-400' : 'text-gray-400 hover:text-gray-200'
              }`}>{label}</button>
          ))}
        </div>

        {tool === 'reverse' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Target amount</label>
                <input type="number" step={50000} value={revTarget}
                  onChange={e => setRevTarget(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="bg-gray-950 border border-gray-800 rounded px-2.5 py-2 text-white text-sm w-36 focus:outline-none focus:border-emerald-400/60" />
                <div className="text-[11px] text-gray-600 mt-1">{format(cDisp(revTarget))}</div>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">By year</label>
                <input type="number" value={revYear}
                  onChange={e => setRevYear(parseInt(e.target.value) || nowYear)}
                  className="bg-gray-950 border border-gray-800 rounded px-2.5 py-2 text-white text-sm w-24 focus:outline-none focus:border-emerald-400/60" />
              </div>
              <div className="inline-flex rounded-lg border border-gray-800 p-1">
                {[['monthly', 'Monthly'], ['lump', 'Lump sum']].map(([k, label]) => (
                  <button key={k} onClick={() => setRevMode(k)}
                    className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
                      revMode === k ? 'bg-emerald-400/10 text-emerald-400' : 'text-gray-400 hover:text-gray-200'
                    }`}>{label}</button>
                ))}
              </div>
            </div>
            <div>
              {rev.alreadyThere ? (
                <div className="text-sm text-emerald-400">Current net worth alone reaches {format(cDisp(revTarget))} by {revYear} at this growth rate — no extra needed.</div>
              ) : revMode === 'monthly' ? (
                <div>
                  <div className="text-[11px] text-gray-500 uppercase tracking-widest">Required monthly contribution</div>
                  <div className="text-3xl font-extrabold text-emerald-400 mt-1">{format(cDisp(rev.requiredMonthly))}<span className="text-sm text-gray-500 font-medium"> / month</span></div>
                </div>
              ) : (
                <div>
                  <div className="text-[11px] text-gray-500 uppercase tracking-widest">Required lump sum invested today</div>
                  <div className="text-3xl font-extrabold text-emerald-400 mt-1">{format(cDisp(rev.requiredLumpSum))}</div>
                  <div className="text-[11px] text-gray-600 mt-1">with no further monthly contributions</div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="text-[12px] text-gray-500 mb-1">How much sooner {compact(targetDisp)} lands if you change one assumption:</div>
            {sens.map(s => (
              <div key={s.label} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                <span className="text-sm text-gray-300">{s.label}</span>
                <span className={`text-sm font-semibold ${s.months > 0 ? 'text-emerald-400' : 'text-gray-500'}`}>{soonerLabel(s.months)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
