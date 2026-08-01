import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useCurrency } from '../CurrencyContext'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { latestBalance, groupSnapshots } from '../utils/netWorthHelpers'
import { NET_WORTH_TARGET_GBP } from '../utils/financeTaxonomy'
import { projectSeries, findCrossingMonth, monthsToLabel, DEFAULT_ASSUMPTIONS } from '../utils/projectionEngine'

// Finance Overview — the section landing page. Hero net-worth card (respects the
// app GBP/AUD toggle), an always-AUD snapshot row (savings rate / FI pace / budget
// position), and a grid of honest cross-metric flags. FI-pace figures run off the
// shared projection engine (DEFAULT_ASSUMPTIONS) so they match the Projections page.
const fmtAud = v => `A$${Math.round(v).toLocaleString('en-GB')}`

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default function FinanceOverviewPage() {
  const { convert, format, rate } = useCurrency()
  const [accounts, setAccounts] = useState([])
  const [snaps, setSnaps] = useState({})
  const [budget, setBudget] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('accounts').select('*').eq('active', true),
      supabase.from('account_snapshots').select('*'),
      supabase.from('budget_entries').select('month,type,amount'),
    ]).then(([a, s, b]) => {
      if (a.data) setAccounts(a.data)
      if (s.data) setSnaps(groupSnapshots(s.data))
      if (b.data) setBudget(b.data)
      setLoading(false)
    })
  }, [])

  const fx = rate || 2.05
  const toGbp = (native, ccy) => (ccy === 'GBP' ? native : native / fx)

  // ── Net worth history (carry-forward per account) ───────────────────────────
  const allDates = [...new Set(Object.values(snaps).flat().map(r => r.snapshot_date))].sort()
  const history = allDates.map(date => {
    let gbp = 0
    for (const a of accounts) {
      const h = snaps[a.id] || []
      let bal = null
      for (const r of h) { if (r.snapshot_date <= date) bal = Number(r.balance); else break }
      if (bal != null) gbp += toGbp(bal, a.currency)
    }
    return { date: date.slice(5), gbp, disp: Math.round(convert(gbp, 'GBP')) }
  })
  const totalGbp = accounts.reduce((s, a) => s + toGbp(latestBalance(snaps[a.id]), a.currency), 0)
  const cur = history[history.length - 1]
  const prev = history[history.length - 2]
  const deltaDisp = cur && prev ? cur.disp - prev.disp : null
  const deltaPct = deltaDisp != null && prev?.disp ? (deltaDisp / prev.disp) * 100 : null
  const pctToTarget = Math.min(100, (totalGbp / NET_WORTH_TARGET_GBP) * 100)

  // ── FI pace (shared engine) ─────────────────────────────────────────────────
  const series = projectSeries(DEFAULT_ASSUMPTIONS, totalGbp)
  const projMonth = findCrossingMonth(series, NET_WORTH_TARGET_GBP)
  const fiYears = projMonth != null ? (projMonth / 12).toFixed(1) : null

  // ── Budget (AUD) ────────────────────────────────────────────────────────────
  const byMonth = {}
  for (const e of budget) {
    (byMonth[e.month] ||= { income: 0, expense: 0 })[e.type] += Number(e.amount) || 0
  }
  const curKey = monthKey()
  const curB = byMonth[curKey] || { income: 0, expense: 0 }
  const saveRate = curB.income > 0 ? ((curB.income - curB.expense) / curB.income) * 100 : null
  const position = curB.income - curB.expense
  const priorKeys = Object.keys(byMonth).filter(m => m < curKey).sort().slice(-3)
  // Rolling-average comparisons need ≥2 prior months of real data to be meaningful;
  // otherwise a "3-month average" built on a single (possibly auto-seeded) month is
  // noise, so we suppress the drift/vs-average signals rather than mislead.
  const priorRates = priorKeys.map(m => byMonth[m].income > 0 ? (byMonth[m].income - byMonth[m].expense) / byMonth[m].income * 100 : null).filter(v => v != null)
  const avgRate = priorRates.length >= 2 ? priorRates.reduce((a, b) => a + b, 0) / priorRates.length : null
  const rateDrift = saveRate != null && avgRate != null ? saveRate - avgRate : null
  const priorSpend = priorKeys.map(m => byMonth[m].expense).filter(v => v > 0)
  const avgSpend = priorSpend.length >= 2 ? priorSpend.reduce((a, b) => a + b, 0) / priorSpend.length : null
  const spendVsAvg = avgSpend ? ((curB.expense - avgSpend) / avgSpend) * 100 : null

  // ── Currency exposure ───────────────────────────────────────────────────────
  const ukGbp = accounts.filter(a => a.country === 'UK').reduce((s, a) => s + toGbp(latestBalance(snaps[a.id]), a.currency), 0)
  const ukPct = totalGbp > 0 ? (ukGbp / totalGbp) * 100 : 0

  // ── Flags (only the ones we can compute honestly) ───────────────────────────
  const priorDeltas = history.slice(1, -1).map((h, i) => history[i + 1].disp && history[i].disp ? (history[i + 1].disp - history[i].disp) / history[i].disp * 100 : 0)
  const avgDelta = priorDeltas.length ? priorDeltas.reduce((a, b) => a + b, 0) / priorDeltas.length : 0
  const flags = []
  if (deltaPct != null) flags.push(deltaPct >= avgDelta
    ? { title: 'Net worth momentum', ok: true, body: `Up ${deltaPct.toFixed(1)}% since your last snapshot — at or ahead of your recent pace.` }
    : { title: 'Net worth momentum', ok: false, body: `Up ${deltaPct.toFixed(1)}% since last snapshot — slower than your recent average of ${avgDelta.toFixed(1)}%.` })
  if (rateDrift != null) flags.push(Math.abs(rateDrift) < 3
    ? { title: 'Savings rate drift', ok: true, body: `This month's ${saveRate.toFixed(0)}% savings rate is in line with your 3-month average.` }
    : { title: 'Savings rate drift', ok: rateDrift > 0, body: `Savings rate is ${Math.abs(rateDrift).toFixed(0)} pts ${rateDrift > 0 ? 'above' : 'below'} your 3-month average this month.` })
  if (fiYears != null) flags.push({ title: 'FI pace check', ok: true, body: `At current trajectory you reach ${format(convert(NET_WORTH_TARGET_GBP, 'GBP'))} by ~${monthsToLabel(projMonth)}.` })
  if (spendVsAvg != null) flags.push(spendVsAvg <= 15
    ? { title: 'Spend vs average', ok: true, body: `Spending this month is tracking in line with your 3-month average.` }
    : { title: 'Spend vs average', ok: false, body: `Spending this month is ${spendVsAvg.toFixed(0)}% above your 3-month average.` })
  flags.push({ title: 'Currency exposure', ok: ukPct < 90, body: `Net worth is ${ukPct.toFixed(0)}% UK-weighted vs ${(100 - ukPct).toFixed(0)}% AU — worth watching ahead of a UK move.` })

  const card = 'bg-gray-900 border border-gray-800 rounded-lg'

  if (loading) return <div className="text-sm text-gray-600">Loading…</div>

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className={`${card} p-6`}>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-center">
          <div className="lg:col-span-2 min-w-0">
            <div className="text-[11px] font-bold tracking-widest uppercase text-gray-500">Total Net Worth</div>
            <div className="text-4xl font-extrabold text-white mt-1">{format(convert(totalGbp, 'GBP'))}</div>
            {deltaDisp != null && (
              <div className={`text-sm font-semibold mt-1 ${deltaDisp >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {deltaDisp >= 0 ? '▲' : '▼'} {format(Math.abs(deltaDisp))}{deltaPct != null && ` (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%)`} since last snapshot
              </div>
            )}
            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-gray-500">Progress to {format(convert(NET_WORTH_TARGET_GBP, 'GBP'))}</span>
                <span className="text-emerald-400 font-semibold">{pctToTarget.toFixed(1)}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-800 overflow-hidden">
                <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${pctToTarget}%` }} />
              </div>
              {fiYears != null && (
                <div className="text-[11px] text-gray-500 mt-2">At pace, ~{monthsToLabel(projMonth)} ({fiYears} yrs)</div>
              )}
            </div>
          </div>
          <div className="lg:col-span-3 min-w-0 h-40">
            {history.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history} margin={{ top: 6, right: 6, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="nwHero" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis hide domain={['dataMin', 'dataMax']} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#9ca3af' }} formatter={v => [format(v), 'Net worth']} />
                  <Area type="monotone" dataKey="disp" stroke="#34d399" strokeWidth={2.5} fill="url(#nwHero)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center text-sm text-gray-600">Not enough history to chart yet.</div>
            )}
          </div>
        </div>
      </div>

      {/* Snapshot row — always AUD */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={`${card} p-5`}>
          <div className="text-[11px] font-bold tracking-widest uppercase text-gray-500">Savings rate</div>
          <div className="text-2xl font-extrabold text-white mt-1">{saveRate != null ? `${saveRate.toFixed(0)}%` : '—'}</div>
          <div className="text-[11px] mt-1">
            {rateDrift == null ? <span className="text-gray-600">this month</span>
              : <span className={rateDrift >= 0 ? 'text-emerald-400' : 'text-amber-400'}>{rateDrift >= 0 ? '+' : ''}{rateDrift.toFixed(0)} pts vs 3-mo avg</span>}
          </div>
        </div>
        <div className={`${card} p-5`}>
          <div className="text-[11px] font-bold tracking-widest uppercase text-gray-500">FI pace</div>
          <div className="text-2xl font-extrabold text-white mt-1">{fiYears != null ? `${fiYears} yrs` : '—'}</div>
          <div className="text-[11px] text-gray-500 mt-1">to {format(convert(NET_WORTH_TARGET_GBP, 'GBP'))} · ~{monthsToLabel(projMonth)}</div>
        </div>
        <div className={`${card} p-5`}>
          <div className="text-[11px] font-bold tracking-widest uppercase text-gray-500">Budget position</div>
          <div className={`text-2xl font-extrabold mt-1 ${position >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtAud(position)}</div>
          <div className="text-[11px] text-gray-500 mt-1">{fmtAud(curB.income)} in · {fmtAud(curB.expense)} out</div>
        </div>
      </div>

      {/* Flags */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {flags.map(f => (
          <div key={f.title} className={`${card} p-4 border-l-2 ${f.ok ? 'border-l-emerald-400' : 'border-l-amber-400'}`}>
            <div className={`text-[11px] font-bold tracking-widest uppercase ${f.ok ? 'text-emerald-400' : 'text-amber-400'}`}>{f.title}</div>
            <div className="text-[12.5px] text-gray-400 leading-relaxed mt-1.5">{f.body}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
