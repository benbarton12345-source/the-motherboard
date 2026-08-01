// Net Worth — pure helpers for the per-account snapshot model.
// Balances are stored in each account's native currency; conversion to the
// display currency happens in the components via CurrencyContext.

// Latest (most recent dated) balance from an ascending-sorted history, native ccy.
export function latestBalance(history) {
  if (!history || history.length === 0) return 0
  return Number(history[history.length - 1].balance) || 0
}

// Build an SVG polyline `d` for a mini sparkline from a numeric series.
// Flat line for a single point; empty string for none.
export function sparkPath(values, w = 100, h = 28, pad = 3) {
  if (!values || values.length === 0) return ''
  if (values.length === 1) return `M0 ${h / 2} L${w} ${h / 2}`
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const step = w / (values.length - 1)
  return values
    .map((v, i) => {
      const x = i * step
      const y = pad + (h - 2 * pad) * (1 - (v - min) / range)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

// Group a flat account_snapshots list into { [account_id]: [rows asc by date] }.
export function groupSnapshots(rows) {
  const by = {}
  for (const r of rows) (by[r.account_id] ||= []).push(r)
  for (const id in by) by[id].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
  return by
}
