// Shared training analytics — the derivation logic behind both the Training
// Analysis screen and the Training Overview landing page. Extracted from
// TrainingAnalysis.jsx so the stall classifier and weekly set-volume logic have
// a single source of truth rather than being reimplemented per screen.
import { shiftDate } from './taskHelpers'

// Accent colours — emerald/amber/red match the app's Tailwind tokens; teal/blue
// are the approved data-series hues for the training screens. Charts + inline
// styles only (Recharts and dynamic colours need hex).
export const ACCENT = {
  emerald: '#34d399', amber: '#fbbf24', red: '#f87171',
  purple: '#a78bfa', teal: '#2dd4bf', blue: '#60a5fa', greyBlue: '#8aa0b6',
}
// Chart internals matched to HealthPage's weight chart (gray-800 grid, gray-500 ticks)
export const CHART_GRID = '#1f2937'
export const CHART_TICK = '#6b7280'

export const statusHex = (s) => (s === 'progressing' ? ACCENT.emerald : s === 'skipped' ? ACCENT.red : ACCENT.amber)

// ── Muscle bucketing — collapse the bank's 11 groups into the design's 6 ─
export const BUCKETS = ['Chest', 'Back', 'Shoulders', 'Legs', 'Arms', 'Core']
const BUCKET_MAP = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', core: 'Core', arms: 'Arms',
  legs: 'Legs', quads: 'Legs', hamstrings: 'Legs', glutes: 'Legs', calves: 'Legs',
  biceps: 'Arms', triceps: 'Arms', forearms: 'Arms',
}
export const bucketOf = (mg) => BUCKET_MAP[(mg || '').trim().toLowerCase()] || null

// Weekly hard-set targets per muscle [low, high] — domain defaults from the design
export const SET_TARGETS = {
  Chest: [12, 16], Back: [14, 20], Shoulders: [12, 16], Legs: [14, 20], Arms: [10, 16], Core: [8, 12],
}
export const setStatus = (s, lo) => (s >= lo ? 'ok' : (s >= lo * 0.6 ? 'low' : 'under'))
export const SETCOL = { ok: ACCENT.emerald, low: ACCENT.amber, under: ACCENT.red }

// ── Pure helpers ────────────────────────────────────────────────────
export const epley = (w, r) => w * (1 + r / 30)
export const fmtTop = (v) => (v % 1 === 0 ? String(v) : v.toFixed(1))

export function pearson(xs, ys) {
  const n = xs.length
  if (n < 2) return 0
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sx = 0, sy = 0
  xs.forEach((x, i) => { const dx = x - mx, dy = ys[i] - my; sxy += dx * dy; sx += dx * dx; sy += dy * dy })
  return (sx && sy) ? sxy / Math.sqrt(sx * sy) : 0
}

// Least-squares slope of ys over xs (per unit x). 0 for < 2 points or flat x.
export function linregSlope(xs, ys) {
  const n = xs.length
  if (n < 2) return 0
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) * (x - mx) })
  return sxx ? sxy / sxx : 0
}

// Least-squares endpoints over (xs,ys) at the given x bounds
export function trendSegment(xs, ys, xmin, xmax) {
  const n = xs.length
  if (n < 2) return null
  const my = ys.reduce((a, b) => a + b, 0) / n
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const slope = linregSlope(xs, ys)
  const b = my - slope * mx
  return [{ x: xmin, y: slope * xmin + b }, { x: xmax, y: slope * xmax + b }]
}

// classify() — exact logic from the design, over the last 3 sessions
export function classify(weights, reps) {
  const k = Math.min(3, weights.length)
  const w = weights.slice(-k), r = reps.slice(-k)
  if (w.length === 0) return { status: 'stalled', why: 'flat' }
  if (w[w.length - 1] > w[0] + 1e-9) return { status: 'progressing', why: 'load' }
  if (r[r.length - 1] > r[0]) return { status: 'progressing', why: 'reps' }
  return { status: 'stalled', why: 'flat' }
}

export function daysBetween(dateStr, today) {
  const [y1, m1, d1] = dateStr.split('-').map(Number)
  const [y2, m2, d2] = today.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

export function weekStartMonday(today) {
  const [y, m, d] = today.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const offset = (dt.getDay() + 6) % 7 // 0 = Mon
  return shiftDate(today, -offset)
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function fmtShort(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${MONTHS[m - 1]} ${String(d).padStart(2, '0')}`
}

// Top set of a session for one exercise: set_number === 1, else heaviest valid set
export function topSetOf(sets) {
  const valid = sets.filter(s => s.actual_weight != null && s.actual_reps != null)
  if (!valid.length) return null
  return valid.find(s => s.set_number === 1)
    || valid.slice().sort((a, b) => (b.actual_weight - a.actual_weight) || (b.actual_reps - a.actual_reps))[0]
}

// ── Derivations (shared by Analysis + Overview) ─────────────────────

// Per-exercise session series (oldest → newest). Each point is that session's
// top set with derived volume + estimated 1RM.
//   sessions: performed_sessions with nested performed_exercises → performed_sets
export function buildSeriesByExercise(sessions) {
  const byEx = {}
  for (const sess of sessions) {
    const well = (sess.session_rating != null && sess.energy_rating != null)
      ? (sess.session_rating + sess.energy_rating) / 2 : null
    for (const pe of sess.performed_exercises || []) {
      const top = topSetOf(pe.performed_sets || [])
      if (!top) continue
      const volume = (pe.performed_sets || [])
        .filter(s => s.actual_weight != null && s.actual_reps != null)
        .reduce((a, s) => a + s.actual_weight * s.actual_reps, 0)
      ;(byEx[pe.exercise_id] ||= []).push({
        date: sess.performed_date,
        weight: top.actual_weight,
        reps: top.actual_reps,
        volume,
        well,
        e1rm: epley(top.actual_weight, top.actual_reps),
      })
    }
  }
  for (const id in byEx) byEx[id].sort((a, b) => a.date.localeCompare(b.date))
  return byEx
}

// Per-exercise status via the classifier, with a 14-day "skipped" override.
export function buildStatusByExercise(seriesByExercise, today) {
  const out = {}
  for (const id in seriesByExercise) {
    const s = seriesByExercise[id]
    const cls = classify(s.map(x => x.weight), s.map(x => x.reps))
    const last = s[s.length - 1].date
    const status = daysBetween(last, today) >= 14 ? 'skipped' : cls.status
    out[id] = { status, why: cls.why, lastDate: last }
  }
  return out
}

// Weekly hard-set volume per muscle bucket for the current (Mon-start) week,
// each scored against its target range.
//   exerciseMap: exercise_id -> { bucket }
export function buildWeeklySets(sessions, exerciseMap, today) {
  const wkStart = weekStartMonday(today)
  const counts = Object.fromEntries(BUCKETS.map(b => [b, 0]))
  for (const sess of sessions) {
    if (sess.performed_date < wkStart) continue
    for (const pe of sess.performed_exercises || []) {
      const bucket = exerciseMap[pe.exercise_id]?.bucket
      if (!bucket) continue
      const hard = (pe.performed_sets || []).filter(s => s.actual_reps != null).length
      counts[bucket] += hard
    }
  }
  return BUCKETS.map(m => {
    const [lo, hi] = SET_TARGETS[m]
    const sets = counts[m]
    const st = setStatus(sets, lo)
    return { muscle: m, sets, low: lo, high: hi, range: `${lo}–${hi}`, status: st, color: SETCOL[st], pct: Math.min(sets / hi, 1) * 100 }
  })
}
