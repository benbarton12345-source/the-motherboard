// ── Insights computations ───────────────────────────────────────────────────
// Cross-metric analysis over data already live in Daily Metrics + Nutrition
// (+ Training sessions). Each function returns a low-data guard so the UI can
// swap to a muted caption below the minimum sample size, per the brief.
import {
  lastNDates, dayAdherenceStatus, rollingBaseline, avg, avgField,
  clamp, slope, getWeekDatesForOffset,
} from './healthHelpers'

const KCAL_PER_KG = 7700 // energy density of body-mass change

// Minimum sample sizes (days) before a card is considered reliable.
export const MIN = { maintenance: 14, readiness: 14, debt: 14, overlay: 14, correlation: 14 }

// Per-date meal totals map from the full meal list.
export function mealsByDate(meals) {
  const map = {}
  for (const m of meals) {
    const t = (map[m.date] ||= { kcal: 0, protein: 0, carbs: 0, fat: 0, count: 0 })
    t.kcal += m.kcal || 0; t.protein += m.protein_g || 0; t.carbs += m.carbs_g || 0; t.fat += m.fat_g || 0; t.count++
  }
  return map
}

function latest(rowsDesc, field) {
  const r = rowsDesc.find(x => x?.[field] != null)
  return r ? r[field] : null
}

// ── 1. Maintenance calorie estimator (21-day rolling) ───────────────────────
export function maintenanceEstimate(meals, weightLogs, appleHealthLogs) {
  const WINDOW = 21
  const dates = lastNDates(WINDOW)
  const byDate = mealsByDate(meals)

  const calIns = dates.map(d => byDate[d]?.count ? byDate[d].kcal : null).filter(v => v != null)
  const calInAvg = avg(calIns)
  const daysLogged = calIns.length

  const cutoff = dates[0]
  const winWeights = [...weightLogs]
    .filter(l => l.date >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date))
  const activeAvg = avgField(appleHealthLogs.slice(0, WINDOW), 'active_calories')

  if (daysLogged < MIN.maintenance || winWeights.length < 2) {
    return { available: false, daysLogged, weightDays: winWeights.length }
  }

  // Weight trend via least-squares over day-index within the window (kg/day).
  const first = winWeights[0].date
  const idx = winWeights.map(l => {
    const [y, m, d] = l.date.split('-').map(Number)
    const [fy, fm, fd] = first.split('-').map(Number)
    return Math.round((new Date(y, m - 1, d) - new Date(fy, fm - 1, fd)) / 86400000)
  })
  const kgPerDay = slope(winWeights.map(l => l.weight_kg)) // slope over ordered entries ≈ per-entry
  // Prefer a true per-day slope when we have spread-out dates.
  const spanDays = idx[idx.length - 1] - idx[0]
  const deltaKg = winWeights[winWeights.length - 1].weight_kg - winWeights[0].weight_kg
  const perDay = spanDays > 0 ? deltaKg / spanDays : kgPerDay

  const maintenance = Math.round(calInAvg - perDay * KCAL_PER_KG)
  const confidence = daysLogged >= WINDOW ? 'high' : 'moderate'

  return {
    available: true,
    maintenance,
    calInAvg: Math.round(calInAvg),
    activeAvg: activeAvg != null ? Math.round(activeAvg) : null,
    weightTrendPerWeek: Math.round(perDay * 7 * 10) / 10,
    daysLogged,
    confidence,
    window: WINDOW,
  }
}

// ── 2. Recovery readiness score (equal-weighted, normalised) ────────────────
export function readinessScore(appleHealthLogs) {
  const hrv = latest(appleHealthLogs, 'hrv_ms')
  const rhr = latest(appleHealthLogs, 'resting_hr')
  const sleepMin = latest(appleHealthLogs, 'sleep_minutes')

  const daysWithData = appleHealthLogs.filter(r => r.hrv_ms != null || r.resting_hr != null || r.sleep_minutes != null).length
  if (daysWithData < MIN.readiness || hrv == null || rhr == null || sleepMin == null) {
    return { available: false, daysWithData }
  }

  const hrvBase = rollingBaseline(appleHealthLogs, 'hrv_ms', 30)
  const rhrBase = rollingBaseline(appleHealthLogs, 'resting_hr', 30)
  const sleepBase = rollingBaseline(appleHealthLogs, 'sleep_minutes', 30)
  const sleepH = sleepMin / 60, sleepBaseH = sleepBase / 60

  // Normalise each delta by its typical daily variation, clamp to [-1, 1].
  // RHR is inverted (lower is better). Equal weight — simple average.
  const hrvN = clamp((hrv - hrvBase) / 15, -1, 1)
  const rhrN = clamp(-(rhr - rhrBase) / 6, -1, 1)
  const sleepN = clamp((sleepH - sleepBaseH) / 1, -1, 1)
  const avgN = (hrvN + rhrN + sleepN) / 3
  const score = Math.round(clamp(60 + 40 * avgN, 0, 100))

  const status = score >= 80 ? 'good' : score >= 60 ? 'warn' : 'bad'
  const label = score >= 80 ? 'Green' : score >= 60 ? 'Amber' : 'Red'

  const dHrv = hrv - hrvBase, dRhr = rhr - rhrBase, dSleep = sleepH - sleepBaseH
  const factors = [
    { label: 'HRV vs baseline', value: `${dHrv >= 0 ? '+' : '−'}${Math.abs(Math.round(dHrv))} ms`, favorable: dHrv >= 0 },
    { label: 'Resting HR vs baseline', value: `${dRhr >= 0 ? '+' : '−'}${Math.abs(Math.round(dRhr))} bpm`, favorable: dRhr <= 0 },
    { label: 'Sleep vs baseline', value: `${dSleep >= 0 ? '+' : '−'}${Math.abs(dSleep).toFixed(1)} h`, favorable: dSleep >= 0 },
  ]
  return { available: true, score, status, label, factors }
}

// ── 3. Training load vs recovery correlation ────────────────────────────────
// Pairs a training day with the *next* day's HRV. Almost always low-data.
export function trainingRecovery(sessions, appleHealthLogs) {
  const ahByDate = {}
  for (const r of appleHealthLogs) ahByDate[r.date] = r
  const cutoff = lastNDates(28)[0]

  const recent = sessions.filter(s => s.performed_date >= cutoff)
  const paired = []
  for (const s of recent) {
    const next = shift(s.performed_date, 1)
    const ah = ahByDate[next]
    if (ah && ah.hrv_ms != null) {
      paired.push({ date: s.performed_date, intensity: s.session_rating ?? s.energy_rating ?? null, nextHrv: ah.hrv_ms })
    }
  }
  const sessionsCount = recent.length
  if (paired.length < MIN.correlation) {
    return { available: false, sessionsCount, pairedDays: paired.length }
  }
  return {
    available: true,
    sessionsCount,
    pairedDays: paired.length,
    series: paired.sort((a, b) => a.date.localeCompare(b.date)).map(p => ({ label: p.date.slice(5), v: p.nextHrv })),
  }
}
function shift(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

// ── 4. Sleep debt tracker (cumulative vs target, 14-day rolling) ────────────
export function sleepDebt(appleHealthLogs, targetHours = 8) {
  const nights = [...appleHealthLogs]
    .filter(r => r.sleep_minutes != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14)
  if (nights.length < MIN.debt) return { available: false, nights: nights.length }

  const targetMin = targetHours * 60
  let cum = 0
  const series = nights.map(n => {
    cum += n.sleep_minutes - targetMin
    return { label: n.date.slice(5), cum: Math.round(cum) }
  })
  return { available: true, netMinutes: Math.round(cum), series, nights: nights.length }
}

// ── 5. Macro adherence vs weight trend overlay (14-day) ─────────────────────
export function adherenceWeightOverlay(meals, weightLogs, targets) {
  const dates = lastNDates(14)
  const byDate = mealsByDate(meals)
  const loggedDays = dates.filter(d => byDate[d]?.count).length
  if (loggedDays < MIN.overlay) return { available: false, loggedDays }

  // Weight moving-average aligned to each day (carry forward the latest weight).
  const wSorted = [...weightLogs].sort((a, b) => a.date.localeCompare(b.date))
  const weightOn = (d) => {
    let val = null
    for (const l of wSorted) { if (l.date <= d) val = l.weight_kg; else break }
    return val
  }
  const bars = dates.map(d => {
    const t = byDate[d]
    const status = t ? dayAdherenceStatus(mealTotals4(t), targets) : 'none'
    return { label: d.slice(5), status }
  })
  const weightLine = dates.map(d => ({ label: d.slice(5), w: weightOn(d) }))
  const dips = bars.filter(b => b.status === 'warn' || b.status === 'bad').length
  const weights = weightLine.map(x => x.w).filter(v => v != null)
  const trendDown = weights.length >= 2 && weights[weights.length - 1] < weights[0]
  const takeaway = `Adherence dipped ${dips} of 14 days; weight trend ${trendDown ? 'still tracking down' : 'holding'}.`

  return { available: true, bars, weightLine, takeaway }
}
function mealTotals4(t) { return { protein: t.protein, carbs: t.carbs, fat: t.fat } }

// ── 6. Weekly consistency scorecard (this week) ─────────────────────────────
export function weeklyScorecard(sessions, meals, appleHealthLogs, targets, sleepTargetHours = 8) {
  const week = getWeekDatesForOffset(0)
  const byDate = mealsByDate(meals)
  const sessionDates = new Set(sessions.map(s => s.performed_date))
  const ahByDate = {}
  for (const r of appleHealthLogs) ahByDate[r.date] = r
  const today = lastNDates(1)[0]

  const cell = (hit, future) => ({ hit: !!hit, future })
  const rows = [
    {
      label: 'Training',
      cells: week.map(d => cell(sessionDates.has(d.dateStr), d.dateStr > today)),
    },
    {
      label: 'Macros',
      cells: week.map(d => {
        const t = byDate[d.dateStr]
        return cell(t && dayAdherenceStatus(mealTotals4(t), targets) === 'good', d.dateStr > today)
      }),
    },
    {
      label: 'Sleep',
      cells: week.map(d => {
        const ah = ahByDate[d.dateStr]
        return cell(ah && ah.sleep_minutes != null && ah.sleep_minutes >= sleepTargetHours * 60, d.dateStr > today)
      }),
    },
  ]
  const anyData = meals.length > 0 || sessions.length > 0 || appleHealthLogs.length > 0
  return { days: week.map(d => d.label.split(' ')[0] || d.dateStr.slice(8)), dayLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], rows, anyData }
}
