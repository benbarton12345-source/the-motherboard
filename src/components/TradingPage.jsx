import { useState, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import {
  WIN_RATE_TARGET, RISK_REWARD_TARGET, symbolFor,
  money, signed, price, dstr, monthLabel,
  monthRange, customRange, allTimeRange, inRange,
  stats, curve, axisLabels, marketsByPnl, previousMonthStats, availableMonths,
} from '../utils/tradingAnalytics'

// Trading — read-only analytics over closed trades synced from IG.
// Two views in one page: the period overview, and an instrument drill-down that
// replaces it in place (not a modal) with the period carried over.
//
// Responsive note: the stat row uses wrapping flex items rather than a fixed
// column count, so it falls 5 -> 3 -> 2 up on its own and the final wrapped row
// stretches to fill (grow on every card), which is what stops Max Drawdown
// sitting alone beside dead space.
//
// The basis steps 150px -> 190px at md because one basis cannot produce the
// intended counts at both ends: 2-up at 390px needs <=163px, while 3-up at 768px
// needs >168px, and a flat 150px gives 4-up on a tablet. The step is still a pure
// wrap — no fixed column count, and nothing measured in JS. The trade-count
// column and the rail are media queries too, so first paint is correct.

const GREEN = '#34d399'
const RED = '#f87171'
const card = 'bg-gray-900 border border-gray-800 rounded-lg'
const label = 'text-[11px] font-bold tracking-widest uppercase text-gray-500'

const Chevron = ({ dir = 'right', size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <polyline points={dir === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
  </svg>
)

const TRADES_PER_PAGE = 24

// ── Trend chart ─────────────────────────────────────────────────────────────
// Same treatment as the net-worth hero line: single glowing line, soft gradient
// fill, no gridlines. Adds a dashed zero baseline and five evenly spaced date
// labels, which is what makes a P&L curve readable where a net-worth one doesn't.
function TrendChart({ trades, range, symbol, height, gradientId, labels = [] }) {
  const points = curve(trades, range)
  const cums = points.map(p => p.cum)

  // Pad the domain so the line never runs along the very edge, and keep it
  // non-degenerate: an empty period is all zeroes, which would collapse the axis.
  let lo = Math.min(0, ...cums)
  let hi = Math.max(0, ...cums)
  if (hi === lo) hi = lo + 1
  const pad = (hi - lo) * 0.12

  const t0 = range.a.getTime()
  const t1 = Math.max(range.b.getTime(), t0 + 1)
  // An empty period is drawn neutral: a flat line at zero, but grey, because
  // green would read as a positive result where there is simply no result.
  const isEmpty = trades.length === 0
  const net = cums[cums.length - 1] ?? 0
  const colour = isEmpty ? '#4b5563' : net >= 0 ? GREEN : RED

  return (
    <div className="w-full">
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colour} stopOpacity={isEmpty ? 0 : 0.25} />
              <stop offset="100%" stopColor={colour} stopOpacity={0} />
            </linearGradient>
          </defs>
          {/* Hidden: it fixes the x scale, but the visible labels are the row below. */}
          <XAxis dataKey="t" type="number" scale="time" domain={[t0, t1]} hide />
          <YAxis hide domain={[lo - pad, hi + pad]} />
          <ReferenceLine y={0} stroke="#374151" strokeDasharray="3 3" />
          <Tooltip
            contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#9ca3af' }}
            labelFormatter={t => dstr(new Date(t))}
            formatter={v => [signed(v, symbol), 'Cumulative P&L']}
          />
          <Area type="monotone" dataKey="cum" stroke={colour} strokeWidth={isEmpty ? 1.5 : 2.5}
            fill={`url(#${gradientId})`} isAnimationActive={false} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {labels.length > 0 && (
        <div className="flex justify-between font-mono text-[10px] text-gray-600 mt-1.5 px-1">
          {labels.map((l, i) => <span key={i}>{l}</span>)}
        </div>
      )}
    </div>
  )
}

// ── Stat cards ──────────────────────────────────────────────────────────────

// Plain stat: label, value, one supporting line.
function StatCard({ title, value, valueClass = 'text-white', children }) {
  return (
    <div className={`${card} p-4 grow shrink basis-[150px] md:basis-[190px] min-w-0`}>
      <div className={label}>{title}</div>
      <div className={`font-sans text-2xl font-extrabold mt-1 tabular-nums ${valueClass}`}>{value}</div>
      <div className="text-[11px] text-gray-500 mt-1.5 truncate">{children}</div>
    </div>
  )
}

// Stat graded against a target: adds a progress track and a footer pairing the
// signed delta against the target it is measured on. This is the whole
// "how am I tracking" treatment — there is no separate targets section.
function TargetStatCard({ title, value, pct, delta, deltaOk, target }) {
  return (
    <div className={`${card} p-4 grow shrink basis-[150px] md:basis-[190px] min-w-0`}>
      <div className={label}>{title}</div>
      <div className="font-sans text-2xl font-extrabold text-white mt-1 tabular-nums">{value}</div>
      <div className="h-1.5 w-full rounded-full bg-gray-800 overflow-hidden mt-2.5">
        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: deltaOk ? GREEN : RED }} />
      </div>
      <div className="flex items-center justify-between mt-1.5 text-[11px]">
        <span className={`font-semibold tabular-nums ${deltaOk ? 'text-emerald-400' : 'text-red-400'}`}>{delta}</span>
        <span className="text-gray-500">{target}</span>
      </div>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function TradingPage({ trades = [], loading, syncing, sync, error }) {
  const [period, setPeriod] = useState('month')
  const [month, setMonth] = useState(null)          // { year, month } — resolved below
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [selected, setSelected] = useState(null)    // instrument name, or null
  const [visibleRows, setVisibleRows] = useState(TRADES_PER_PAGE)

  const months = useMemo(() => availableMonths(trades), [trades])

  // Default to the most recent month that has trades; with no data at all, the
  // current month, which renders as an empty period rather than as nothing.
  const now = new Date()
  const fallbackMonth = months.length
    ? months[months.length - 1]
    : { year: now.getUTCFullYear(), month: now.getUTCMonth() }
  const activeMonth = month || fallbackMonth

  // Trade currency comes from IG, not the app's GBP/AUD display toggle: realised
  // P&L is booked in the account's currency and converting it would misstate it.
  const symbol = symbolFor(trades.find(t => t.currency)?.currency)

  const range = useMemo(() => {
    if (period === 'all') return allTimeRange(trades)
    if (period === 'custom' && custom.from && custom.to) return customRange(custom.from, custom.to)
    if (period === 'custom') return allTimeRange(trades)
    return monthRange(activeMonth.year, activeMonth.month)
  }, [period, custom, activeMonth.year, activeMonth.month, trades])

  // One filtered set per period; every metric below is an aggregation over it.
  const periodTrades = useMemo(() => trades.filter(t => inRange(t, range)), [trades, range])
  const s = useMemo(() => stats(periodTrades), [periodTrades])
  const { markets, maxAbs } = useMemo(() => marketsByPnl(periodTrades), [periodTrades])

  const prev = period === 'month'
    ? previousMonthStats(trades, activeMonth.year, activeMonth.month)
    : null

  // Month stepping is clamped to the span of months that actually hold data.
  const first = months[0]
  const last = months[months.length - 1]
  const idx = (m) => m.year * 12 + m.month
  const canPrev = months.length > 0 && idx(activeMonth) > idx(first)
  const canNext = months.length > 0 && idx(activeMonth) < idx(last)
  function stepMonth(delta) {
    const d = new Date(Date.UTC(activeMonth.year, activeMonth.month + delta, 1))
    setMonth({ year: d.getUTCFullYear(), month: d.getUTCMonth() })
    setSelected(null)
  }

  function choosePeriod(p) {
    setPeriod(p)
    setSelected(null) // a period change resets any drill-down
  }

  function openMarket(name) {
    setSelected(name)
    setVisibleRows(TRADES_PER_PAGE)
  }

  if (loading) return <div className="text-sm text-gray-600">Loading…</div>

  // ── Period control ────────────────────────────────────────────────────────
  const periodControl = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center bg-gray-900 border border-gray-800 rounded-lg p-1">
        {[{ id: 'month', label: 'Month' }, { id: 'all', label: 'All time' }, { id: 'custom', label: 'Custom' }].map(t => (
          <button
            key={t.id}
            onClick={() => choosePeriod(t.id)}
            className={`px-3 py-1 text-xs font-bold tracking-widest uppercase rounded-md whitespace-nowrap transition-colors ${
              period === t.id ? 'bg-emerald-400/10 text-emerald-400' : 'text-gray-500 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {period === 'month' && (
        <div className="flex items-center gap-2">
          <button onClick={() => stepMonth(-1)} disabled={!canPrev}
            aria-label="Previous month"
            className="w-7 h-7 rounded-md bg-gray-900 border border-gray-800 text-gray-400 hover:text-white disabled:text-gray-700 disabled:hover:text-gray-700 flex items-center justify-center transition-colors">
            <Chevron dir="left" />
          </button>
          <span className="text-[12.5px] font-semibold text-gray-200 tabular-nums min-w-[72px] text-center">
            {monthLabel(activeMonth.year, activeMonth.month, { month: 'short', year: 'numeric' })}
          </span>
          <button onClick={() => stepMonth(1)} disabled={!canNext}
            aria-label="Next month"
            className="w-7 h-7 rounded-md bg-gray-900 border border-gray-800 text-gray-400 hover:text-white disabled:text-gray-700 disabled:hover:text-gray-700 flex items-center justify-center transition-colors">
            <Chevron dir="right" />
          </button>
        </div>
      )}

      {period === 'custom' && (
        <div className="flex items-center gap-2 text-[12.5px]">
          <input type="date" value={custom.from} onChange={e => { setCustom(c => ({ ...c, from: e.target.value })); setSelected(null) }}
            className="bg-gray-900 border border-gray-800 rounded-md px-2 py-1 text-gray-200 [color-scheme:dark]" />
          <span className="text-gray-600">→</span>
          <input type="date" value={custom.to} onChange={e => { setCustom(c => ({ ...c, to: e.target.value })); setSelected(null) }}
            className="bg-gray-900 border border-gray-800 rounded-md px-2 py-1 text-gray-200 [color-scheme:dark]" />
        </div>
      )}

      <button
        onClick={sync}
        disabled={syncing}
        className="ml-auto px-3 py-1.5 text-xs font-bold tracking-widest uppercase rounded-lg bg-gray-900 border border-gray-800 text-gray-300 hover:text-white hover:border-gray-700 disabled:text-gray-600 transition-colors"
      >
        {syncing ? 'Syncing…' : 'Sync IG'}
      </button>
    </div>
  )

  // ── Drill-down ────────────────────────────────────────────────────────────
  if (selected) {
    const scoped = periodTrades.filter(t => t.instrument_name === selected)
    const ss = stats(scoped)
    const newestFirst = [...scoped].sort((a, b) => new Date(b.close_date) - new Date(a.close_date))
    const shown = newestFirst.slice(0, visibleRows)
    const firstClose = scoped.length ? [...scoped].sort((a, b) => new Date(a.close_date) - new Date(b.close_date))[0].close_date : null
    const lastClose = newestFirst.length ? newestFirst[0].close_date : null

    return (
      <div className="space-y-4">
        {periodControl}

        <button onClick={() => setSelected(null)}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
          <Chevron dir="left" />
          <span className="text-[11px] font-bold tracking-widest uppercase">All markets</span>
          <span className="text-[11px] text-gray-600 ml-1">{range.label}</span>
        </button>

        {/* Header card — instrument, scoped net, equity curve */}
        <div className={`${card} p-6`}>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-center">
            <div className="lg:col-span-2 min-w-0">
              <div className="text-[15px] font-bold text-white truncate">{selected}</div>
              <div className={`${label} mt-3`}>Net P&L</div>
              <div className={`font-sans text-[clamp(1.75rem,4vw,2.5rem)] font-extrabold tracking-tight mt-1 tabular-nums ${ss.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {signed(ss.net, symbol)}
              </div>
              <div className="font-mono text-[11px] text-gray-500 mt-1">
                {ss.n} trades · {ss.wins}W / {ss.losses}L
              </div>
            </div>
            <div className="lg:col-span-3 min-w-0">
              <TrendChart trades={scoped} range={range} symbol={symbol}
                height="clamp(110px,16vw,140px)" gradientId="tradingDetail"
                labels={firstClose ? [dstr(firstClose), dstr(lastClose)] : []} />
            </div>
          </div>
        </div>

        {/* Scoped stats */}
        <div className="flex flex-wrap gap-4">
          <StatCard title="Win rate" value={`${ss.winRate.toFixed(0)}%`}>
            {ss.wins} of {ss.n} · target {WIN_RATE_TARGET}%
          </StatCard>
          <StatCard title="Avg return / trade" value={signed(ss.avg, symbol)}
            valueClass={ss.avg >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            per trade, this market
          </StatCard>
          <StatCard title="Profit factor" value={ss.pf === Infinity ? '∞' : ss.pf.toFixed(2)}>
            {money(ss.gp, symbol)} in · {money(ss.gl, symbol)} out
          </StatCard>
        </div>

        {/* Trade history */}
        <div className={card}>
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className={label}>Trade history</div>
            <div className="text-[11px] text-gray-600">{newestFirst.length} closed</div>
          </div>
          {newestFirst.length === 0 ? (
            <div className="px-5 pb-5 text-sm text-gray-600">No trades on this market in this period.</div>
          ) : (
            <>
              <div className="divide-y divide-gray-800/70">
                {shown.map(t => (
                  <div key={t.deal_id} className="flex items-center gap-3 px-5 py-2.5 text-[12.5px]">
                    <span className="text-gray-400 tabular-nums w-[52px] shrink-0">{dstr(t.close_date)}</span>
                    <span className="font-mono text-[10px] font-bold tracking-wider text-gray-400 border border-gray-700 rounded px-1.5 py-0.5 shrink-0">
                      {t.direction}
                    </span>
                    <span className="text-gray-400 tabular-nums truncate flex-1 min-w-0">
                      {price(Number(t.open_level), t.price_dp)} → {price(Number(t.close_level), t.price_dp)}
                    </span>
                    {/* Null whenever the opening stop could not be recovered from IG's
                        activity history — shown as a dash rather than a fabricated number. */}
                    <span className="text-gray-500 tabular-nums w-[52px] text-right shrink-0">
                      {t.r_multiple == null ? '—' : `${t.r_multiple > 0 ? '+' : '−'}${Math.abs(t.r_multiple).toFixed(1)}R`}
                    </span>
                    <span className={`font-semibold tabular-nums w-20 text-right shrink-0 ${Number(t.pnl) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {signed(Number(t.pnl), symbol)}
                    </span>
                  </div>
                ))}
              </div>
              {visibleRows < newestFirst.length && (
                <button onClick={() => setVisibleRows(v => v + TRADES_PER_PAGE)}
                  className="w-full px-5 py-3 text-[11px] font-bold tracking-widest uppercase text-gray-500 hover:text-white border-t border-gray-800 transition-colors">
                  Load {Math.min(TRADES_PER_PAGE, newestFirst.length - visibleRows)} more
                </button>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Overview ──────────────────────────────────────────────────────────────
  const delta = prev ? s.net - prev.net : null
  const deltaLine = prev
    ? `${delta >= 0 ? '▲' : '▼'} ${money(Math.abs(delta), symbol)} vs ${prev.label}`
    : `${s.n} closed trades · ${dstr(range.a)} – ${dstr(range.b)}`

  const winPct = Math.max(0, Math.min(100, s.winRate))
  const rrPct = Math.max(0, Math.min(100, (s.rr / RISK_REWARD_TARGET) * 100))

  return (
    <div className="space-y-4">
      {periodControl}

      {error && (
        <div className="bg-red-400/10 border border-red-400/30 rounded-lg px-4 py-2.5 text-[12.5px] text-red-300">
          {error}
        </div>
      )}

      {/* Hero */}
      <div className={`${card} p-6`}>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-center">
          <div className="lg:col-span-2 min-w-0">
            <div className={label}>Net P&L · {range.label}</div>
            <div
              className={`font-sans text-[clamp(2.375rem,6vw,4rem)] font-extrabold tracking-tight mt-1 tabular-nums ${s.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
              style={{ textShadow: `0 0 28px ${s.net >= 0 ? 'rgba(52,211,153,.25)' : 'rgba(248,113,113,.25)'}` }}
            >
              {signed(s.net, symbol)}
            </div>
            <div className={`text-sm font-semibold mt-1 ${prev ? (delta >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-gray-500'}`}>
              {deltaLine}
            </div>
            <div className="font-mono text-[11px] text-gray-500 mt-2">
              {s.n} trades · {s.wins}W / {s.losses}L
            </div>
          </div>
          <div className="lg:col-span-3 min-w-0">
            <TrendChart trades={periodTrades} range={range} symbol={symbol}
              height="clamp(150px,22vw,200px)" gradientId="tradingHero"
              labels={axisLabels(range, 5)} />
          </div>
        </div>
      </div>

      {/* Stat row — wrapping flex, ~150px basis: 5-up / 3-up / 2-up, last row stretches */}
      <div className="flex flex-wrap gap-4">
        <TargetStatCard
          title="Win rate"
          value={`${s.winRate.toFixed(0)}%`}
          pct={Math.max(2, winPct)}
          delta={`${s.winRate - WIN_RATE_TARGET >= 0 ? '+' : '−'}${Math.abs(s.winRate - WIN_RATE_TARGET).toFixed(0)} pts`}
          deltaOk={s.winRate >= WIN_RATE_TARGET}
          target={`target ${WIN_RATE_TARGET}%`}
        />
        <StatCard title="Profit factor" value={s.pf === Infinity ? '∞' : s.pf.toFixed(2)}>
          {money(s.gp, symbol)} in · {money(s.gl, symbol)} out
        </StatCard>
        <StatCard title="Avg return / trade" value={signed(s.avg, symbol)}
          valueClass={s.avg >= 0 ? 'text-emerald-400' : 'text-red-400'}>
          across {s.n} closed trades
        </StatCard>
        <TargetStatCard
          title="Risk : reward"
          value={`${s.rr.toFixed(1)} : 1`}
          pct={Math.max(2, rrPct)}
          delta={`${s.rr - RISK_REWARD_TARGET >= 0 ? '+' : '−'}${Math.abs(s.rr - RISK_REWARD_TARGET).toFixed(1)}`}
          deltaOk={s.rr >= RISK_REWARD_TARGET}
          target={`target ${RISK_REWARD_TARGET} : 1`}
        />
        {/* Deliberately plain: drawdown is a fact about the period, not a warning. */}
        <StatCard title="Max drawdown" value={money(s.dd, symbol)}>
          {s.peakAt ? `peak ${dstr(s.peakAt)} → trough ${dstr(s.ddAt)}` : 'no drawdown in period'}
        </StatCard>
      </div>

      {/* Markets by P&L */}
      <div className={card}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className={label}>Markets by P&L</div>
          <div className="text-[11px] text-gray-600">tap to drill in</div>
        </div>
        {markets.length === 0 ? (
          <div className="px-5 pb-5 text-sm text-gray-600">No closed trades in this period.</div>
        ) : (
          <div className="divide-y divide-gray-800/70">
            {markets.map(m => (
              <button key={m.name} onClick={() => openMarket(m.name)}
                className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-white/[0.03] transition-colors">
                <span className="text-[13px] font-medium text-white truncate flex-1 min-w-0">{m.name}</span>
                {/* Trade count is a media query, never a measured width. */}
                <span className="hidden min-[900px]:inline font-mono text-[10.5px] text-gray-600 tabular-nums w-12 text-right shrink-0">
                  {m.count} tr
                </span>
                <span className="hidden sm:block w-[22%] max-w-[160px] h-1.5 rounded-full bg-gray-800 overflow-hidden shrink-0">
                  <span className="block h-1.5 rounded-full"
                    style={{ width: `${Math.max(3, (Math.abs(m.net) / maxAbs) * 100)}%`, background: m.net >= 0 ? GREEN : RED }} />
                </span>
                <span className={`text-[13px] font-semibold tabular-nums w-24 text-right shrink-0 ${m.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {signed(m.net, symbol)}
                </span>
                <span className="text-gray-600 shrink-0"><Chevron /></span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
