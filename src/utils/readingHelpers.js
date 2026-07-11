// Shared pure helpers for the Reading Tracker (Home card + Productivity panel)
import { localDate } from './taskHelpers'

export const GENRE_PRESETS = ['Fiction', 'Non-fiction', 'Business', 'Psychology', 'Biography', 'History', 'Self-development']

// Deterministic genre colours — presets fixed, custom genres draw the next
// unused palette colour, falling back to muted grey when exhausted.
// Purple removed from the Reading tracker (user request) — Self-development and
// the spare palette slots use non-purple hues; the primary accent is emerald.
const FIXED_GENRE_COLORS = {
  'Self-development': '#2dd4bf',
  'Business': '#60a5fa',
  'Psychology': '#34d399',
  'Biography': '#fbbf24',
  'Non-fiction': '#f472b6',
  'History': '#38bdf8',
  'Fiction': '#f87171',
}
const PALETTE = ['#2dd4bf', '#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#38bdf8', '#f87171', '#fb923c']

// Stable colour map across a set of genres (e.g. all genres in genreCounts).
export function buildGenreColors(genres) {
  const map = { ...FIXED_GENRE_COLORS }
  const used = new Set(Object.values(map))
  for (const g of genres) {
    if (!map[g]) {
      const next = PALETTE.find(c => !used.has(c)) || '#7d8b90'
      map[g] = next
      used.add(next)
    }
  }
  return map
}

// Kept the name for import stability, but this is now the app's emerald accent
// (purple was removed from Reading per user request).
export const READING_ACCENT = '#34d399'
export const HEAT_RAMP = ['#161b1f', 'rgba(52,211,153,0.28)', 'rgba(52,211,153,0.5)', 'rgba(52,211,153,0.75)', '#34d399']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const todayISO = () => localDate()

// Display a stored ISO date (YYYY-MM-DD) as "26 Jun"
export function fmtFinishedDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y) return iso
  return `${d} ${MONTHS[m - 1]}`
}

// Derived unit text for a book given its progress
export function unitInfo(book) {
  if (!book) return { done: 0, left: 0, unitText: '', remainingText: '' }
  const isAudio = book.format === 'audio'
  const total = book.unitTotal ?? (isAudio ? 12 : 11)
  const done = Math.round(total * (book.progress || 0) / 100)
  const left = total - done
  return {
    done, left,
    unitText: isAudio ? `${done} / ${total} hr` : `ch ${done} / ${total}`,
    remainingText: isAudio ? `${left} hr left` : `${left} ch left`,
  }
}

// Year/pace stats — formulas exactly per the design handoff
export function computeYear(goal, doneCount, now = new Date()) {
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000)
  const yearFrac = dayOfYear / 365
  const expected = goal * yearFrac
  const ahead = doneCount - expected
  let paceText, paceColor
  if (ahead >= 0.7) { paceText = `+${Math.round(ahead)} ahead of pace`; paceColor = '#34d399' }
  else if (ahead <= -0.7) { paceText = `${Math.round(ahead)} behind pace`; paceColor = '#fbbf24' }
  else { paceText = 'on track'; paceColor = '#34d399' }
  const projected = Math.round(doneCount / Math.max(yearFrac, 0.01))
  const remaining = Math.max(0, goal - doneCount)
  const monthsLeft = 12 - (now.getMonth() + now.getDate() / 30)
  const perMonth = (remaining / Math.max(monthsLeft, 0.1)).toFixed(1)
  const percent = goal > 0 ? Math.round(doneCount / goal * 100) : 0
  return { paceText, paceColor, projected, remaining, perMonth, percent }
}

// Genre breakdown view (sorted desc, with colour + pct)
export function genreView(genreCounts) {
  const total = Object.values(genreCounts).reduce((a, b) => a + b, 0) || 1
  const colors = buildGenreColors(Object.keys(genreCounts))
  return Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({
      name, count, color: colors[name],
      pct: count / total * 100,
      pctLabel: Math.round(count / total * 100) + '%',
    }))
}

// Build the GitHub-style heatmap from a real { 'YYYY-MM-DD': intensity } map.
// Returns { weeks, streak, activeDays }. weeks are Sun→Sat columns.
export function buildHeat(intensityByDate, now = new Date()) {
  const year = now.getFullYear()
  const start = new Date(year, 0, 1)
  const today = new Date(year, now.getMonth(), now.getDate())
  const days = []
  for (let t = new Date(start); t <= today; t.setDate(t.getDate() + 1)) {
    const iso = localDate(t)
    const intensity = Math.max(0, Math.min(4, intensityByDate[iso] || 0))
    days.push({ dow: t.getDay(), month: t.getMonth(), intensity, color: HEAT_RAMP[intensity] })
  }
  let streak = 0
  for (let i = days.length - 1; i >= 0; i--) { if (days[i].intensity > 0) streak++; else break }
  const activeDays = days.filter(d => d.intensity > 0).length

  const weeks = []
  let week = new Array(7).fill(null)
  days.forEach(d => {
    week[d.dow] = d
    if (d.dow === 6) { weeks.push(week); week = new Array(7).fill(null) }
  })
  if (week.some(x => x)) weeks.push(week)

  let lastM = -1
  const view = weeks.map((w, wi) => {
    const first = w.find(x => x)
    let label = ''
    if (first && first.month !== lastM) { lastM = first.month; label = MONTHS[first.month] }
    return { key: wi, label, cells: w.map((c, ci) => ({ key: ci, color: c ? c.color : 'transparent' })) }
  })
  return { weeks: view, streak, activeDays }
}

// Default unit totals when adding a book
export const defaultUnit = (format) => format === 'audio'
  ? { unitTotal: 12, unitLabel: 'hr' }
  : { unitTotal: 11, unitLabel: 'ch' }
