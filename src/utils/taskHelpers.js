export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function shiftDate(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const r = new Date(y, m - 1, d + n)
  return localDate(r)
}

export function getLastDayOfMonth(y, m) {
  return new Date(y, m, 0).getDate()
}

export function isRecurringDueOnDate(task, dateStr) {
  if (task.recurrence_frequency === 'daily') return true
  const [y, m, d] = dateStr.split('-').map(Number)
  if (task.recurrence_frequency === 'weekly') {
    const jsDay = new Date(y, m - 1, d).getDay()
    const dbDay = (jsDay + 6) % 7 // 0=Mon…6=Sun
    return dbDay === task.recurrence_day_of_week
  }
  if (task.recurrence_frequency === 'monthly') {
    const dom = task.recurrence_day_of_month
    const lastDay = getLastDayOfMonth(y, m)
    return d === Math.min(dom, lastDay)
  }
  return false
}
