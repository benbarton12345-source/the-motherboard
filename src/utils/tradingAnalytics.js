// Trading analytics — period maths for the Trading page.
//
// Every metric on the page is an aggregation over one array of closed trades, so
// they are computed together in `stats()` from a single pass rather than fetched
// or derived separately. The page queries once per period and reuses the result
// for the overview, and again (filtered) for the instrument drill-down.

// ── Config ──────────────────────────────────────────────────────────────────
// Personal targets, not derived from the data. They live here rather than in the
// view so the numbers the page grades against are in one place.
export const WIN_RATE_TARGET = 60   // %
export const RISK_REWARD_TARGET = 2 // :1

const CURRENCY_SYMBOLS = { GBP: '£', USD: '$', EUR: '€', AUD: 'A$', JPY: '¥' }
export const symbolFor = code => CURRENCY_SYMBOLS[code] || '£'

// ── Formatting ──────────────────────────────────────────────────────────────
const MINUS = '−' // U+2212, not a hyphen: aligns with digits in the display face

// Whole units is the house style, but a non-zero amount must never render as 0 —
// on small stakes a winning trade would read as "+£0", which looks broken. Below
// one unit we show two decimals instead.
function amount(v) {
  const a = Math.abs(v)
  return a > 0 && a < 1
    ? a.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Math.round(a).toLocaleString('en-GB')
}

export function money(v, symbol = '£') {
  return `${v < 0 ? MINUS : ''}${symbol}${amount(v)}`
}

export function signed(v, symbol = '£') {
  const sign = v > 0 ? '+' : v < 0 ? MINUS : ''
  return `${sign}${symbol}${amount(v)}`
}

export function price(v, dp = 2) {
  if (v == null) return '—'
  return v.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

export function dstr(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })
}

export function monthLabel(year, month, opts = { month: 'long', year: 'numeric' }) {
  return new Date(Date.UTC(year, month, 1)).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' })
}

// ── Period ──────────────────────────────────────────────────────────────────
// A period is always a closed [a, b] interval filtered on *close* date: a trade
// belongs to the period in which it was realised, regardless of when it opened.

export function monthRange(year, month) {
  return {
    a: new Date(Date.UTC(year, month, 1)),
    b: new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999)),
    label: monthLabel(year, month),
  }
}

export function customRange(from, to) {
  const a = new Date(`${from}T00:00:00Z`)
  const b = new Date(`${to}T23:59:59Z`)
  return { a, b, label: `${dstr(a)} – ${dstr(b)}` }
}

export function allTimeRange(trades) {
  const dates = trades.map(t => new Date(t.close_date).getTime()).filter(n => !Number.isNaN(n))
  const a = dates.length ? new Date(Math.min(...dates)) : new Date()
  const b = dates.length ? new Date(Math.max(...dates)) : new Date()
  return { a, b, label: 'All time' }
}

export function inRange(trade, range) {
  const t = new Date(trade.close_date).getTime()
  return t >= range.a.getTime() && t <= range.b.getTime()
}

// ── Metrics ─────────────────────────────────────────────────────────────────

// Wins are strictly positive; scratch trades (exactly 0) count as losses, which
// is what makes win rate and profit factor agree with each other.
export function stats(trades) {
  const ts = [...trades].sort((x, y) => new Date(x.close_date) - new Date(y.close_date))
  const n = ts.length
  const wins = ts.filter(t => Number(t.pnl) > 0)
  const losses = ts.filter(t => Number(t.pnl) <= 0)

  const gross = list => list.reduce((s, t) => s + Number(t.pnl), 0)
  const gp = gross(wins)
  const gl = Math.abs(gross(losses))
  const net = gp - gl

  const avgWin = wins.length ? gp / wins.length : 0
  const avgLoss = losses.length ? gl / losses.length : 0

  // Max drawdown: the largest peak-to-trough fall of the cumulative curve. The
  // peak starts at 0 (the period opens flat), and we record where the run-up
  // peaked as well as where it bottomed so the card can name both dates.
  let peak = 0, cum = 0, dd = 0, ddAt = null, peakAt = null, runningPeakAt = null
  for (const t of ts) {
    cum += Number(t.pnl)
    if (cum > peak) { peak = cum; runningPeakAt = t.close_date }
    if (peak - cum > dd) { dd = peak - cum; ddAt = t.close_date; peakAt = runningPeakAt }
  }

  return {
    n, net, gp, gl,
    wins: wins.length,
    losses: losses.length,
    winRate: n ? (wins.length / n) * 100 : 0,
    // No losses at all is an undefined ratio, not a huge one — flagged rather than faked.
    pf: gl ? gp / gl : gp > 0 ? Infinity : 0,
    avg: n ? net / n : 0,
    rr: avgLoss ? avgWin / avgLoss : 0,
    dd, ddAt, peakAt,
  }
}

// Cumulative P&L points for the trend chart. Starts at zero on the period's own
// left edge so the line always spans the full width, and an empty period
// collapses to a flat zero baseline instead of an absent chart.
export function curve(trades, range) {
  const ts = [...trades].sort((x, y) => new Date(x.close_date) - new Date(y.close_date))
  const start = { t: range.a.getTime(), cum: 0 }

  if (!ts.length) return [start, { t: range.b.getTime(), cum: 0 }]

  let cum = 0
  const points = ts.map(t => {
    cum += Number(t.pnl)
    return { t: new Date(t.close_date).getTime(), cum }
  })
  return [start, ...points]
}

// Five evenly spaced date labels for under the chart. Rendered as their own row
// rather than as axis ticks so the first sits flush left and the last flush right,
// instead of being centred on the plot edge and clipped.
export function axisLabels(range, count = 5) {
  const t0 = range.a.getTime()
  const t1 = Math.max(range.b.getTime(), t0 + 1)
  return Array.from({ length: count }, (_, i) => dstr(new Date(t0 + (t1 - t0) * (i / (count - 1)))))
}

// Instruments ranked by net P&L, with the bar scale the list is drawn against.
export function marketsByPnl(trades) {
  const byName = {}
  for (const t of trades) (byName[t.instrument_name] ||= []).push(t)

  const markets = Object.entries(byName)
    .map(([name, ts]) => ({ name, trades: ts, count: ts.length, net: ts.reduce((s, t) => s + Number(t.pnl), 0) }))
    .sort((x, y) => y.net - x.net)

  // Bars are scaled to the largest *absolute* P&L so a big loser reads as loud as
  // a big winner. Floored at 1 so an all-zero period cannot divide by zero.
  const maxAbs = Math.max(1, ...markets.map(m => Math.abs(m.net)))
  return { markets, maxAbs }
}

// The same calendar month one year's worth of stepping back, for the hero's
// month-over-month delta. Returns null outside month periods or with no prior data.
export function previousMonthStats(trades, year, month) {
  const prev = monthRange(year, month - 1)
  const ts = trades.filter(t => inRange(t, prev))
  if (!ts.length) return null
  return { net: stats(ts).net, label: monthLabel(prev.a.getUTCFullYear(), prev.a.getUTCMonth(), { month: 'long' }) }
}

// Months that actually contain trades, oldest first — the month stepper clamps to these.
export function availableMonths(trades) {
  const keys = new Set()
  for (const t of trades) {
    const d = new Date(t.close_date)
    if (!Number.isNaN(d.getTime())) keys.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}`)
  }
  return [...keys]
    .map(k => { const [y, m] = k.split('-').map(Number); return { year: y, month: m } })
    .sort((x, y) => x.year - y.year || x.month - y.month)
}
