import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import AddTaskModal from './AddTaskModal'
import { localDate, shiftDate, isRecurringDueOnDate } from '../utils/taskHelpers'

const PRIORITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 }
const PRIORITY_BADGE = {
  HIGH: 'text-red-400 border-red-400',
  MEDIUM: 'text-amber-400 border-amber-400',
  LOW: 'text-blue-400 border-blue-400',
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    const aTime = a.task_time || ''
    const bTime = b.task_time || ''
    if (aTime && !bTime) return -1
    if (!aTime && bTime) return 1
    if (aTime && bTime) return aTime.localeCompare(bTime)
    return (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1)
  })
}

export default function TodaysTasks({ compact = false, recurringDefs: propDefs, setRecurringDefs: propSetDefs, onTaskChanged }) {
  const [regularTasks, setRegularTasks] = useState([])
  const [ownDefs, setOwnDefs] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [saving, setSaving] = useState(false)

  // When propDefs is provided (ProductivityPage), use shared state; otherwise manage locally (HomePage)
  const controlled = propDefs !== undefined
  const recurringDefs = controlled ? propDefs : ownDefs
  const setRecurringDefs = controlled ? propSetDefs : setOwnDefs

  const todayStr = localDate()
  const tomorrowStr = shiftDate(todayStr, 1)

  async function fetchData() {
    const { data: regular } = await supabase.from('tasks').select('*').eq('is_recurring', false).eq('task_date', todayStr).order('created_at')
    if (regular) setRegularTasks(regular)
    if (!controlled) {
      const { data: defs } = await supabase.from('tasks').select('*').eq('is_recurring', true).order('created_at')
      if (defs) setOwnDefs(defs)
    }
  }

  useEffect(() => { fetchData() }, [])

  // User-created tasks for today (not recurring instances)
  const userTasks = regularTasks.filter(t => !t.recurrence_parent_id)
  // Completed recurring instances for today
  const completedInstances = regularTasks.filter(t => !!t.recurrence_parent_id)
  const completedParentIds = new Set(completedInstances.map(t => t.recurrence_parent_id))
  // Recurring defs due today with no completed instance
  const dueUncompletedDefs = recurringDefs.filter(d =>
    isRecurringDueOnDate(d, todayStr) && !completedParentIds.has(d.id)
  )

  const displayItems = sortItems([...userTasks, ...completedInstances, ...dueUncompletedDefs])

  async function handleSave(form) {
    if (!form.text.trim()) return
    setSaving(true)
    try {
      if (form.is_recurring) {
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
        if (error) { console.error('TodaysTasks insert recurring:', error); return }
        if (data) setRecurringDefs(prev => [...prev, data])
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
        if (error) { console.error('TodaysTasks insert task:', error); return }
        if (data) {
          if (data.task_date === todayStr) setRegularTasks(prev => [...prev, data])
          if (onTaskChanged) onTaskChanged(data)
        }
      }
      setShowModal(false)
    } catch (e) {
      console.error('TodaysTasks handleSave:', e)
    } finally {
      setSaving(false)
    }
  }

  async function toggleItem(item) {
    if (item.is_recurring) {
      // Def proxy — create a completed instance
      const { data, error } = await supabase.from('tasks').insert([{
        text: item.text,
        priority: item.priority,
        task_date: todayStr,
        task_time: item.task_time || null,
        done: true,
        is_recurring: false,
        recurrence_parent_id: item.id,
      }]).select().single()
      if (error) { console.error('toggleItem complete recurring:', error); return }
      if (data) setRegularTasks(prev => [...prev, data])
    } else if (item.recurrence_parent_id) {
      // Completed instance — delete it to un-complete
      await supabase.from('tasks').delete().eq('id', item.id)
      setRegularTasks(prev => prev.filter(t => t.id !== item.id))
    } else {
      // Regular task — toggle done
      const newDone = !item.done
      await supabase.from('tasks').update({ done: newDone }).eq('id', item.id)
      setRegularTasks(prev => prev.map(t => t.id === item.id ? { ...t, done: newDone } : t))
    }
  }

  async function snoozeTask(task) {
    await supabase.from('tasks').update({ task_date: tomorrowStr, snoozed_from: todayStr }).eq('id', task.id)
    setRegularTasks(prev => prev.filter(t => t.id !== task.id))
  }

  async function deleteItem(item) {
    await supabase.from('tasks').delete().eq('id', item.id)
    setRegularTasks(prev => prev.filter(t => t.id !== item.id))
  }

  async function handleEditSave(form) {
    if (!form.text.trim()) return
    setSaving(true)
    try {
      if (editingItem.is_recurring) {
        const payload = {
          text: form.text.trim(),
          priority: form.priority,
          recurrence_frequency: form.recurrence_frequency,
          recurrence_day_of_week: form.recurrence_frequency === 'weekly' ? form.recurrence_day_of_week : null,
          recurrence_day_of_month: form.recurrence_frequency === 'monthly' ? form.recurrence_day_of_month : null,
          task_time: form.time || null,
        }
        const { data } = await supabase.from('tasks').update(payload).eq('id', editingItem.id).select().single()
        if (data) setRecurringDefs(prev => prev.map(d => d.id === editingItem.id ? data : d))
      } else {
        const payload = {
          text: form.text.trim(),
          priority: form.priority,
          task_date: form.date || todayStr,
          task_time: form.time || null,
        }
        const { data } = await supabase.from('tasks').update(payload).eq('id', editingItem.id).select().single()
        if (data) {
          if (data.task_date === todayStr) {
            setRegularTasks(prev => prev.map(t => t.id === editingItem.id ? data : t))
          } else {
            setRegularTasks(prev => prev.filter(t => t.id !== editingItem.id))
          }
          if (onTaskChanged) onTaskChanged(data)
        }
      }
      setEditingItem(null)
    } catch (e) {
      console.error('TodaysTasks handleEditSave:', e)
    } finally {
      setSaving(false)
    }
  }

  function isDone(item) {
    if (item.is_recurring) return false
    if (item.recurrence_parent_id) return true
    return item.done
  }

  const cardCls = 'bg-gray-900 border border-gray-800 rounded-lg p-6'
  const labelCls = 'text-sm tracking-widest uppercase text-gray-400'
  const btnOutlineCls = 'text-xs tracking-widest uppercase px-3 py-1.5 border border-emerald-400 text-emerald-400 rounded hover:bg-emerald-400 hover:text-gray-950 transition-colors'

  const shownItems = compact ? displayItems.slice(0, 6) : displayItems

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between mb-4">
        <h2 className={labelCls}>Today's Tasks</h2>
        <button onClick={() => setShowModal(true)} className={btnOutlineCls}>+ Add Task</button>
      </div>

      {shownItems.length === 0 ? (
        <div className="text-sm text-gray-600">No tasks for today</div>
      ) : (
        <div>
          {shownItems.map((item, idx) => {
            const done = isDone(item)
            const isRecDef = item.is_recurring
            const isInstance = !item.is_recurring && !!item.recurrence_parent_id
            const isSnoozed = !!item.snoozed_from
            const canSnooze = !isRecDef && !isInstance && !compact

            return (
              <div key={item.id || `proxy-${idx}`} className="flex items-center gap-2 group py-2 border-b border-gray-800 last:border-0">
                <button
                  onClick={() => toggleItem(item)}
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
                  <div className="flex items-center gap-1.5 min-w-0">
                    {item.task_time && (
                      <span className="text-xs text-gray-500 shrink-0">{item.task_time.slice(0, 5)}</span>
                    )}
                    <span className={`text-sm truncate ${done ? 'line-through text-gray-600' : 'text-white'}`}>{item.text}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {(isRecDef || isInstance) && (
                      <span className="text-[10px] border px-1 py-px rounded tracking-widest text-purple-400 border-purple-400">↻ REC</span>
                    )}
                    {isSnoozed && (
                      <span className="text-[10px] border px-1 py-px rounded tracking-widest text-amber-400 border-amber-400">SNOOZED</span>
                    )}
                  </div>
                </div>

                <span className={`text-xs border px-1.5 py-0.5 rounded tracking-widest shrink-0 ${PRIORITY_BADGE[item.priority] || PRIORITY_BADGE.MEDIUM}`}>
                  {item.priority}
                </span>

                <button
                  onClick={() => setEditingItem(item)}
                  className="text-gray-600 hover:text-white transition-colors opacity-0 group-hover:opacity-100 text-xs uppercase tracking-widest shrink-0"
                >Edit</button>

                {canSnooze && (
                  <button
                    onClick={() => snoozeTask(item)}
                    title="Snooze to tomorrow"
                    className="text-gray-600 hover:text-amber-400 transition-colors opacity-0 group-hover:opacity-100 text-sm shrink-0"
                  >→</button>
                )}

                {!isRecDef && (
                  <button
                    onClick={() => deleteItem(item)}
                    className="text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-lg leading-none shrink-0"
                  >×</button>
                )}
              </div>
            )
          })}
          {compact && displayItems.length > 6 && (
            <div className="text-xs text-gray-600 pt-2">+{displayItems.length - 6} more</div>
          )}
        </div>
      )}

      {showModal && (
        <AddTaskModal
          title="Add Task"
          onClose={() => setShowModal(false)}
          onSave={handleSave}
          saving={saving}
        />
      )}

      {editingItem && (
        <AddTaskModal
          title={editingItem.is_recurring ? 'Edit Recurring Task' : 'Edit Task'}
          onClose={() => setEditingItem(null)}
          onSave={handleEditSave}
          initial={editingItem.is_recurring ? {
            text: editingItem.text,
            time: editingItem.task_time || '',
            priority: editingItem.priority,
            is_recurring: true,
            recurrence_frequency: editingItem.recurrence_frequency || 'daily',
            recurrence_day_of_week: editingItem.recurrence_day_of_week ?? 0,
            recurrence_day_of_month: editingItem.recurrence_day_of_month ?? 1,
          } : {
            text: editingItem.text,
            date: editingItem.task_date || todayStr,
            time: editingItem.task_time || '',
            priority: editingItem.priority,
            is_recurring: false,
          }}
          saving={saving}
          lockRecurring={editingItem.is_recurring}
        />
      )}
    </div>
  )
}
