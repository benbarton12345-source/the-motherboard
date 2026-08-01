// Projection engine — monthly-resolution, nominal, GBP-canonical.
//
// Shared by the Projections page and (later) Overview's FI-pace, so the two can
// never disagree on a crossing date. All math runs in GBP; components convert to
// the display currency at the edge. Horizon is fixed at FI_PROJECTION_YEARS (25).
import { FI_PROJECTION_YEARS, NET_WORTH_TARGET_GBP } from './financeTaxonomy'

export { NET_WORTH_TARGET_GBP }
export const MILESTONES = [250000, 500000, 1000000, 1500000]

// Default assumption set — the primary scenario. Shared by the Projections page
// and Overview's FI-pace so the two can never disagree on a crossing date.
export const DEFAULT_ASSUMPTIONS = { contribution: 1800, growth: 7, salary: 3, inflation: 2.5, advicePct: 70 }

// A scenario's assumptions:
//   contribution — £/month, stepped up each year by `salary`%
//   growth       — % annual return (compounded monthly)
//   salary       — % annual raise applied to the monthly contribution
//   inflation    — % annual (advisory: used for a real-terms readout, not the core path)
//   advicePct    — % of the total attributable to financial-advice income (rest = trading)

// Monthly series from a starting GBP balance. Each element is one calendar month.
export function projectSeries(sc, startGbp, years = FI_PROJECTION_YEARS) {
  const monthlyRate = sc.growth / 100 / 12
  let balance = startGbp
  let contribution = sc.contribution
  let contribAccum = 0
  const series = [{ month: 0, total: balance, contribAccum: 0 }]
  for (let m = 1; m <= years * 12; m++) {
    if (m % 12 === 0) contribution *= 1 + sc.salary / 100
    balance = balance * (1 + monthlyRate) + contribution
    contribAccum += contribution
    series.push({ month: m, total: balance, contribAccum })
  }
  return series
}

// Yearly points (month % 12 === 0) — for chart gridlines/labels; derived from the
// monthly series so it stays in sync.
export function yearlySlice(series) {
  return series.filter(pt => pt.month % 12 === 0)
}

// First month the running total reaches `threshold`, or null if never within horizon.
export function findCrossingMonth(series, threshold) {
  for (const pt of series) if (pt.total >= threshold) return pt.month
  return null
}

// Convert a month offset from today into a "Mon YYYY" label (or a years-away note).
export function monthsToLabel(months, base = new Date()) {
  if (months == null) return 'Beyond horizon'
  const d = new Date(Date.UTC(base.getFullYear(), base.getMonth(), 1))
  d.setUTCMonth(d.getUTCMonth() + Math.round(months))
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

// Reverse: to hit `targetGbp` in `monthsToTarget`, from `startGbp` at `growthPct`,
// what monthly contribution — or what lump sum today (no further contributions) — is needed.
export function reverseCalc(startGbp, growthPct, targetGbp, monthsToTarget) {
  const r = growthPct / 100 / 12
  const growthFactor = Math.pow(1 + r, monthsToTarget)
  const fvFromPV = startGbp * growthFactor
  const remaining = Math.max(0, targetGbp - fvFromPV)
  const annuityFactor = r > 0 ? (growthFactor - 1) / r : monthsToTarget
  return {
    requiredMonthly: annuityFactor > 0 ? remaining / annuityFactor : 0,
    requiredLumpSum: growthFactor > 0 ? remaining / growthFactor : 0,
    alreadyThere: remaining <= 0,
  }
}

// Sensitivity: how many months SOONER the target lands for a single-assumption bump.
export function sensitivity(sc, startGbp, targetGbp, years = FI_PROJECTION_YEARS) {
  const base = findCrossingMonth(projectSeries(sc, startGbp, years), targetGbp) ?? years * 12
  const soonerBy = patch => {
    const mo = findCrossingMonth(projectSeries({ ...sc, ...patch }, startGbp, years), targetGbp) ?? years * 12
    return base - mo // positive = sooner
  }
  return [
    { label: '+£200 / month contribution', months: soonerBy({ contribution: sc.contribution + 200 }) },
    { label: '+1% growth rate', months: soonerBy({ growth: sc.growth + 1 }) },
    { label: '+1% salary growth', months: soonerBy({ salary: sc.salary + 1 }) },
  ]
}
