import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import TodaysTasks from './TodaysTasks'
import AddTaskModal from './AddTaskModal'
import { localDate, shiftDate, isRecurringDueOnDate } from '../utils/taskHelpers'

// Productivity → Tasks sub-page. Pure task + calendar management: full-width
// calendar on top, then the task list (Overdue / Today / Upcoming / Completed),
// then recurring-task definitions. Weekly goals and the weekly review moved to
// Habits & Goals / Overview in the redesign; the Reading tracker is its own
// sub-page now. All existing recurring/calendar behaviour is preserved.

// ── Helpers (calendar/week-specific) ─────────────────────────────────────────

function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function getWeekMonday(offsetWeeks = 0) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff + offsetWeeks * 7)
  return d
}

function fmtDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function daysBetween(aStr, bStr) {
  const [ay, am, ad] = aStr.split('-').map(Number)
  const [by, bm, bd] = bStr.split('-').map(Number)
  return Math.round((new Date(ay, am - 1, ad) - new Date(by, bm - 1, bd)) / 86400000)
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const PRIORITY_BADGE = {
  HIGH: 'text-red-400 border-red-400',
  MEDIUM: 'text-amber-400 border-amber-400',
  LOW: 'text-blue-400 border-blue-400',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProductivityPage() {
  // Calendar
  const [weekOffset, setWeekOffset] = useState(0)
  const [calendarTasks, setCalendarTasks] = useState([])

  // Recurring defs (shared between calendar and section 3)
  const [recurringDefs, setRecurringDefs] = useState([])

  // Task list
  const [upcomingTasks, setUpcomingTasks] = useState([])
  const [overdueTasks, setOverdueTasks] = useState([])
  const [completedTasks, setCompletedTasks] = useState([])
  const [showCompleted, setShowCompleted] = useState(false)

  // Add/edit modal
  const [showModal, setShowModal] = useState(false)
  const [modalInitial, setModalInitial] = useState({})
  const [editingDefId, setEditingDefId] = useState(null)
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [saving, setSaving] = useState(false)

  // Refreshes TodaysTasks when recurring defs change (remounts the component)
  const [todaysKey, setTodaysKey] = useState(0)

  // ── Computed ────────────────────────────────────────────────────────────────

  const todayStr = localDate()
  const tomorrowStr = shiftDate(todayStr, 1)
  const in7DaysStr = shiftDate(todayStr, 7)
  const weekMon = getWeekMonday(weekOffset)
  const weekSun = addDays(weekMon, 6)
  const weekMonStr = localDate(weekMon)
  const weekSunStr = localDate(weekSun)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekMon, i))

  // ── Data fetching ───────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.from('tasks').select('*').eq('is_recurring', true).order('created_at')
      .then(({ data }) => { if (data) setRecurringDefs(data) })
    supabase.from('tasks').select('*').eq('is_recurring', false)
      .gte('task_date', tomorrowStr).lte('task_date', in7DaysStr)
      .then(({ data }) => { if (data) setUpcomingTasks(data) })
    // Overdue: regular (non-recurring, non-instance) tasks due before today, not done.
    supabase.from('tasks').select('*').eq('is_recurring', false).eq('done', false)
      .is('recurrence_parent_id', null).lt('task_date', todayStr).order('task_date')
      .then(({ data }) => { if (data) setOverdueTasks(data) })
    // Completed: done regular tasks, most recent first.
    supabase.from('tasks').select('*').eq('is_recurring', false).eq('done', true)
      .order('task_date', { ascending: false }).limit(50)
      .then(({ data }) => { if (data) setCompletedTasks(data) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const mon = getWeekMonday(weekOffset)
    const sun = addDays(mon, 6)
    const monStr = localDate(mon)
    const sunStr = localDate(sun)
    supabase.from('tasks').select('*')
      .eq('is_recurring', false)
      .not('task_time', 'is', null)
      .gte('task_date', monStr).lte('task_date', sunStr)
      .then(({ data }) => { if (data) setCalendarTasks(data) })
  }, [weekOffset])

  // ── Calendar helpers ────────────────────────────────────────────────────────

  function timedTasksForDay(dayStr) {
    return calendarTasks
      .filter(t => t.task_date === dayStr)
      .sort((a, b) => (a.task_time || '').localeCompare(b.task_time || ''))
  }

  function timedRecurringForDay(dayStr) {
    const completedParentIds = new Set(
      calendarTasks
        .filter(t => t.task_date === dayStr && !!t.recurrence_parent_id)
        .map(t => t.recurrence_parent_id)
    )
    return recurringDefs
      .filter(d => d.task_time && isRecurringDueOnDate(d, dayStr) && !completedParentIds.has(d.id))
      .sort((a, b) => (a.task_time || '').localeCompare(b.task_time || ''))
  }

  // ── Task CRUD ───────────────────────────────────────────────────────────────

  async function handleModalSave(form) {
    if (!form.text.trim()) return
    setSaving(true)
    try {
      if (editingTaskId) {
        const payload = {
          text: form.text.trim(),
          priority: form.priority,
          task_date: form.date || todayStr,
          task_time: form.time || null,
        }
        const { data } = await supabase.from('tasks').update(payload).eq('id', editingTaskId).select().single()
        if (data) {
          const inUpcomingRange = data.task_date > todayStr && data.task_date <= in7DaysStr
          setUpcomingTasks(prev => {
            if (inUpcomingRange) {
              const exists = prev.some(t => t.id === data.id)
              return exists ? prev.map(t => t.id === data.id ? data : t) : [...prev, data]
            }
            return prev.filter(t => t.id !== data.id)
          })
          // Editing a date into the past (still open) makes it overdue, and back out again.
          const nowOverdue = data.task_date < todayStr && !data.done
          setOverdueTasks(prev => {
            const exists = prev.some(t => t.id === data.id)
            if (nowOverdue) return exists ? prev.map(t => t.id === data.id ? data : t) : [...prev, data]
            return prev.filter(t => t.id !== data.id)
          })
          if (data.task_time) {
            setCalendarTasks(prev => {
              const exists = prev.some(t => t.id === data.id)
              return exists ? prev.map(t => t.id === data.id ? data : t) : [...prev, data]
            })
          }
          if (data.task_date === todayStr) setTodaysKey(k => k + 1)
        }
        closeModal()
        return
      }
      if (editingDefId) {
        const payload = {
          text: form.text.trim(),
          priority: form.priority,
          recurrence_frequency: form.recurrence_frequency,
          recurrence_day_of_week: form.recurrence_frequency === 'weekly' ? form.recurrence_day_of_week : null,
          recurrence_day_of_month: form.recurrence_frequency === 'monthly' ? form.recurrence_day_of_month : null,
          task_time: form.time || null,
        }
        const { data } = await supabase.from('tasks').update(payload).eq('id', editingDefId).select().single()
        if (data) {
          setRecurringDefs(prev => prev.map(d => d.id === editingDefId ? data : d))
          setTodaysKey(k => k + 1)
        }
      } else if (form.is_recurring) {
        const payload = {
          text: form.text.trim(),
          priority: form.priority,
          is_recurring: true,
          recurrence_frequency: form.recurrence_frequency,
          done: false,
        }
        if (form.recurrence_frequency === 'weekly') payload.recurrence_day_of_week = form.recurrence_day_of_week
        if (form.recurrence_frequency === 'monthly') payload.recurrence_day_of_month = form.recurrence_day_of_month
        if (form.time) payload.task_time = form.time
        const { data, error } = await supabase.from('tasks').insert([payload]).select().single()
        if (error) { console.error('handleModalSave new def:', error); return }
        if (data) {
          setRecurringDefs(prev => [...prev, data])
          setTodaysKey(k => k + 1)
        }
      } else {
        const payload = {
          text: form.text.trim(),
          priority: form.priority,
          task_date: form.date || todayStr,
          done: false,
          is_recurring: false,
          add_to_cal: form.add_to_cal,
        }
        if (form.time) payload.task_time = form.time
        const { data, error } = await supabase.from('tasks').insert([payload]).select().single()
        if (error) { console.error('handleModalSave new task:', error); return }
        if (data) {
          if (data.task_time) setCalendarTasks(prev => [...prev, data])
          if (data.task_date > todayStr && data.task_date <= in7DaysStr) {
            setUpcomingTasks(prev => [...prev, data])
          }
          if (data.task_date < todayStr && !data.done) {
            setOverdueTasks(prev => [...prev, data])
          }
          if (data.task_date === todayStr) setTodaysKey(k => k + 1)
        }
      }
      closeModal()
    } catch (e) {
      console.error('handleModalSave:', e)
    } finally {
      setSaving(false)
    }
  }

  async function deleteUpcomingTask(task) {
    await supabase.from('tasks').delete().eq('id', task.id)
    setUpcomingTasks(prev => prev.filter(t => t.id !== task.id))
  }

  function handleTodaysTaskChanged(task) {
    const inUpcomingRange = task.task_date > todayStr && task.task_date <= in7DaysStr
    setUpcomingTasks(prev => {
      if (inUpcomingRange) {
        const exists = prev.some(t => t.id === task.id)
        return exists ? prev.map(t => t.id === task.id ? task : t) : [...prev, task]
      }
      return prev.filter(t => t.id !== task.id)
    })
  }

  // Overdue / completed actions
  async function completeTask(task) {
    await supabase.from('tasks').update({ done: true }).eq('id', task.id)
    setOverdueTasks(prev => prev.filter(t => t.id !== task.id))
    setCompletedTasks(prev => [{ ...task, done: true }, ...prev])
  }

  async function uncompleteTask(task) {
    await supabase.from('tasks').update({ done: false }).eq('id', task.id)
    setCompletedTasks(prev => prev.filter(t => t.id !== task.id))
    if (task.task_date < todayStr) setOverdueTasks(prev => [...prev, { ...task, done: false }])
    else if (task.task_date === todayStr) setTodaysKey(k => k + 1)
  }

  async function deleteTaskRow(task, from) {
    await supabase.from('tasks').delete().eq('id', task.id)
    if (from === 'overdue') setOverdueTasks(prev => prev.filter(t => t.id !== task.id))
    if (from === 'completed') setCompletedTasks(prev => prev.filter(t => t.id !== task.id))
  }

  async function deleteDef(def) {
    // Unlink completed instances first so history is preserved
    await supabase.from('tasks').update({ recurrence_parent_id: null }).eq('recurrence_parent_id', def.id)
    await supabase.from('tasks').delete().eq('id', def.id)
    setRecurringDefs(prev => prev.filter(d => d.id !== def.id))
    setTodaysKey(k => k + 1)
  }

  function openAddTask() {
    setEditingDefId(null)
    setEditingTaskId(null)
    setModalInitial({})
    setShowModal(true)
  }

  function openAddRecurring() {
    setEditingDefId(null)
    setEditingTaskId(null)
    setModalInitial({ is_recurring: true })
    setShowModal(true)
  }

  function openEditDef(def) {
    setEditingDefId(def.id)
    setModalInitial({
      text: def.text,
      time: def.task_time || '',
      priority: def.priority,
      is_recurring: true,
      recurrence_frequency: def.recurrence_frequency || 'daily',
      recurrence_day_of_week: def.recurrence_day_of_week ?? 0,
      recurrence_day_of_month: def.recurrence_day_of_month ?? 1,
    })
    setShowModal(true)
  }

  function openEditTask(task) {
    setEditingTaskId(task.id)
    setEditingDefId(null)
    setModalInitial({
      text: task.text,
      date: task.task_date || todayStr,
      time: task.task_time || '',
      priority: task.priority,
      is_recurring: false,
    })
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingDefId(null)
    setEditingTaskId(null)
    setModalInitial({})
  }

  // ── Recurring def display helpers ───────────────────────────────────────────

  function defScheduleLabel(def) {
    if (def.recurrence_frequency === 'daily') return 'Every day'
    if (def.recurrence_frequency === 'weekly') {
      const dow = def.recurrence_day_of_week
      return dow !== null && dow !== undefined ? `Every ${DAY_LABELS[dow]}` : 'Weekly'
    }
    if (def.recurrence_frequency === 'monthly') {
      const dom = def.recurrence_day_of_month
      return dom ? `${dom}${dom === 1 ? 'st' : dom === 2 ? 'nd' : dom === 3 ? 'rd' : 'th'} of month` : 'Monthly'
    }
    return ''
  }

  // ── Upcoming items ──────────────────────────────────────────────────────────

  const upcomingItems = (() => {
    const regular = upcomingTasks
      .filter(t => !t.recurrence_parent_id)
      .map(t => ({ ...t, _type: 'task', _date: t.task_date }))

    const recurringOccurrences = []
    for (const def of recurringDefs) {
      let cur = tomorrowStr
      while (cur <= in7DaysStr) {
        if (isRecurringDueOnDate(def, cur)) {
          recurringOccurrences.push({ ...def, _type: 'recurring', _date: cur })
        }
        cur = shiftDate(cur, 1)
      }
    }

    return [...regular, ...recurringOccurrences].sort((a, b) => {
      if (a._date !== b._date) return a._date.localeCompare(b._date)
      const aTime = a.task_time || ''
      const bTime = b.task_time || ''
      if (aTime && !bTime) return -1
      if (!aTime && bTime) return 1
      return aTime.localeCompare(bTime)
    })
  })()

  // ── Shared classes ──────────────────────────────────────────────────────────

  const cardCls = 'bg-gray-900 border border-gray-800 rounded-lg p-6'
  const labelCls = 'text-sm tracking-widest uppercase text-gray-400'
  const btnOutlineCls = 'text-xs tracking-widest uppercase px-3 py-1.5 border border-emerald-400 text-emerald-400 rounded hover:bg-emerald-400 hover:text-gray-950 transition-colors'

  // ── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Weekly Calendar (full width) ──────────────────────────────────── */}
      <div className={cardCls}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={labelCls}>Weekly Calendar</h2>
          <div className="flex items-center gap-3">
            <button onClick={() => setWeekOffset(o => o - 1)} className="text-gray-500 hover:text-white transition-colors text-xl leading-none">‹</button>
            <span className="text-xs text-gray-500">{fmtDay(weekMonStr)} – {fmtDay(weekSunStr)}</span>
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
            const timedTasks = timedTasksForDay(dayStr)
            const timedRec = timedRecurringForDay(dayStr)
            const allBlocks = [
              ...timedTasks.map(t => ({ ...t, _type: 'task' })),
              ...timedRec.map(t => ({ ...t, _type: 'recurring' })),
            ].sort((a, b) => (a.task_time || '').localeCompare(b.task_time || ''))

            return (
              <div key={i} className={`rounded border border-gray-800 p-1.5 min-h-[100px] ${isToday ? 'bg-gray-800/60' : ''}`}>
                <div className="text-xs text-gray-600 mb-0.5">{DAY_LABELS[i]}</div>
                <div className={`text-sm font-bold mb-1.5 ${isToday ? 'text-emerald-400' : 'text-gray-300'}`}>
                  {day.getDate()}
                </div>
                {allBlocks.map((block, bi) => (
                  <div
                    key={`${block._type}-${block.id}-${bi}`}
                    className={`text-xs px-1.5 py-1 mb-1 rounded border-l-2 bg-gray-800 leading-tight overflow-hidden ${
                      block._type === 'recurring' ? 'border-teal-400' : 'border-emerald-400'
                    }`}
                  >
                    <div className="flex items-center gap-0.5 min-w-0">
                      <span className={`text-[10px] shrink-0 ${block._type === 'recurring' ? 'text-teal-400' : 'text-gray-500'}`}>
                        {block.task_time.slice(0, 5)}
                      </span>
                      <span className={`truncate ${block._type === 'recurring' ? 'text-gray-400' : 'text-gray-300'}`}>
                        {block.text}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>

        <button onClick={openAddTask} className={btnOutlineCls}>+ Add Task</button>
      </div>

      {/* ── Overdue ───────────────────────────────────────────────────────── */}
      {overdueTasks.length > 0 && (
        <div className="bg-gray-900 border border-red-500/40 rounded-lg p-6">
          <h2 className={`${labelCls} text-red-400 mb-4`}>Overdue</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {overdueTasks.map(task => {
              const days = daysBetween(todayStr, task.task_date)
              return (
                <div key={task.id} className="group flex items-start gap-3 p-3 rounded-lg border border-red-500/20 bg-red-500/5">
                  <button
                    onClick={() => completeTask(task)}
                    className="mt-0.5 w-5 h-5 rounded border border-gray-600 hover:border-emerald-400 shrink-0 transition-colors"
                    title="Mark done"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{task.text}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-red-400">{days} day{days !== 1 ? 's' : ''} overdue</span>
                      {task.task_time && <span className="text-xs text-gray-500">{task.task_time.slice(0, 5)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-xs border px-1.5 py-0.5 rounded tracking-widest ${PRIORITY_BADGE[task.priority] || PRIORITY_BADGE.MEDIUM}`}>{task.priority}</span>
                    <button onClick={() => openEditTask(task)} className="text-gray-600 hover:text-white transition-colors opacity-0 group-hover:opacity-100 text-xs uppercase tracking-widest">Edit</button>
                    <button onClick={() => deleteTaskRow(task, 'overdue')} className="text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-lg leading-none">×</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Today + Upcoming ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TodaysTasks key={todaysKey} recurringDefs={recurringDefs} setRecurringDefs={setRecurringDefs} onTaskChanged={handleTodaysTaskChanged} />

        <div className={cardCls}>
          <h2 className={`${labelCls} mb-4`}>Upcoming</h2>
          {upcomingItems.length === 0 ? (
            <div className="text-sm text-gray-600">No upcoming tasks</div>
          ) : (
            <div>
              {upcomingItems.map((item, idx) => (
                <div
                  key={`${item._type}-${item.id}-${item._date}-${idx}`}
                  className="group flex items-start gap-2 py-2 border-b border-gray-800 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{item.text}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-gray-500 shrink-0">{fmtDay(item._date)}</span>
                      {item.task_time && (
                        <span className="text-xs text-gray-500 shrink-0">{item.task_time.slice(0, 5)}</span>
                      )}
                      {item._type === 'recurring' && (
                        <span className="text-[10px] border px-1 py-px rounded tracking-widest text-teal-400 border-teal-400 shrink-0">↻ REC</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-xs border px-1.5 py-0.5 rounded tracking-widest ${PRIORITY_BADGE[item.priority] || PRIORITY_BADGE.MEDIUM}`}>
                      {item.priority}
                    </span>
                    <button
                      onClick={() => item._type === 'recurring' ? openEditDef(item) : openEditTask(item)}
                      className="text-gray-600 hover:text-white transition-colors opacity-0 group-hover:opacity-100 text-xs uppercase tracking-widest"
                    >Edit</button>
                    {item._type === 'task' && (
                      <button
                        onClick={() => deleteUpcomingTask(item)}
                        className="text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-lg leading-none"
                      >×</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Completed (collapsed) ─────────────────────────────────────────── */}
      <div className={cardCls}>
        <button
          onClick={() => setShowCompleted(s => !s)}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <span className={labelCls}>Completed ({completedTasks.length})</span>
          <span className="text-xs">{showCompleted ? '▲' : '▼'}</span>
        </button>
        {showCompleted && (
          completedTasks.length === 0 ? (
            <div className="text-sm text-gray-600 mt-4">No completed tasks</div>
          ) : (
            <div className="mt-4 space-y-1">
              {completedTasks.map(task => (
                <div key={task.id} className="group flex items-center gap-3 py-2 border-b border-gray-800 last:border-0">
                  <button
                    onClick={() => uncompleteTask(task)}
                    className="w-5 h-5 rounded bg-emerald-400 border border-emerald-400 flex items-center justify-center shrink-0 text-gray-950"
                    title="Mark not done"
                  >
                    <span className="text-xs font-bold">✓</span>
                  </button>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm line-through text-gray-600 truncate">{task.text}</span>
                  </div>
                  {task.task_date && <span className="text-xs text-gray-600 shrink-0">{fmtDay(task.task_date)}</span>}
                  <button onClick={() => deleteTaskRow(task, 'completed')} className="text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-lg leading-none shrink-0">×</button>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* ── Recurring Tasks ───────────────────────────────────────────────── */}
      <div className={cardCls}>
        <div className="flex items-center justify-between mb-6">
          <h2 className={labelCls}>Recurring Tasks</h2>
          <button onClick={openAddRecurring} className={btnOutlineCls}>+ Add Recurring</button>
        </div>

        {recurringDefs.length === 0 ? (
          <div className="text-sm text-gray-600">No recurring tasks set up</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {['daily', 'weekly', 'monthly'].map(freq => {
              const defs = recurringDefs.filter(d => d.recurrence_frequency === freq)
              return (
                <div key={freq}>
                  <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-3 pb-2 border-b border-gray-800">{freq}</h3>
                  {defs.length === 0 ? (
                    <div className="text-sm text-gray-700">None</div>
                  ) : (
                    <div className="space-y-1">
                      {defs.map(def => (
                        <div key={def.id} className="flex items-start gap-3 group py-2 border-b border-gray-800 last:border-0">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white truncate">{def.text}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{defScheduleLabel(def)}</div>
                            {def.task_time && (
                              <div className="text-xs text-gray-600 mt-0.5">{def.task_time.slice(0, 5)}</div>
                            )}
                          </div>
                          <span className={`text-xs border px-1.5 py-0.5 rounded tracking-widest shrink-0 ${PRIORITY_BADGE[def.priority] || PRIORITY_BADGE.MEDIUM}`}>
                            {def.priority}
                          </span>
                          <div className="flex gap-2 shrink-0">
                            <button onClick={() => openEditDef(def)} className="text-gray-600 hover:text-white transition-colors text-xs uppercase tracking-widest opacity-0 group-hover:opacity-100">Edit</button>
                            <button onClick={() => deleteDef(def)} className="text-gray-700 hover:text-red-400 transition-colors text-xs uppercase tracking-widest opacity-0 group-hover:opacity-100">Del</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showModal && (
        <AddTaskModal
          title={editingDefId ? 'Edit Recurring Task' : editingTaskId ? 'Edit Task' : (modalInitial.is_recurring ? 'Add Recurring Task' : 'Add Task')}
          onClose={closeModal}
          onSave={handleModalSave}
          initial={modalInitial}
          saving={saving}
          lockRecurring={!!editingDefId}
        />
      )}

    </div>
  )
}
