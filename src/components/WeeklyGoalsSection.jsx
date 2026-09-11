import { useState } from 'react'
import { supabase } from '../supabase'
import { localDate } from '../utils/taskHelpers'
import { isoMonday, weekDates, dayLabel, DAY_LABELS, weekOffsetLabel, weekRangeLabel } from '../utils/productivityHelpers'
import ConfirmPopover from './ConfirmPopover'

// Weekly Goals — frequency targets per week (Gym 3x, Sauna 1x, Facetime Mum 1x).
// They reset weekly. Completions live in `weekly_goal_completions`, keyed by
// week_start_date, so the current week is naturally fresh on rollover and past
// weeks stay as permanent history. `goal_type` is 'numeric' (N×/week) or
// 'boolean' (single 1× completion).
//
// Past weeks are navigable with the same ‹ › control as Habits. `completions` is
// a multi-week window from the parent, filtered to the selected week here, so
// paging back never refetches.
export default function WeeklyGoalsSection({ goals, setGoals, completions, setCompletions }) {
  const [weekOffset, setWeekOffset] = useState(0)
  const monday = isoMonday(weekOffset)
  const days = weekDates(monday)
  const today = localDate()
  const isCurrentWeek = weekOffset === 0

  // Only this week's completions drive the dots and counts.
  const weekCompletions = completions.filter(c => c.week_start_date === monday)

  // Current week shows the active goal list. Past weeks additionally include
  // goals since soft-deleted (`active = false`) that were actually logged that
  // week, so history stays truthful rather than silently dropping them.
  const loggedThisWeek = new Set(weekCompletions.map(c => c.weekly_goal_id))
  const visibleGoals = isCurrentWeek
    ? goals.filter(g => g.active)
    : goals.filter(g => g.active || loggedThisWeek.has(g.id))

  const [popover, setPopover] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', target_count: 1, goal_type: 'numeric' })
  const [adding, setAdding] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', target_count: 3, goal_type: 'numeric' })

  const goalTarget = g => (g.goal_type === 'boolean' ? 1 : g.target_count || 1)
  const isDone = (goalId, dateStr) => weekCompletions.some(c => c.weekly_goal_id === goalId && c.completed_date === dateStr)
  const goalCount = goalId => weekCompletions.filter(c => c.weekly_goal_id === goalId).length

  async function setCompletion(goalId, dateStr, done) {
    setCompletions(prev => done
      ? [...prev, { weekly_goal_id: goalId, week_start_date: monday, completed_date: dateStr }]
      : prev.filter(c => !(c.weekly_goal_id === goalId && c.week_start_date === monday && c.completed_date === dateStr)))
    if (done) {
      await supabase.from('weekly_goal_completions')
        .upsert({ weekly_goal_id: goalId, week_start_date: monday, completed_date: dateStr },
          { onConflict: 'weekly_goal_id,week_start_date,completed_date', ignoreDuplicates: true })
    } else {
      await supabase.from('weekly_goal_completions').delete()
        .eq('weekly_goal_id', goalId).eq('week_start_date', monday).eq('completed_date', dateStr)
    }
  }

  function onDotClick(e, goal, dateStr) {
    if (dateStr > today) return
    const done = isDone(goal.id, dateStr)
    if (dateStr === today) { setCompletion(goal.id, dateStr, !done); return }
    setPopover({ goalId: goal.id, dateStr, done, goalName: goal.name, x: e.clientX, y: e.clientY })
  }

  function confirmPopover() {
    if (popover) setCompletion(popover.goalId, popover.dateStr, !popover.done)
    setPopover(null)
  }

  async function addGoal() {
    const name = addForm.name.trim()
    if (!name) return
    const payload = {
      name,
      goal_type: addForm.goal_type,
      target_count: addForm.goal_type === 'boolean' ? 1 : parseInt(addForm.target_count) || 1,
      active: true,
    }
    const { data } = await supabase.from('weekly_goals').insert(payload).select().single()
    if (data) setGoals(prev => [...prev, data])
    setAddForm({ name: '', target_count: 3, goal_type: 'numeric' })
    setAdding(false)
  }

  function startEdit(goal) {
    setEditingId(goal.id)
    setEditForm({ name: goal.name, target_count: goal.target_count || 1, goal_type: goal.goal_type || 'numeric' })
  }

  async function saveEdit(goal) {
    const name = editForm.name.trim()
    if (!name) { setEditingId(null); return }
    const payload = {
      name,
      goal_type: editForm.goal_type,
      target_count: editForm.goal_type === 'boolean' ? 1 : parseInt(editForm.target_count) || 1,
    }
    await supabase.from('weekly_goals').update(payload).eq('id', goal.id)
    setGoals(prev => prev.map(g => (g.id === goal.id ? { ...g, ...payload } : g)))
    setEditingId(null)
  }

  async function deleteGoal(goal) {
    // Soft delete — the goal keeps its completion history, so mark it inactive
    // locally rather than dropping the row. Past weeks still list it if it was
    // logged then; the current week filters it out.
    await supabase.from('weekly_goals').update({ active: false }).eq('id', goal.id)
    setGoals(prev => prev.map(g => (g.id === goal.id ? { ...g, active: false } : g)))
    setEditingId(null)
  }

  const inputCls = 'bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-400'
  const selectCls = `${inputCls} appearance-none`

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="text-sm tracking-widest uppercase text-gray-400">Weekly Goals</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setWeekOffset(o => o - 1)}
            className="text-gray-500 hover:text-white transition-colors text-xl leading-none"
          >‹</button>
          <div className="text-center">
            <div className="text-xs text-white">{weekOffsetLabel(weekOffset)}</div>
            <div className="text-[10px] text-gray-600">{weekRangeLabel(monday)}</div>
          </div>
          <button
            onClick={() => setWeekOffset(o => Math.min(0, o + 1))}
            disabled={isCurrentWeek}
            className="text-gray-500 hover:text-white transition-colors text-xl leading-none disabled:opacity-30 disabled:cursor-default"
          >›</button>
        </div>
      </div>

      <div className="space-y-3">
        {visibleGoals.length === 0 && (
          <div className="text-sm text-gray-600">
            {isCurrentWeek ? 'No weekly goals set' : 'No weekly goals tracked this week'}
          </div>
        )}
        {visibleGoals.map(goal => {
          const target = goalTarget(goal)
          const count = goalCount(goal.id)
          const hit = count >= target
          if (editingId === goal.id) {
            return (
              <div key={goal.id} className="p-3 bg-gray-800/60 rounded-lg space-y-2">
                <input
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className={`w-full ${inputCls}`}
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <select value={editForm.goal_type} onChange={e => setEditForm(f => ({ ...f, goal_type: e.target.value }))} className={selectCls}>
                    <option value="numeric">Numeric (N× / week)</option>
                    <option value="boolean">Single (1×)</option>
                  </select>
                  {editForm.goal_type === 'numeric' && (
                    <input
                      type="number" min="1"
                      value={editForm.target_count}
                      onChange={e => setEditForm(f => ({ ...f, target_count: e.target.value }))}
                      className={`w-16 ${inputCls}`}
                    />
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => saveEdit(goal)} className="text-xs text-emerald-400 hover:text-emerald-300 uppercase tracking-widest">Save</button>
                  <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 hover:text-white uppercase tracking-widest">Cancel</button>
                  <button onClick={() => deleteGoal(goal)} className="text-xs text-gray-600 hover:text-red-400 uppercase tracking-widest ml-auto">Delete</button>
                </div>
              </div>
            )
          }
          return (
            <div key={goal.id} className="group">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-sm text-white truncate">{goal.name}</span>
                  <button
                    onClick={() => startEdit(goal)}
                    className="text-gray-600 hover:text-white transition-colors text-xs opacity-0 group-hover:opacity-100 shrink-0"
                    title="Edit goal"
                  >✎</button>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {days.map((dateStr, i) => {
                    const done = isDone(goal.id, dateStr)
                    const isFuture = dateStr > today
                    const isToday = dateStr === today
                    return (
                      <button
                        key={dateStr}
                        disabled={isFuture}
                        onClick={e => onDotClick(e, goal, dateStr)}
                        title={`${DAY_LABELS[i]} ${dateStr.slice(8)}`}
                        className={`w-6 h-6 rounded-md border transition-colors ${
                          done
                            ? 'bg-emerald-400 border-emerald-400'
                            : isFuture
                              ? 'border-gray-800 bg-transparent cursor-default'
                              : 'border-gray-700 bg-gray-800 hover:border-emerald-400'
                        } ${isToday && !done ? 'ring-1 ring-emerald-400/40' : ''}`}
                      />
                    )
                  })}
                </div>
                <span className={`shrink-0 w-10 text-right text-sm font-bold ${hit ? 'text-emerald-400' : 'text-red-400'}`}>
                  {count}/{target}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Adding a goal only makes sense for the current week — a new goal applies
          going forward, not retroactively. */}
      <div className="mt-4">
        {!isCurrentWeek ? (
          <div className="text-[10px] text-gray-600 uppercase tracking-widest">Viewing a past week — read-only list</div>
        ) : adding ? (
          <div className="p-3 bg-gray-800/60 rounded-lg space-y-2">
            <input
              value={addForm.name}
              onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addGoal()}
              placeholder="Goal name"
              className={`w-full ${inputCls}`}
              autoFocus
            />
            <div className="flex items-center gap-2">
              <select value={addForm.goal_type} onChange={e => setAddForm(f => ({ ...f, goal_type: e.target.value }))} className={selectCls}>
                <option value="numeric">Numeric (N× / week)</option>
                <option value="boolean">Single (1×)</option>
              </select>
              {addForm.goal_type === 'numeric' && (
                <input
                  type="number" min="1"
                  value={addForm.target_count}
                  onChange={e => setAddForm(f => ({ ...f, target_count: e.target.value }))}
                  className={`w-16 ${inputCls}`}
                />
              )}
            </div>
            <div className="flex items-center gap-3">
              <button onClick={addGoal} disabled={!addForm.name.trim()} className="text-xs text-emerald-400 hover:text-emerald-300 uppercase tracking-widest disabled:opacity-40">Add</button>
              <button onClick={() => setAdding(false)} className="text-xs text-gray-500 hover:text-white uppercase tracking-widest">Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="text-xs tracking-widest uppercase px-3 py-1.5 border border-emerald-400 text-emerald-400 rounded hover:bg-emerald-400 hover:text-gray-950 transition-colors"
          >+ Add Weekly Goal</button>
        )}
      </div>

      {popover && (
        <ConfirmPopover
          x={popover.x}
          y={popover.y}
          message={popover.done
            ? `Unmark ${dayLabel(popover.dateStr)} for ${popover.goalName}?`
            : `Mark ${dayLabel(popover.dateStr)} as done for ${popover.goalName}?`}
          confirmLabel={popover.done ? 'Unmark' : 'Confirm'}
          onConfirm={confirmPopover}
          onCancel={() => setPopover(null)}
        />
      )}
    </div>
  )
}
