// ── Health section shared helpers ──────────────────────────────────────────
// Pure logic shared across the Health sub-pages (Overview, Daily Metrics,
// Nutrition, Insights). No React, no Supabase — just data → derived values.

// ── Design tokens (from the design handoff — the Health content area uses its
//    own slate palette, distinct from the app shell's gray scale) ────────────
export const C = {
  page: '#0a0e16',
  card: '#111726',
  cardNested: '#0c1019',
  border: '#1e2635',
  divider: '#161c27',
  text: '#f1f3f6',
  text2: '#c4cad3',
  text3: '#8b94a3',
  label: '#5b6472',
  faint: '#4b5566',
  emerald: '#10b981',
  emeraldLink: '#34d399',
  emeraldHover: '#6ee7b7',
  amber: '#f59e0b',
  red: '#ef4444',
}

// ── Date helpers (local — never toISOString, which shifts by timezone) ──────
export function localDate() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function localTime() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function shiftDate(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

export function fmtShort(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function fmtDayTitle(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const day = dt.toLocaleDateString('en-GB', { weekday: 'short' })
  const mon = dt.toLocaleDateString('en-GB', { month: 'short' })
  return `${day} ${d} ${mon}`
}

export function fmtLongDate(dateStr) {
  if (dateStr === localDate()) return 'Today'
  if (dateStr === shiftDate(localDate(), -1)) return 'Yesterday'
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function getWeekDatesForOffset(offset = 0) {
  const today = new Date()
  const dow = today.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  const monday = new Date(today)
  monday.setDate(today.getDate() + diff + offset * 7)
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { label, dateStr, dayLabel: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }
  })
}

// Ordered list of the last `n` day-strings ending today (oldest → newest).
export function lastNDates(n, anchor = localDate()) {
  const out = []
  for (let i = n - 1; i >= 0; i--) out.push(shiftDate(anchor, -i))
  return out
}

export function fmtHm(minutes) {
  if (minutes == null) return '—'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return `${h}h ${m}m`
}

// Signed "±Xh Ym" from a minute count (for sleep-debt style values).
export function fmtSignedHm(minutes) {
  if (minutes == null) return '—'
  const sign = minutes < 0 ? '−' : '+'
  const abs = Math.abs(minutes)
  const h = Math.floor(abs / 60)
  const m = Math.round(abs % 60)
  return `${sign}${h}h ${String(m).padStart(2, '0')}m`
}

export function stripMarkdown(text) {
  return text
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^\*\s+/gm, '- ')
    .trim()
}

// ── Numeric helpers ─────────────────────────────────────────────────────────
export function sum(arr) { return arr.reduce((s, v) => s + v, 0) }

export function avg(arr) { return arr.length ? sum(arr) / arr.length : null }

// Average of a field across rows, ignoring null/undefined.
export function avgField(rows, field) {
  const vals = rows.map(r => r?.[field]).filter(v => v != null)
  return vals.length ? sum(vals) / vals.length : null
}

// Count of rows where the field is present.
export function countField(rows, field) {
  return rows.filter(r => r?.[field] != null).length
}

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

// Least-squares slope (units of field per row-step) over a numeric series.
export function slope(vals) {
  const n = vals.length
  if (n < 2) return 0
  const xs = vals.map((_, i) => i)
  const mx = avg(xs), my = avg(vals)
  let num = 0, den = 0
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (vals[i] - my); den += (xs[i] - mx) ** 2 }
  return den === 0 ? 0 : num / den
}

// ── Nutrition target defaults & settings shape ──────────────────────────────
export const DEFAULT_SETTINGS = {
  weight_target_kg: null,
  nutrition_mode: 'calories',
  kcal_target: 2000,
  protein_target_g: 150,
  carbs_target_g: 200,
  fat_target_g: 70,
  protein_pct: 30,
  carbs_pct: 40,
  fat_pct: 30,
  steps_target: 10000,
  sleep_target_hours: 8,
}

export function macroTargets(settings) {
  return {
    kcal: settings.kcal_target || 2000,
    protein: settings.protein_target_g || 150,
    carbs: settings.carbs_target_g || 200,
    fat: settings.fat_target_g || 70,
  }
}

// Sum a day's meals into macro totals.
export function mealTotals(meals) {
  return meals.reduce((a, m) => ({
    kcal: a.kcal + (m.kcal || 0),
    protein: a.protein + (m.protein_g || 0),
    carbs: a.carbs + (m.carbs_g || 0),
    fat: a.fat + (m.fat_g || 0),
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 })
}

// ── Macro adherence badge (design handoff) ──────────────────────────────────
// kind 'min' (protein/carbs — want ≥ target): green ≥90%, amber ≥70%, else red.
// kind 'max' (calories/fat — want ≤ target):  green ≤105%, amber ≤125%, else red.
export function adherenceStatus(pct, kind) {
  if (kind === 'min') {
    if (pct >= 90) return 'good'
    if (pct >= 70) return 'warn'
    return 'bad'
  }
  if (pct <= 105) return 'good'
  if (pct <= 125) return 'warn'
  return 'bad'
}

export const STATUS_COLOR = { good: C.emerald, warn: C.amber, bad: C.red, none: C.label }
// Translucent tint of the status colour, for badge backgrounds.
export const STATUS_TINT = {
  good: 'rgba(16,185,129,0.14)',
  warn: 'rgba(245,158,11,0.14)',
  bad: 'rgba(239,68,68,0.14)',
  none: 'rgba(91,100,114,0.12)',
}

export function macroBadge(logged, target, kind) {
  if (!target) return { pct: 0, status: 'none' }
  const pct = Math.round((logged / target) * 100)
  const status = logged === 0 ? 'none' : adherenceStatus(pct, kind)
  return { pct, status }
}

export const MACRO_KIND = { kcal: 'max', calories: 'max', protein: 'min', carbs: 'min', fat: 'max' }

// ── Blended macro status % (design handoff — the "Macro status" tile) ───────
// Cap each macro at 100% of its own target BEFORE averaging, so overshooting
// one macro can't inflate the blended score. Fat uses target/logged so eating
// *over* the fat target pulls the score down rather than up.
export function blendedMacroPct(totals, targets) {
  if (!totals || (totals.protein === 0 && totals.carbs === 0 && totals.fat === 0)) return null
  const p = targets.protein ? Math.min(1, totals.protein / targets.protein) : 1
  const c = targets.carbs ? Math.min(1, totals.carbs / targets.carbs) : 1
  const f = totals.fat > 0 && targets.fat ? Math.min(1, targets.fat / totals.fat) : 1
  return Math.round(((p + c + f) / 3) * 100)
}

// Overall adherence status for a single day (drives scorecard + overlay bars).
export function dayAdherenceStatus(totals, targets) {
  const pct = blendedMacroPct(totals, targets)
  if (pct == null) return 'none'
  if (pct >= 90) return 'good'
  if (pct >= 70) return 'warn'
  return 'bad'
}

// ── Personal baseline / trend framing (Daily Metrics + Insights) ────────────
// Rolling average of a field over the most recent `days` rows (rows given
// newest-first). Returns null when there's nothing to average.
export function rollingBaseline(rowsDesc, field, days) {
  return avgField(rowsDesc.slice(0, days), field)
}

// Trend direction of a short series (oldest→newest) for the Overview strip.
// goodIsUp: is an increase the "good" direction for this metric?
export function trendDirection(vals, goodIsUp) {
  if (vals.length < 2) return { arrow: '→', status: 'none' }
  const delta = vals[vals.length - 1] - vals[0]
  const range = Math.max(...vals) - Math.min(...vals)
  const flat = Math.abs(delta) < range * 0.08
  if (flat) return { arrow: '→', status: 'none', delta }
  const up = delta > 0
  const good = goodIsUp ? up : !up
  return { arrow: up ? '↑' : '↓', status: good ? 'good' : 'warn', delta }
}
