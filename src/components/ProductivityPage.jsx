import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import TodaysTasks from './TodaysTasks'
import AddTaskModal from './AddTaskModal'

// ── Helpers ───────────────────────────────────────────────────────────────────

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function shiftDate(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const r = new Date(y, m - 1, d + n)
  return localDate(r)
}

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

function getLastDayOfMonth(y, m) {
  return new Date(y, m, 0).getDate()
}

function isRecurringDueOnDate(task, dateStr) {
  if (task.recurrence_frequency === 'daily') return true
  const [y, m, d] = dateStr.split('-').map(Number)
  if (task.recurrence_frequency === 'weekly') {
    const jsDay = new Date(y, m - 1, d).getDay()
    const dbDay = (jsDay + 6) % 7
    return dbDay === task.recurrence_day_of_week
  }
  if (task.recurrence_frequency === 'monthly') {
    const dom = task.recurrence_day_of_month
    const lastDay = getLastDayOfMonth(y, m)
    return d === Math.min(dom, lastDay)
  }
  return false
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

  // Weekly goals
  const [weeklyGoals, setWeeklyGoals] = useState([])
  const [goalLogs, setGoalLogs] = useState([])
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [goalForm, setGoalForm] = useState({ name: '', target_count: 1 })

  // Week summary
  const [weekTasks, setWeekTasks] = useState([])
  const [habitLogs, setHabitLogs] = useState([])
  const [habitDefsCount, setHabitDefsCount] = useState(0)

  // Add/edit modal
  const [showModal, setShowModal] = useState(false)
  const [modalInitial, setModalInitial] = useState({})
  const [editingDefId, setEditingDefId] = useState(null)
  const [saving, setSaving] = useState(false)

  // Refreshes TodaysTasks when recurring defs change (remounts the component)
  const [todaysKey, setTodaysKey] = useState(0)

  // ── Computed ────────────────────────────────────────────────────────────────

  const todayStr = localDate()
  const realWeekMon = getWeekMonday(0)
  const currentWeekMonStr = localDate(realWeekMon)
  const currentWeekSunStr = localDate(addDays(realWeekMon, 6))
  const weekMon = getWeekMonday(weekOffset)
  const weekSun = addDays(weekMon, 6)
  const weekMonStr = localDate(weekMon)
  const weekSunStr = localDate(weekSun)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekMon, i))

  // ── Data fetching ───────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.from('tasks').select('*').eq('is_recurring', true).order('created_at')
      .then(({ data }) => { if (data) setRecurringDefs(data) })
    supabase.from('weekly_goals').select('*').eq('active', true).order('created_at')
      .then(({ data }) => { if (data) setWeeklyGoals(data) })
    supabase.from('weekly_goal_logs').select('*').eq('week_start', currentWeekMonStr)
      .then(({ data }) => { if (data) setGoalLogs(data) })
    supabase.from('tasks').select('*').eq('is_recurring', false)
      .gte('task_date', currentWeekMonStr).lte('task_date', currentWeekSunStr)
      .then(({ data }) => { if (data) setWeekTasks(data) })
    supabase.from('habit_definitions').select('id')
      .then(({ data }) => { if (data) setHabitDefsCount(data.length) })
    const thirtyDaysAgo = shiftDate(todayStr, -30)
    supabase.from('habit_logs').select('*').gte('date', thirtyDaysAgo)
      .then(({ data }) => { if (data) setHabitLogs(data) })
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
    return recurringDefs
      .filter(d => d.task_time && isRecurringDueOnDate(d, dayStr))
      .sort((a, b) => (a.task_time || '').localeCompare(b.task_time || ''))
  }

  // ── Weekly goals ────────────────────────────────────────────────────────────

  function getGoalCount(goalId) {
    return goalLogs.find(l => l.goal_id === goalId)?.count || 0
  }

  async function addGoal() {
    if (!goalForm.name.trim()) return
    const { data } = await supabase.from('weekly_goals').insert([{
      name: goalForm.name.trim(),
      target_count: parseInt(goalForm.target_count) || 1,
      active: true,
    }]).select().single()
    if (data) setWeeklyGoals(prev => [...prev, data])
    setGoalForm({ name: '', target_count: 1 })
    setShowGoalForm(false)
  }

  async function adjustGoalCount(goalId, delta) {
    const newCount = Math.max(0, (getGoalCount(goalId)) + delta)
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

  // ── Recurring def CRUD ──────────────────────────────────────────────────────

  async function handleModalSave(form) {
    if (!form.text.trim()) return
    setSaving(true)
    try {
      if (editingDefId) {
        // Update existing recurring def
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
        // New recurring def
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
        // Regular task (timed, for calendar)
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
          if (data.task_date >= currentWeekMonStr && data.task_date <= currentWeekSunStr) {
            setWeekTasks(prev => [...prev, data])
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

  async function deleteDef(def) {
    // Unlink completed instances first so history is preserved
    await supabase.from('tasks').update({ recurrence_parent_id: null }).eq('recurrence_parent_id', def.id)
    await supabase.from('tasks').delete().eq('id', def.id)
    setRecurringDefs(prev => prev.filter(d => d.id !== def.id))
    setTodaysKey(k => k + 1)
  }

  function openAddTask() {
    setEditingDefId(null)
    setModalInitial({})
    setShowModal(true)
  }

  function openAddRecurring() {
    setEditingDefId(null)
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

  function closeModal() {
    setShowModal(false)
    setEditingDefId(null)
    setModalInitial({})
  }

  // ── Week summary ────────────────────────────────────────────────────────────

  const weekTasksDone = weekTasks.filter(t => t.done).length
  const weekTasksTotal = weekTasks.length

  const weekHabitLogs = habitLogs.filter(l => l.date >= currentWeekMonStr && l.date <= currentWeekSunStr)
  const habitScore = weekHabitLogs.reduce((sum, l) => sum + (Array.isArray(l.habits) ? l.habits.filter(Boolean).length : 0), 0)
  const habitMax = habitDefsCount * 7

  const weekGoalsHit = weeklyGoals.filter(g => getGoalCount(g.id) >= g.target_count).length

  function computeStreak() {
    const logMap = {}
    habitLogs.forEach(l => { logMap[l.date] = l.habits })
    let streak = 0
    let dateStr = todayStr
    while (true) {
      const habits = logMap[dateStr]
      if (!habits || !habits.some(Boolean)) break
      streak++
      dateStr = shiftDate(dateStr, -1)
    }
    return streak
  }
  const streak = computeStreak()

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

  // ── Shared classes ──────────────────────────────────────────────────────────

  const cardCls = 'bg-gray-900 border border-gray-800 rounded-lg p-6'
  const labelCls = 'text-sm tracking-widest uppercase text-gray-400'
  const inputCls = 'bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400'
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
                <div key={i} className={`rounded p-1.5 min-h-[100px] ${isToday ? 'bg-gray-800/60' : ''}`}>
                  <div className="text-xs text-gray-600 mb-0.5">{DAY_LABELS[i]}</div>
                  <div className={`text-sm font-bold mb-1.5 ${isToday ? 'text-emerald-400' : 'text-gray-300'}`}>
                    {day.getDate()}
                  </div>
                  {allBlocks.map((block, bi) => (
                    <div
                      key={`${block._type}-${block.id}-${bi}`}
                      className={`text-xs px-1.5 py-1 mb-1 rounded border-l-2 bg-gray-800 leading-tight ${
                        block._type === 'recurring' ? 'border-purple-400' : 'border-emerald-400'
                      }`}
                    >
                      <span className={`text-[10px] ${block._type === 'recurring' ? 'text-purple-400' : 'text-gray-500'}`}>
                        {block.task_time.slice(0, 5)}{' '}
                      </span>
                      <span className={block._type === 'recurring' ? 'text-gray-400' : 'text-gray-300'}>
                        {block.text}
                      </span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          <button onClick={openAddTask} className={btnOutlineCls}>+ Add Task</button>
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
                autoFocus
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

      {/* ── Section 2: Today's Tasks + Week Summary ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <TodaysTasks key={todaysKey} />
        </div>

        {/* Week Summary */}
        <div className={cardCls}>
          <h2 className={`${labelCls} mb-4`}>Week Summary</h2>
          <div className="space-y-5">
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

            <div className="pt-2 border-t border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 uppercase tracking-widest">Streak</span>
                <span className="text-sm font-medium text-white">
                  {streak > 0 ? `${streak} day${streak !== 1 ? 's' : ''}` : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 3: Recurring Tasks ────────────────────────────────────── */}
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
                          <div className="flex gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEditDef(def)} className="text-gray-600 hover:text-white transition-colors text-xs uppercase tracking-widest">Edit</button>
                            <button onClick={() => deleteDef(def)} className="text-gray-700 hover:text-red-400 transition-colors text-xs uppercase tracking-widest">Del</button>
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
          title={editingDefId ? 'Edit Recurring Task' : (modalInitial.is_recurring ? 'Add Recurring Task' : 'Add Task')}
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
