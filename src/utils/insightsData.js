// Budgeting Insights — pure aggregation & calculation helpers.
// No DB, no React. Everything is derived from live Supabase rows passed in:
//   entries  — budget_entries rows (multi-month window)
//   recItems — recurring_items rows
//   snaps    — net_worth_snapshots rows
// A `conv(amount, currency)` function (from CurrencyContext) converts every
// figure into the active display currency so all maths is done in one unit.
//
// SCHEMA NOTE: the statement import (Build 1) persists per-category MONTHLY
// aggregates plus individual one-off rows — it does NOT retain per-transaction
// dates or per-merchant lines for the bulk of a category. So:
//   • "forecast" for a variable category is a trailing 3-month average
//     (there is no stored per-category budget), one-offs excluded.
//   • merchant breakdown can only surface one-off rows + an aggregated remainder.
//   • daily spending velocity is approximated linearly (no per-day data exists).
// These limits are surfaced in the UI rather than faked.

// Spending categories (variable) — recurring/rent live under category 'Recurring'
// and are handled separately as the fixed bucket.
export const SPENDING_CATEGORIES = [
  'Groceries', 'Eating Out', 'Transport', 'Subscriptions', 'Utilities',
  'Health & Wellness', 'Personal Care', 'Clothing & Retail', 'Entertainment',
  'Vehicle', 'Miscellaneous',
]

// Needs vs Wants buckets (Vehicle & Miscellaneous are unclassified → excluded).
export const NEEDS_CATEGORIES = ['Groceries', 'Utilities', 'Transport', 'Health & Wellness']
export const WANTS_CATEGORIES = ['Eating Out', 'Entertainment', 'Clothing & Retail', 'Personal Care', 'Subscriptions']

const FIXED_CATEGORIES = new Set(['Recurring', 'Rent'])

// ── Month key helpers (keys are first-of-month ISO 'YYYY-MM-01') ─────
export function monthKeyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return monthKeyOf(d)
}
export function monthLabel(key, opts = { month: 'short', year: '2-digit' }) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', opts)
}
// N month keys ending at `endKey` (inclusive), oldest first.
export function lastNMonths(endKey, n) {
  const out = []
  for (let i = n - 1; i >= 0; i--) out.push(addMonths(endKey, -i))
  return out
}
export function daysInMonth(key) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

const money = (e, conv) => conv(parseFloat(e.amount) || 0, e.currency || 'GBP')

// ── Per-category × per-month matrix ──────────────────────────────────
// matrix[category][monthKey] = { all, exOneOff, oneOff }
export function categoryMatrix(entries, conv) {
  const matrix = {}
  for (const e of entries) {
    if (e.type !== 'expense') continue
    if (FIXED_CATEGORIES.has(e.category)) continue
    const cat = e.category
    const key = e.month
    matrix[cat] ||= {}
    const cell = (matrix[cat][key] ||= { all: 0, exOneOff: 0, oneOff: 0 })
    const v = money(e, conv)
    cell.all += v
    if (e.one_off) cell.oneOff += v
    else cell.exOneOff += v
  }
  return matrix
}

export function catCell(matrix, cat, month) {
  return matrix[cat]?.[month] || { all: 0, exOneOff: 0, oneOff: 0 }
}

// Trailing average of a category over the `n` months BEFORE `month`,
// excluding one-offs. Only months that actually have data count toward the
// denominator so sparse early history doesn't drag the average to zero.
export function trailingAvg(matrix, cat, month, n = 3) {
  return trailingStats(matrix, cat, month, n).avg
}
// avg + how many of the trailing months actually had data (a real baseline).
export function trailingStats(matrix, cat, month, n = 3) {
  let sum = 0, count = 0
  for (let i = 1; i <= n; i++) {
    const k = addMonths(month, -i)
    const cell = matrix[cat]?.[k]
    if (cell && (cell.exOneOff > 0 || cell.all > 0)) { sum += cell.exOneOff; count++ }
  }
  return { avg: count ? sum / count : 0, count }
}

// ── Per-month totals (income / expense / net) ────────────────────────
// includes one-offs — this is real cashflow.
export function monthTotals(entries, conv) {
  const t = {}
  for (const e of entries) {
    const key = e.month
    const row = (t[key] ||= { income: 0, expense: 0, reimbursements: 0, oneOff: 0, fixed: 0, variable: 0 })
    const v = money(e, conv)
    if (e.type === 'income') {
      row.income += v
      if (e.category === 'Reimbursements') row.reimbursements += v
    } else if (e.type === 'expense') {
      row.expense += v
      if (FIXED_CATEGORIES.has(e.category)) row.fixed += v
      else row.variable += v
      if (e.one_off) row.oneOff += v
    }
  }
  for (const key of Object.keys(t)) t[key].net = t[key].income - t[key].expense
  return t
}

// ── Waterfall series (income → rent/fixed → variable desc → net) ─────
export function waterfallData(entries, conv, month) {
  const totals = monthTotals(entries, conv)[month] || { income: 0, fixed: 0 }
  const matrix = categoryMatrix(entries, conv)
  const income = totals.income
  const fixed = totals.fixed

  const bars = []
  let running = 0
  bars.push({ name: 'Income', kind: 'income', value: income, start: 0, end: income })
  running = income
  if (fixed > 0) {
    bars.push({ name: 'Rent', kind: 'rent', value: fixed, start: running - fixed, end: running })
    running -= fixed
  }
  // variable categories, largest first
  const varCats = SPENDING_CATEGORIES
    .map(cat => ({ cat, amt: catCell(matrix, cat, month).all }))
    .filter(x => x.amt > 0)
    .sort((a, b) => b.amt - a.amt)
  for (const { cat, amt } of varCats) {
    bars.push({ name: cat, kind: bucketKind(cat), value: amt, start: running - amt, end: running })
    running -= amt
  }
  bars.push({ name: 'Net', kind: running >= 0 ? 'net-pos' : 'net-neg', value: running, start: Math.min(0, running), end: Math.max(0, running) })
  return { bars, income, net: running }
}

function bucketKind(cat) {
  if (WANTS_CATEGORIES.includes(cat)) return 'want'
  if (NEEDS_CATEGORIES.includes(cat)) return 'need'
  return 'other'
}

// ── Forecast vs Actual (variable categories, ranked by overspend) ────
// forecast = trailing 3-mo avg (ex one-off); actual = this month ex one-off.
export function forecastVsActual(entries, conv, month) {
  const matrix = categoryMatrix(entries, conv)
  const rows = []
  for (const cat of SPENDING_CATEGORIES) {
    const actual = catCell(matrix, cat, month).exOneOff
    const forecast = trailingAvg(matrix, cat, month, 3)
    if (actual === 0 && forecast === 0) continue
    const variance = actual - forecast
    const pct = forecast > 0 ? (variance / forecast) * 100 : (actual > 0 ? 100 : 0)
    rows.push({ cat, actual, forecast, variance, pct })
  }
  rows.sort((a, b) => b.variance - a.variance)
  return rows
}

// ── Merchant breakdown for one category/month ────────────────────────
// Only one-off rows carry a merchant (notes: 'statement-import: <merchant>').
// The bulk is a single aggregated row → shown as one "aggregated" remainder.
export function merchantBreakdown(entries, conv, month, cat) {
  const rows = entries.filter(e => e.type === 'expense' && e.category === cat && e.month === month)
  const items = []
  let aggregated = 0
  for (const e of rows) {
    const v = money(e, conv)
    const m = /^statement-import:\s*(.+)$/i.exec(e.notes || '')
    if (e.one_off && m) items.push({ merchant: m[1], amount: v, oneOff: true })
    else if (m) items.push({ merchant: m[1], amount: v, oneOff: false })
    else aggregated += v
  }
  if (aggregated > 0) items.push({ merchant: `${cat} (aggregated at import)`, amount: aggregated, aggregated: true })
  items.sort((a, b) => b.amount - a.amount)
  const total = items.reduce((s, i) => s + i.amount, 0)
  return { items, total }
}

// ── Savings rate + 6-month history ───────────────────────────────────
export function savingsSeries(entries, conv, months) {
  const totals = monthTotals(entries, conv)
  return months.map(key => {
    const t = totals[key] || { income: 0, net: 0 }
    const rate = t.income > 0 ? t.net / t.income : null
    return { month: key, income: t.income, net: t.net, rate }
  })
}

// ── Month health score (1–10) ───────────────────────────────────────
// savings rate vs target (50%) + one-off share (25%) + forecast accuracy (25%)
export function healthScore(entries, conv, month, savingsTarget) {
  const totals = monthTotals(entries, conv)[month] || { income: 0, net: 0, expense: 0, oneOff: 0 }
  const rate = totals.income > 0 ? totals.net / totals.income : 0
  const sRate = clamp(rate / (savingsTarget || 0.45), 0, 1)

  const oneOffShare = totals.expense > 0 ? totals.oneOff / totals.expense : 0
  const sOneOff = 1 - clamp(oneOffShare / 0.3, 0, 1)

  const fva = forecastVsActual(entries, conv, month).filter(r => r.forecast > 0)
  let sForecast = 1
  if (fva.length) {
    const avgErr = fva.reduce((s, r) => s + Math.abs(r.variance) / r.forecast, 0) / fva.length
    sForecast = 1 - clamp(avgErr, 0, 1)
  }

  const score01 = 0.5 * sRate + 0.25 * sOneOff + 0.25 * sForecast
  const score = Math.max(1, Math.min(10, Math.round(score01 * 10)))
  const grade = score >= 9 ? 'A' : score >= 7 ? 'B' : score >= 5 ? 'C' : score >= 3 ? 'D' : 'F'
  const label = score >= 8 ? 'Strong month' : score >= 5 ? 'Average month' : 'Tough month'

  // dominant driver for the one-line explanation
  const parts = [
    { k: 'savings', s: sRate, txt: rate >= (savingsTarget || 0.45) ? `saving ${(rate * 100).toFixed(0)}% beats your ${((savingsTarget || 0.45) * 100).toFixed(0)}% target` : `saving ${(rate * 100).toFixed(0)}% vs ${((savingsTarget || 0.45) * 100).toFixed(0)}% target` },
    { k: 'oneoff', s: sOneOff, txt: `one-off spend was ${(oneOffShare * 100).toFixed(0)}% of outgoings` },
    { k: 'forecast', s: sForecast, txt: sForecast > 0.8 ? 'spending tracked close to your recent average' : 'several categories drifted from their recent average' },
  ]
  const weakest = parts.slice().sort((a, b) => a.s - b.s)[0]
  const note = score >= 7 ? parts[0].txt.charAt(0).toUpperCase() + parts[0].txt.slice(1) : `Mainly ${weakest.txt}.`

  return { score, grade, label, rate, note, components: { sRate, sOneOff, sForecast } }
}

// ── Needs vs Wants ──────────────────────────────────────────────────
export function needsWants(matrix, month) {
  let needs = 0, wants = 0
  for (const c of NEEDS_CATEGORIES) needs += catCell(matrix, c, month).all
  for (const c of WANTS_CATEGORIES) wants += catCell(matrix, c, month).all
  const denom = needs + wants
  return { needs, wants, needsPct: denom > 0 ? needs / denom : 0, wantsPct: denom > 0 ? wants / denom : 0, denom }
}
export function needsWantsTrend(matrix, months) {
  return months.map(m => ({ month: m, ...needsWants(matrix, m) }))
}

// ── Category trend classification (small multiples) ──────────────────
// compares last-3-mo avg vs previous-3-mo avg (>8% → rising/falling).
export function trendDirection(series) {
  const vals = series.map(p => p.value)
  const n = vals.length
  if (n < 4) return 'flat'
  const recent = avg(vals.slice(-3))
  const prev = avg(vals.slice(-6, -3))
  if (prev === 0) return recent > 0 ? 'up' : 'flat'
  const chg = (recent - prev) / prev
  if (chg > 0.08) return 'up'
  if (chg < -0.08) return 'down'
  return 'flat'
}

// ── Unusual spend callouts (>20% above trailing 3-mo avg, ex one-off) ─
export function unusualSpend(entries, conv, month) {
  const matrix = categoryMatrix(entries, conv)
  const out = []
  for (const cat of SPENDING_CATEGORIES) {
    const actual = catCell(matrix, cat, month).exOneOff
    const { avg: avg3, count } = trailingStats(matrix, cat, month, 3)
    // Need a real baseline: at least 2 prior months of data, else the % is noise.
    if (avg3 <= 0 || actual <= 0 || count < 2) continue
    const pct = ((actual - avg3) / avg3) * 100
    if (pct > 20) out.push({ cat, actual, avg: avg3, pct, severity: pct > 40 ? 'high' : 'medium' })
    else if (pct < -20) out.push({ cat, actual, avg: avg3, pct, severity: 'good' })
  }
  // overspends first (desc), then good news
  out.sort((a, b) => b.pct - a.pct)
  return out
}

// ── Subscription spend creep + linear trend ──────────────────────────
export function subscriptionCreep(matrix, months) {
  const points = months.map(m => ({ month: m, value: catCell(matrix, 'Subscriptions', m).all }))
  const withData = points.filter(p => p.value > 0)
  const { slope, intercept } = linreg(points.map((p, i) => [i, p.value]))
  const trend = points.map((p, i) => ({ month: p.month, value: intercept + slope * i }))
  const first = withData[0]?.value ?? 0
  const last = withData[withData.length - 1]?.value ?? 0
  // Only call it a trend with at least 3 real data points.
  const rising = withData.length >= 3 && slope > 0.5 && last > first
  return { points, trend, rising, deltaPerMonth: slope, increase: last - first }
}

// ── One-off items across the window (timeline) ───────────────────────
export function oneOffTimeline(entries, conv) {
  return entries
    .filter(e => e.one_off && e.type === 'expense')
    .map(e => {
      const m = /^statement-import:\s*(.+)$/i.exec(e.notes || '')
      return { month: e.month, category: e.category, merchant: m ? m[1] : e.category, amount: money(e, conv) }
    })
    .sort((a, b) => a.month.localeCompare(b.month))
}

// ── Spending velocity (approximate — no per-day data persisted) ──────
// Linear cumulative 0→total across the month vs forecast pace.
export function spendingVelocity(entries, conv, month, forecastTotal) {
  const totals = monthTotals(entries, conv)[month] || { variable: 0, fixed: 0 }
  const actualTotal = totals.variable // variable spend only, matches the pace comparison
  const days = daysInMonth(month)
  const pts = []
  for (let d = 1; d <= days; d++) {
    const frac = d / days
    pts.push({ day: d, actual: actualTotal * frac, budget: forecastTotal * frac })
  }
  return { points: pts, actualTotal, budgetTotal: forecastTotal, days }
}

// ── FI trajectory + projection ───────────────────────────────────────
// actual line = net-worth history from snapshots (real data);
// projected = current NW extended at monthlySavings; required = linear to target.
export function netWorthAtMonth(snaps, conv, monthKey) {
  // latest snapshot on/before the last day of that month
  const [y, m] = monthKey.split('-').map(Number)
  const endOfMonth = new Date(y, m, 0)
  let best = null
  for (const s of snaps) {
    const d = new Date(s.date)
    if (d <= endOfMonth && (!best || d > new Date(best.date))) best = s
  }
  return best ? conv(best.total, 'GBP') : null
}

export function fiTrajectory({ snaps, conv, months, monthlySavings, fiTarget, monthsToTarget, currentNW }) {
  const targetDisp = conv(fiTarget, 'GBP')
  // Actual (history): net worth at each month in window
  const actual = months.map((mk, i) => ({ i, month: mk, actual: netWorthAtMonth(snaps, conv, mk) }))
  const anchorIdx = months.length - 1
  const horizon = Math.max(24, Math.ceil(monthsToTarget) + 6)
  // Projected + required extend forward from the anchor (today)
  const forward = []
  for (let k = 0; k <= horizon; k++) {
    const projected = currentNW + monthlySavings * k
    const required = monthsToTarget > 0 ? currentNW + (targetDisp - currentNW) * (k / monthsToTarget) : targetDisp
    forward.push({ i: anchorIdx + k, projected, required: Math.min(required, targetDisp) })
  }
  return { actual, forward, anchorIdx, targetDisp, horizon }
}

// ── small maths ──────────────────────────────────────────────────────
export function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)) }
function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0 }
function linreg(pairs) {
  const n = pairs.length
  if (!n) return { slope: 0, intercept: 0 }
  let sx = 0, sy = 0, sxy = 0, sxx = 0
  for (const [x, y] of pairs) { sx += x; sy += y; sxy += x * y; sxx += x * x }
  const denom = n * sxx - sx * sx
  const slope = denom ? (n * sxy - sx * sy) / denom : 0
  const intercept = (sy - slope * sx) / n
  return { slope, intercept }
}
