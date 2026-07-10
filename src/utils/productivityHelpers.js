import { localDate, shiftDate } from './taskHelpers'

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ISO Monday (YYYY-MM-DD) for the week `offset` weeks from the current week.
export function isoMonday(offset = 0) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff + offset * 7)
  return localDate(d)
}

// Seven date strings Mon..Sun for the week beginning `mondayStr`.
export function weekDates(mondayStr) {
  return Array.from({ length: 7 }, (_, i) => shiftDate(mondayStr, i))
}

// Longest run of consecutive days ending today that are present in `dateSet`.
export function streakEndingToday(dateSet, todayStr = localDate()) {
  let streak = 0
  let cur = todayStr
  while (dateSet.has(cur)) {
    streak++
    cur = shiftDate(cur, -1)
  }
  return streak
}

// Fraction of the year elapsed (0..1), matching the design's dayOfYear / 365.
export function yearFraction(d = new Date()) {
  const start = new Date(d.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((d - start) / 86400000)
  return dayOfYear / 365
}

// ON TRACK / BEHIND / WAY BEHIND for a numeric yearly goal: compares the
// progress fraction against the elapsed-year fraction. Thresholds from the
// approved design — within 3% of pace = on track, within 15% = behind.
export function yearlyPaceStatus(current, target) {
  if (!target || target <= 0) return 'on_track'
  const diff = current / target - yearFraction() // negative = behind pace
  if (diff >= -0.03) return 'on_track'
  if (diff >= -0.15) return 'behind'
  return 'way_behind'
}

export const PACE_META = {
  on_track: { label: 'ON TRACK', text: 'text-emerald-400', border: 'border-emerald-400', bar: 'bg-emerald-400' },
  behind: { label: 'BEHIND', text: 'text-amber-400', border: 'border-amber-400', bar: 'bg-amber-400' },
  way_behind: { label: 'WAY BEHIND', text: 'text-red-400', border: 'border-red-400', bar: 'bg-red-400' },
}

// Short weekday + day-of-month for a date string, e.g. "Tue 8".
export function dayLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const wd = new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short' })
  return `${wd} ${d}`
}

// ISO week number for the week beginning `mondayStr` (e.g. 28).
export function isoWeekNumber(mondayStr) {
  const [y, m, d] = mondayStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const dayNum = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayNum + 3) // Thursday of this week
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3)
  return 1 + Math.round((date - firstThursday) / (7 * 86400000))
}

// "6 Jul – 12 Jul" for the week beginning `mondayStr`.
export function weekRangeLabel(mondayStr) {
  const fmt = s => {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }
  return `${fmt(mondayStr)} – ${fmt(shiftDate(mondayStr, 6))}`
}

// Label for a week navigator offset: 0 = This week, -1 = Last week, else N weeks ago.
export function weekOffsetLabel(offset) {
  if (offset === 0) return 'This week'
  if (offset === -1) return 'Last week'
  return `${-offset} weeks ago`
}
