import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

// ── Helpers ──────────────────────────────────────────────────────────────────

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getWeekMonday(offsetWeeks = 0) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff + offsetWeeks * 7)
  return d
}

function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// String-based day shift — avoids UTC-parse risk on date-only strings
function shiftDate(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const r = new Date(y, m - 1, d + n)
  return localDate(r)
}

function fmtDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function getMonthStart() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const EVENT_BORDER = {
  personal: 'border-emerald-400',
  work: 'border-blue-400',
  social: 'border-amber-400',
  recurring: 'border-purple-400',
}

const EVENT_TEXT = {
  personal: 'text-emerald-400',
  work: 'text-blue-400',
  social: 'text-amber-400',
  recurring: 'text-purple-400',
}

const PRIORITY_BADGE = {
  HIGH: 'text-red-400 border-red-400',
  MEDIUM: 'text-amber-400 border-amber-400',
  LOW: 'text-blue-400 border-blue-400',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProductivityPage() {

  // ── Calendar state
  const [weekOffset, setWeekOffset] = useState(0)
  const [events, setEvents] = useState([])
  const [showEventForm, setShowEventForm] = useState(false)
  const [eventForm, setEventForm] = useState({ name: '', date: localDate(), time: '', type: 'personal', add_to_gcal: false })
  const [eventSaving, setEventSaving] = useState(false)

  // ── Weekly goals state
  const [weeklyGoals, setWeeklyGoals] = useState([])
  const [goalLogs, setGoalLogs] = useState([])
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [goalForm, setGoalForm] = useState({ name: '', target_count: 1 })

  // ── Daily tasks state
  const [selectedDate, setSelectedDate] = useState(localDate())
  const [dailyTasks, setDailyTasks] = useState([])
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskForm, setTaskForm] = useState({ text: '', priority: 'MEDIUM', add_to_cal: false })
  const [taskSaving, setTaskSaving] = useState(false)
  const [taskFormError, setTaskFormError] = useState('')

  // ── Week summary state
  const [weekTasks, setWeekTasks] = useState([])
  const [habitLogs, setHabitLogs] = useState([])
  const [habitDefsCount, setHabitDefsCount] = useState(0)

  // ── Recurring tasks state
  const [recurringTasks, setRecurringTasks] = useState([])
  const [recurringLogs, setRecurringLogs] = useState([])
  const [showRecurringForm, setShowRecurringForm] = useState(false)
  const [recurringForm, setRecurringForm] = useState({ name: '', frequency: 'daily', priority: 'MEDIUM', schedule: false, calendar_day_of_week: 0, calendar_day_of_month: 1 })

  // ── Computed values (re-evaluated each render)
  const todayStr = localDate()
  const todayPlus7Str = localDate(addDays(new Date(), 7))
  const realWeekMon = getWeekMonday(0)
  const currentWeekMonStr = localDate(realWeekMon)
  const currentWeekSunStr = localDate(addDays(realWeekMon, 6))
  const monthStartStr = getMonthStart()

  // ── Fetch events (re-runs when weekOffset changes)
  useEffect(() => {
    const mon = getWeekMonday(weekOffset)
    const sun = addDays(mon, 6)
    const today = new Date()
    const todayPlus7 = addDays(today, 7)
    const start = localDate(mon < today ? mon : today)
    const end = localDate(sun > todayPlus7 ? sun : todayPlus7)
    supabase.from('events').select('*')
      .gte('date', start).lte('date', end)
      .order('date').order('time', { ascending: true, nullsFirst: true })
      .then(({ data }) => { if (data) setEvents(data) })
  }, [weekOffset])

  // ── Fetch weekly goals + logs for current week
  useEffect(() => {
    supabase.from('weekly_goals').select('*').eq('active', true).order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setWeeklyGoals(data) })
    supabase.from('weekly_goal_logs').select('*').eq('week_start', currentWeekMonStr)
      .then(({ data }) => { if (data) setGoalLogs(data) })
  }, [])

  // ── Fetch daily tasks for selected date
  useEffect(() => {
    supabase.from('tasks').select('*').eq('task_date', selectedDate).order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setDailyTasks(data) })
  }, [selectedDate])

  // ── Fetch week summary data on mount
  useEffect(() => {
    supabase.from('tasks').select('*')
      .gte('task_date', currentWeekMonStr).lte('task_date', currentWeekSunStr)
      .then(({ data }) => { if (data) setWeekTasks(data) })
    supabase.from('habit_logs').select('*')
      .gte('date', currentWeekMonStr).lte('date', currentWeekSunStr)
      .then(({ data }) => { if (data) setHabitLogs(data) })
    supabase.from('habit_definitions').select('id')
      .then(({ data }) => { if (data) setHabitDefsCount(data.length) })
  }, [])

  // ── Fetch recurring tasks + recent logs
  useEffect(() => {
    supabase.from('recurring_tasks').select('*').eq('active', true).order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setRecurringTasks(data) })
    supabase.from('recurring_task_logs').select('*').gte('completed_date', monthStartStr)
      .then(({ data }) => { if (data) setRecurringLogs(data) })
  }, [])

  // ── Event CRUD ──────────────────────────────────────────────────────────────

  async function addEvent() {
    if (!eventForm.name.trim() || !eventForm.date) return
    setEventSaving(true)
    const { data } = await supabase.from('events').insert([{
      name: eventForm.name.trim(),
      date: eventForm.date,
      time: eventForm.time || null,
      type: eventForm.type,
      add_to_gcal: eventForm.add_to_gcal,
    }]).select().single()
    if (data) setEvents(prev => [...prev, data].sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '')))
    setEventForm({ name: '', date: localDate(), time: '', type: 'personal', add_to_gcal: false })
    setShowEventForm(false)
    setEventSaving(false)
  }

  async function deleteEvent(id) {
    await supabase.from('events').delete().eq('id', id)
    setEvents(prev => prev.filter(e => e.id !== id))
  }

  // ── Weekly goal CRUD ────────────────────────────────────────────────────────

  async function addGoal() {
    if (!goalForm.name.trim()) return
    const { data } = await supabase.from('weekly_goals').insert([{
      name: goalForm.name.trim(),
      target_count: parseInt(goalForm.target_count) || 1,
    }]).select().single()
    if (data) setWeeklyGoals(prev => [...prev, data])
    setGoalForm({ name: '', target_count: 1 })
    setShowGoalForm(false)
  }

  async function adjustGoalCount(goalId, delta) {
    const log = goalLogs.find(l => l.goal_id === goalId)
    const newCount = Math.max(0, (log?.count || 0) + delta)
    const { data } = await supabase.from('weekly_goal_logs').upsert({
      goal_id: goalId,
      week_start: currentWeekMonStr,
      count: newCount,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'goal_id,week_start' }).select().single()
    if (data) {
      setGoalLogs(prev => {
        const exists = prev.some(l => l.goal_id === goalId)
        return exists ? prev.map(l => l.goal_id === goalId ? data : l) : [...prev, data]
      })
    }
  }

  async function deleteGoal(id) {
    await supabase.from('weekly_goals').update({ active: false }).eq('id', id)
    setWeeklyGoals(prev => prev.filter(g => g.id !== id))
  }

  // ── Daily task CRUD ─────────────────────────────────────────────────────────

  async function addDailyTask() {
    if (!taskForm.text.trim()) return
    setTaskSaving(true)
    setTaskFormError('')
    const insertDate = selectedDate
    try {
      const { data: taskData, error: taskError } = await supabase.from('tasks').insert([{
        text: taskForm.text.trim(),
        priority: taskForm.priority,
        done: false,
        task_date: insertDate,
      }]).select().single()
      if (taskError) {
        console.error('addDailyTask:', taskError)
        setTaskFormError(taskError.message || 'Save failed — check console for details')
        return
      }
      if (taskData) {
        setDailyTasks(prev => [...prev, taskData])
        if (insertDate >= currentWeekMonStr && insertDate <= currentWeekSunStr) {
          setWeekTasks(prev => [...prev, taskData])
        }
      }
      if (taskForm.add_to_cal) {
        const { data: evData } = await supabase.from('events').insert([{
          name: taskForm.text.trim(),
          date: selectedDate,
          time: null,
          type: 'personal',
          add_to_gcal: false,
        }]).select().single()
        if (evData) setEvents(prev => [...prev, evData])
      }
      setTaskForm({ text: '', priority: 'MEDIUM', add_to_cal: false })
      setShowTaskForm(false)
    } catch (e) {
      console.error('addDailyTask unexpected:', e)
      setTaskFormError('Unexpected error — check console')
    } finally {
      setTaskSaving(false)
    }
  }

  async function toggleDailyTask(id) {
    const task = dailyTasks.find(t => t.id === id)
    if (!task) return
    const newDone = !task.done
    setDailyTasks(prev => prev.map(t => t.id === id ? { ...t, done: newDone } : t))
    setWeekTasks(prev => prev.map(t => t.id === id ? { ...t, done: newDone } : t))
    await supabase.from('tasks').update({ done: newDone }).eq('id', id)
  }

  async function removeDailyTask(id) {
    setDailyTasks(prev => prev.filter(t => t.id !== id))
    setWeekTasks(prev => prev.filter(t => t.id !== id))
    await supabase.from('tasks').delete().eq('id', id)
  }

  // ── Recurring task CRUD ─────────────────────────────────────────────────────

  async function addRecurringTask() {
    if (!recurringForm.name.trim()) return
    const payload = {
      name: recurringForm.name.trim(),
      frequency: recurringForm.frequency,
      priority: recurringForm.priority,
      active: true,
    }
    if (recurringForm.schedule && recurringForm.frequency === 'weekly') {
      payload.calendar_day_of_week = recurringForm.calendar_day_of_week
    }
    if (recurringForm.schedule && recurringForm.frequency === 'monthly') {
      payload.calendar_day_of_month = recurringForm.calendar_day_of_month
    }
    const { data, error } = await supabase.from('recurring_tasks').insert([payload]).select().single()
    if (error) { console.error('addRecurringTask:', error); return }
    if (data) setRecurringTasks(prev => [...prev, data])
    setRecurringForm({ name: '', frequency: 'daily', priority: 'MEDIUM', schedule: false, calendar_day_of_week: 0, calendar_day_of_month: 1 })
    setShowRecurringForm(false)
  }

  // dateStr is the specific day being viewed; falls back to today for Section 3 toggles
  async function toggleRecurringDone(task, dateStr) {
    const key = task.frequency === 'daily' ? (dateStr || todayStr)
      : task.frequency === 'weekly' ? currentWeekMonStr
      : monthStartStr
    const isDone = recurringLogs.some(l => l.task_id === task.id && l.completed_date === key)
    if (isDone) {
      await supabase.from('recurring_task_logs').delete().eq('task_id', task.id).eq('completed_date', key)
      setRecurringLogs(prev => prev.filter(l => !(l.task_id === task.id && l.completed_date === key)))
    } else {
      const { data, error } = await supabase.from('recurring_task_logs')
        .insert([{ task_id: task.id, completed_date: key }]).select().single()
      if (error) console.error('toggleRecurringDone:', error)
      if (data) setRecurringLogs(prev => [...prev, data])
    }
  }

  async function deleteRecurringTask(id) {
    await supabase.from('recurring_tasks').update({ active: false }).eq('id', id)
    setRecurringTasks(prev => prev.filter(t => t.id !== id))
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const weekMon = getWeekMonday(weekOffset)
  const weekSun = addDays(weekMon, 6)
  const weekMonStr = localDate(weekMon)
  const weekSunStr = localDate(weekSun)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekMon, i))

  function eventsForDay(dayStr) {
    return events.filter(e => e.date === dayStr)
  }

  // Recurring tasks with a calendar schedule that fall on a given day
  function getAutoEventsForDay(dayStr) {
    return recurringTasks.filter(task => {
      if (task.frequency === 'weekly') {
        return task.calendar_day_of_week !== null && task.calendar_day_of_week !== undefined
          && isRecurringDueOnDate(task, dayStr)
      }
      if (task.frequency === 'monthly') {
        return task.calendar_day_of_month !== null && task.calendar_day_of_month !== undefined
          && isRecurringDueOnDate(task, dayStr)
      }
      return false
    })
  }

  function getGoalCount(goalId) {
    return goalLogs.find(l => l.goal_id === goalId)?.count || 0
  }

  function isRecurringDone(task) {
    const key = task.frequency === 'daily' ? todayStr
      : task.frequency === 'weekly' ? currentWeekMonStr
      : monthStartStr
    return recurringLogs.some(l => l.task_id === task.id && l.completed_date === key)
  }

  // Whether a recurring task is scheduled to appear on a given date
  function isRecurringDueOnDate(task, dateStr) {
    if (task.frequency === 'daily') return true
    if (task.frequency === 'weekly') {
      const dow = task.calendar_day_of_week
      if (dow === null || dow === undefined) return true // no schedule set: appear every day
      const [y, m, d] = dateStr.split('-').map(Number)
      // JS getDay(): 0=Sun…6=Sat  →  DB convention: 0=Mon…6=Sun
      const jsDay = new Date(y, m - 1, d).getDay()
      const dbDay = (jsDay + 6) % 7
      return dbDay === dow
    }
    if (task.frequency === 'monthly') {
      const dom = task.calendar_day_of_month
      const d = Number(dateStr.split('-')[2])
      if (dom === null || dom === undefined) return d === 1 // no schedule set: appear on 1st
      return d === dom
    }
    return false
  }

  // Completion check for a specific viewed date (used in daily tasks panel)
  function isRecurringDoneOnDate(task, dateStr) {
    const key = task.frequency === 'daily' ? dateStr
      : task.frequency === 'weekly' ? currentWeekMonStr
      : monthStartStr
    return recurringLogs.some(l => l.task_id === task.id && l.completed_date === key)
  }

  function recurringStatus(task) {
    if (isRecurringDone(task)) return { label: 'Done', cls: 'text-emerald-400' }
    if (task.frequency === 'daily') return { label: 'Due today', cls: 'text-amber-400' }
    if (task.frequency === 'weekly') return { label: 'Due this week', cls: 'text-amber-400' }
    return { label: 'Due this month', cls: 'text-amber-400' }
  }

  // Recurring tasks due on the selected date that haven't been completed for that period
  const selectedDueRecurring = recurringTasks.filter(t =>
    isRecurringDueOnDate(t, selectedDate) && !isRecurringDoneOnDate(t, selectedDate)
  )

  // IDs already shown in the daily tasks section — don't duplicate in upcoming
  const shownRecurringIds = new Set(selectedDueRecurring.map(t => t.id))

  const upcomingItems = [
    ...events
      .filter(e => e.date >= todayStr && e.date <= todayPlus7Str)
      .map(e => ({ key: `ev-${e.id}`, label: e.name, badge: e.type.toUpperCase(), badgeCls: EVENT_TEXT[e.type] || 'text-gray-400', sub: fmtDay(e.date) })),
    ...weeklyGoals
      .filter(g => getGoalCount(g.id) < g.target_count)
      .map(g => ({ key: `goal-${g.id}`, label: g.name, badge: 'GOAL', badgeCls: 'text-purple-400', sub: `${getGoalCount(g.id)}/${g.target_count}` })),
    ...recurringTasks
      .filter(t => !isRecurringDone(t) && !shownRecurringIds.has(t.id))
      .map(t => ({ key: `rec-${t.id}`, label: t.name, badge: t.frequency.toUpperCase(), badgeCls: 'text-purple-400', sub: recurringStatus(t).label })),
  ]

  const weekTasksDone = weekTasks.filter(t => t.done).length
  const weekTasksTotal = weekTasks.length
  const habitScore = habitLogs.reduce((sum, log) => sum + (Array.isArray(log.habits) ? log.habits.filter(Boolean).length : 0), 0)
  const habitMax = habitDefsCount * 7
  const weekGoalsHit = weeklyGoals.filter(g => getGoalCount(g.id) >= g.target_count).length

  // ── Shared classes ──────────────────────────────────────────────────────────

  const inputCls = 'bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400'
  const cardCls = 'bg-gray-900 border border-gray-800 rounded-lg p-6'
  const labelCls = 'text-sm tracking-widest uppercase text-gray-400'
  const btnOutlineCls = 'text-xs tracking-widest uppercase px-3 py-1.5 border border-emerald-400 text-emerald-400 rounded hover:bg-emerald-400 hover:text-gray-950 transition-colors'
  const btnSaveCls = 'px-4 py-2 bg-emerald-400 text-gray-950 text-xs font-bold tracking-widest uppercase rounded hover:bg-emerald-300 transition-colors disabled:opacity-50'

  // ── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Section 1: Weekly Calendar + Weekly Goals ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Calendar */}
        <div className={`${cardCls} lg:col-span-2`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={labelCls}>Weekly Calendar</h2>
            <div className="flex items-center gap-3">
              <button onClick={() => setWeekOffset(o => o - 1)} className="text-gray-500 hover:text-white transition-colors text-xl leading-none">‹</button>
              <span className="text-xs text-gray-500">
                {fmtDay(weekMonStr)} – {fmtDay(weekSunStr)}
              </span>
              <button onClick={() => setWeekOffset(o => o + 1)} className="text-gray-500 hover:text-white transition-colors text-xl leading-none">›</button>
              {weekOffset !== 0 && (
                <button onClick={() => setWeekOffset(0)} className="text-xs text-gray-600 hover:text-white transition-colors uppercase tracking-widest">Today</button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-4">
            {weekDays.map((day, i) => {
              const dayStr = localDate(day)
              const isToday = dayStr === todayStr
              const dayEvents = eventsForDay(dayStr)
              const autoEvents = getAutoEventsForDay(dayStr)
              return (
                <div key={i} className={`rounded p-1.5 min-h-[90px] ${isToday ? 'bg-gray-800/60' : ''}`}>
                  <div className="text-xs text-gray-600 mb-0.5">{DAY_LABELS[i]}</div>
                  <div className={`text-sm font-bold mb-1.5 ${isToday ? 'text-emerald-400' : 'text-gray-300'}`}>
                    {day.getDate()}
                  </div>
                  {dayEvents.map(e => (
                    <div
                      key={e.id}
                      className={`text-xs px-1.5 py-1 mb-1 rounded border-l-2 bg-gray-800 ${EVENT_BORDER[e.type] || 'border-gray-600'} leading-tight group relative`}
                    >
                      {e.time && <span className="text-gray-500">{e.time.slice(0, 5)} </span>}
                      <span className="text-gray-300">{e.name}</span>
                      <button
                        onClick={() => deleteEvent(e.id)}
                        className="absolute top-0 right-0.5 text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-sm leading-tight"
                      >×</button>
                    </div>
                  ))}
                  {autoEvents.map(t => (
                    <div
                      key={`auto-${t.id}`}
                      className="text-xs px-1.5 py-1 mb-1 rounded border-l-2 bg-gray-800 border-purple-400 leading-tight"
                    >
                      <span className="text-purple-400 text-[10px] tracking-wider uppercase">Recurring </span>
                      <span className="text-gray-400">{t.name}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          {showEventForm ? (
            <div className="p-4 bg-gray-800 rounded-lg space-y-2 mt-2">
              <div className="flex gap-2">
                <input
                  value={eventForm.name}
                  onChange={e => setEventForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && addEvent()}
                  placeholder="Event name"
                  className={`flex-1 ${inputCls}`}
                />
                <select value={eventForm.type} onChange={e => setEventForm(f => ({ ...f, type: e.target.value }))} className={inputCls}>
                  <option value="personal">Personal</option>
                  <option value="work">Work</option>
                  <option value="social">Social</option>
                  <option value="recurring">Recurring</option>
                </select>
              </div>
              <div className="flex gap-2">
                <input type="date" value={eventForm.date} onChange={e => setEventForm(f => ({ ...f, date: e.target.value }))} className={`flex-1 ${inputCls}`} />
                <input type="time" value={eventForm.time} onChange={e => setEventForm(f => ({ ...f, time: e.target.value }))} className={`flex-1 ${inputCls}`} />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer select-none">
                <input type="checkbox" checked={eventForm.add_to_gcal} onChange={e => setEventForm(f => ({ ...f, add_to_gcal: e.target.checked }))} className="accent-emerald-400" />
                Add to Google Calendar (coming soon)
              </label>
              <div className="flex gap-3 pt-1">
                <button onClick={addEvent} disabled={eventSaving || !eventForm.name.trim()} className={btnSaveCls}>Save</button>
                <button onClick={() => setShowEventForm(false)} className="text-xs text-gray-500 hover:text-white tracking-widest uppercase transition-colors">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowEventForm(true)} className={btnOutlineCls}>+ Add Event</button>
          )}
        </div>

        {/* Weekly Goals */}
        <div className={cardCls}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={labelCls}>Weekly Goals</h2>
            <button onClick={() => setShowGoalForm(f => !f)} className="text-xs text-gray-600 hover:text-white transition-colors uppercase tracking-widest">
              {showGoalForm ? 'Cancel' : '+ Add'}
            </button>
          </div>

          {showGoalForm && (
            <div className="mb-4 p-4 bg-gray-800 rounded-lg space-y-2">
              <input
                value={goalForm.name}
                onChange={e => setGoalForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addGoal()}
                placeholder="Goal name"
                className={`w-full ${inputCls}`}
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 shrink-0">Target / week</span>
                <input
                  type="number"
                  min="1"
                  value={goalForm.target_count}
                  onChange={e => setGoalForm(f => ({ ...f, target_count: e.target.value }))}
                  className={`w-16 ${inputCls}`}
                />
              </div>
              <button onClick={addGoal} disabled={!goalForm.name.trim()} className={`w-full ${btnSaveCls}`}>Save</button>
            </div>
          )}

          {weeklyGoals.length === 0 ? (
            <div className="text-sm text-gray-600">No goals set</div>
          ) : (
            <div className="space-y-4">
              {weeklyGoals.map(goal => {
                const count = getGoalCount(goal.id)
                const met = count >= goal.target_count
                const started = count > 0
                const countCls = met ? 'text-emerald-400' : started ? 'text-amber-400' : 'text-red-400'
                const barCls = met ? 'bg-emerald-400' : started ? 'bg-amber-400' : 'bg-gray-700'
                const pct = goal.target_count > 0 ? Math.min((count / goal.target_count) * 100, 100) : 0
                return (
                  <div key={goal.id} className="group">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-white flex-1 mr-2 truncate">{goal.name}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-sm font-bold ${countCls} w-8 text-right`}>{count}/{goal.target_count}</span>
                        <button onClick={() => adjustGoalCount(goal.id, -1)} className="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-white transition-colors text-base leading-none">−</button>
                        <button onClick={() => adjustGoalCount(goal.id, 1)} className="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-emerald-400 transition-colors text-base leading-none">+</button>
                        <button onClick={() => deleteGoal(goal.id)} className="text-gray-700 hover:text-red-400 transition-colors text-xs opacity-0 group-hover:opacity-100 uppercase tracking-widest">Del</button>
                      </div>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-1">
                      <div className={`h-1 rounded-full transition-all ${barCls}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Section 2: Daily Tasks + Upcoming + Week Summary ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

        {/* Daily Tasks */}
        <div className={`${cardCls} lg:col-span-2`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
                className="text-gray-500 hover:text-white transition-colors text-xl leading-none"
              >‹</button>
              <div>
                <h2 className={labelCls}>Daily Tasks</h2>
                <div className="text-xs text-gray-600 mt-0.5">
                  {fmtDay(selectedDate)}{selectedDate === todayStr ? ' · Today' : ''}
                </div>
              </div>
              <button
                onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
                className="text-gray-500 hover:text-white transition-colors text-xl leading-none"
              >›</button>
            </div>
            {selectedDate !== todayStr && (
              <button onClick={() => setSelectedDate(todayStr)} className="text-xs text-gray-600 hover:text-white transition-colors uppercase tracking-widest">Today</button>
            )}
          </div>

          {dailyTasks.length > 0 && (
            <div className="space-y-1 mb-4">
              {dailyTasks.map(task => (
                <div key={task.id} className="flex items-center gap-3 group py-2 border-b border-gray-800 last:border-0">
                  <button
                    onClick={() => toggleDailyTask(task.id)}
                    className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center transition-colors ${
                      task.done ? 'bg-emerald-400 border-emerald-400' : 'border-gray-700 hover:border-gray-500'
                    }`}
                  >
                    {task.done && (
                      <svg className="w-2 h-2 text-gray-950" viewBox="0 0 10 10" fill="none">
                        <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                  <span className={`text-sm flex-1 ${task.done ? 'line-through text-gray-600' : 'text-white'}`}>{task.text}</span>
                  <span className={`text-xs border px-1.5 py-0.5 rounded tracking-widest shrink-0 ${PRIORITY_BADGE[task.priority] || PRIORITY_BADGE.MEDIUM}`}>
                    {task.priority}
                  </span>
                  <button onClick={() => removeDailyTask(task.id)} className="text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-lg leading-none">×</button>
                </div>
              ))}
            </div>
          )}

          {/* Recurring tasks due on the selected date */}
          {selectedDueRecurring.length > 0 && (
            <div className="space-y-1 mb-4">
              {selectedDueRecurring.map(task => {
                const done = isRecurringDoneOnDate(task, selectedDate)
                return (
                  <div key={`rec-${task.id}`} className="flex items-center gap-3 group py-2 border-b border-gray-800 last:border-0">
                    <button
                      onClick={() => toggleRecurringDone(task, selectedDate)}
                      className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center transition-colors ${
                        done ? 'bg-emerald-400 border-emerald-400' : 'border-gray-700 hover:border-gray-500'
                      }`}
                    >
                      {done && (
                        <svg className="w-2 h-2 text-gray-950" viewBox="0 0 10 10" fill="none">
                          <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                    <span className={`text-sm flex-1 ${done ? 'line-through text-gray-600' : 'text-white'}`}>{task.name}</span>
                    <span className="text-xs border px-1.5 py-0.5 rounded tracking-widest shrink-0 text-purple-400 border-purple-400">RECURRING</span>
                    <span className={`text-xs border px-1.5 py-0.5 rounded tracking-widest shrink-0 ${PRIORITY_BADGE[task.priority] || PRIORITY_BADGE.MEDIUM}`}>
                      {task.priority}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {dailyTasks.length === 0 && selectedDueRecurring.length === 0 && !showTaskForm && (
            <div className="text-sm text-gray-600 mb-4">No tasks for this day</div>
          )}

          {showTaskForm ? (
            <div className="p-4 bg-gray-800 rounded-lg space-y-2 mt-2">
              <div className="flex gap-2">
                <input
                  value={taskForm.text}
                  onChange={e => setTaskForm(f => ({ ...f, text: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && addDailyTask()}
                  placeholder="Task name"
                  className={`flex-1 ${inputCls}`}
                  autoFocus
                />
                <select value={taskForm.priority} onChange={e => setTaskForm(f => ({ ...f, priority: e.target.value }))} className={inputCls}>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer select-none">
                <input type="checkbox" checked={taskForm.add_to_cal} onChange={e => setTaskForm(f => ({ ...f, add_to_cal: e.target.checked }))} className="accent-emerald-400" />
                Also add as calendar event
              </label>
              {taskFormError && (
                <div className="text-xs text-red-400 mt-1">{taskFormError}</div>
              )}
              <div className="flex gap-3 pt-1">
                <button onClick={addDailyTask} disabled={taskSaving || !taskForm.text.trim()} className={btnSaveCls}>
                  {taskSaving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => { setShowTaskForm(false); setTaskFormError('') }} className="text-xs text-gray-500 hover:text-white tracking-widest uppercase transition-colors">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowTaskForm(true)} className={btnOutlineCls}>+ Add Task</button>
          )}
        </div>

        {/* Upcoming */}
        <div className={cardCls}>
          <h2 className={`${labelCls} mb-4`}>Upcoming</h2>
          {upcomingItems.length === 0 ? (
            <div className="text-sm text-gray-600">All clear</div>
          ) : (
            <div className="space-y-2">
              {upcomingItems.slice(0, 12).map(item => (
                <div key={item.key} className="flex items-start justify-between gap-2 py-2 border-b border-gray-800 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{item.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{item.sub}</div>
                  </div>
                  <span className={`text-xs shrink-0 tracking-wider uppercase ${item.badgeCls}`}>{item.badge}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Week Summary */}
        <div className={cardCls}>
          <h2 className={`${labelCls} mb-4`}>Week Summary</h2>
          <div className="space-y-4">
            {[
              {
                label: 'Tasks done',
                value: `${weekTasksDone}/${weekTasksTotal || 0}`,
                pct: weekTasksTotal > 0 ? (weekTasksDone / weekTasksTotal) * 100 : 0,
                barCls: weekTasksDone === weekTasksTotal && weekTasksTotal > 0 ? 'bg-emerald-400' : 'bg-amber-400',
              },
              {
                label: 'Habit score',
                value: habitMax > 0 ? `${habitScore}/${habitMax}` : '—',
                pct: habitMax > 0 ? (habitScore / habitMax) * 100 : 0,
                barCls: 'bg-emerald-400',
              },
              {
                label: 'Goals hit',
                value: weeklyGoals.length > 0 ? `${weekGoalsHit}/${weeklyGoals.length}` : '—',
                pct: weeklyGoals.length > 0 ? (weekGoalsHit / weeklyGoals.length) * 100 : 0,
                barCls: weekGoalsHit === weeklyGoals.length && weeklyGoals.length > 0 ? 'bg-emerald-400' : 'bg-amber-400',
              },
            ].map(({ label, value, pct, barCls }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-gray-500 uppercase tracking-widest">{label}</span>
                  <span className="text-sm font-medium text-white">{value}</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-1">
                  <div className={`h-1 rounded-full ${barCls}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Section 3: Recurring Tasks ─────────────────────────────────────── */}
      <div className={cardCls}>
        <div className="flex items-center justify-between mb-6">
          <h2 className={labelCls}>Recurring Tasks</h2>
          <button onClick={() => setShowRecurringForm(f => !f)} className="text-xs text-gray-600 hover:text-white transition-colors uppercase tracking-widest">
            {showRecurringForm ? 'Cancel' : '+ Add Recurring'}
          </button>
        </div>

        {showRecurringForm && (
          <div className="mb-6 p-4 bg-gray-800 rounded-lg space-y-2">
            <div className="flex gap-2">
              <input
                value={recurringForm.name}
                onChange={e => setRecurringForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addRecurringTask()}
                placeholder="Task name"
                className={`flex-1 ${inputCls}`}
                autoFocus
              />
              <select value={recurringForm.frequency} onChange={e => setRecurringForm(f => ({ ...f, frequency: e.target.value, schedule: false }))} className={inputCls}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <select value={recurringForm.priority} onChange={e => setRecurringForm(f => ({ ...f, priority: e.target.value }))} className={inputCls}>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
            {(recurringForm.frequency === 'weekly' || recurringForm.frequency === 'monthly') && (
              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={recurringForm.schedule}
                    onChange={e => setRecurringForm(f => ({ ...f, schedule: e.target.checked }))}
                    className="accent-emerald-400"
                  />
                  Schedule on calendar
                </label>
                {recurringForm.schedule && recurringForm.frequency === 'weekly' && (
                  <select
                    value={recurringForm.calendar_day_of_week}
                    onChange={e => setRecurringForm(f => ({ ...f, calendar_day_of_week: Number(e.target.value) }))}
                    className={inputCls}
                  >
                    <option value={0}>Monday</option>
                    <option value={1}>Tuesday</option>
                    <option value={2}>Wednesday</option>
                    <option value={3}>Thursday</option>
                    <option value={4}>Friday</option>
                    <option value={5}>Saturday</option>
                    <option value={6}>Sunday</option>
                  </select>
                )}
                {recurringForm.schedule && recurringForm.frequency === 'monthly' && (
                  <select
                    value={recurringForm.calendar_day_of_month}
                    onChange={e => setRecurringForm(f => ({ ...f, calendar_day_of_month: Number(e.target.value) }))}
                    className={inputCls}
                  >
                    {Array.from({ length: 31 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>{i + 1}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
            <button onClick={addRecurringTask} disabled={!recurringForm.name.trim()} className={btnSaveCls}>Save</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {['daily', 'weekly', 'monthly'].map(freq => {
            const tasks = recurringTasks.filter(t => t.frequency === freq)
            return (
              <div key={freq}>
                <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-3 pb-2 border-b border-gray-800">{freq}</h3>
                {tasks.length === 0 ? (
                  <div className="text-sm text-gray-700">None</div>
                ) : (
                  <div className="space-y-1">
                    {tasks.map(task => {
                      const done = isRecurringDone(task)
                      const status = recurringStatus(task)
                      return (
                        <div key={task.id} className="flex items-center gap-3 group py-2 border-b border-gray-800 last:border-0">
                          <button
                            onClick={() => toggleRecurringDone(task)}
                            className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center transition-colors ${
                              done ? 'bg-emerald-400 border-emerald-400' : 'border-gray-700 hover:border-gray-500'
                            }`}
                          >
                            {done && (
                              <svg className="w-2 h-2 text-gray-950" viewBox="0 0 10 10" fill="none">
                                <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm ${done ? 'line-through text-gray-600' : 'text-white'}`}>{task.name}</div>
                            <div className={`text-xs mt-0.5 ${status.cls}`}>{status.label}</div>
                          </div>
                          <span className={`text-xs border px-1.5 py-0.5 rounded tracking-widest shrink-0 ${PRIORITY_BADGE[task.priority] || PRIORITY_BADGE.MEDIUM}`}>
                            {task.priority}
                          </span>
                          <button onClick={() => deleteRecurringTask(task.id)} className="text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-xs uppercase tracking-widest">Del</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
