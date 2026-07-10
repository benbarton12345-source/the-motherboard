import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { localDate, shiftDate } from '../utils/taskHelpers'
import { isoMonday, weekDates, streakEndingToday, weekOffsetLabel, weekRangeLabel, dayLabel } from '../utils/productivityHelpers'
import ConfirmPopover from './ConfirmPopover'

// Habits section shared by the Habits & Goals page (full mode) and the
// Overview page (compact mode). Tracks per-habit completions in
// `habit_completions` with real dates so history is permanent + backfillable.
//
// State can be controlled (parent passes habits/completions + setters, e.g. the
// Habits & Goals page which also needs the data for its summary strip) or
// self-managed (Overview embeds it standalone). Mirrors the optional-controlled
// pattern used by TodaysTasks.
export default function HabitTracker({
  compact = false,
  habits: habitsProp,
  setHabits: setHabitsProp,
  completions: completionsProp,
  setCompletions: setCompletionsProp,
}) {
  const controlled = !!setHabitsProp && !!setCompletionsProp

  const [habitsLocal, setHabitsLocal] = useState([])
  const [completionsLocal, setCompletionsLocal] = useState([])
  const habits = controlled ? habitsProp : habitsLocal
  const completions = controlled ? completionsProp : completionsLocal
  const setHabits = controlled ? setHabitsProp : setHabitsLocal
  const setCompletions = controlled ? setCompletionsProp : setCompletionsLocal

  const [weekOffset, setWeekOffset] = useState(0)
  const [popover, setPopover] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [adding, setAdding] = useState(false)
  const [addName, setAddName] = useState('')

  const today = localDate()

  // Self-fetch only when uncontrolled.
  useEffect(() => {
    if (controlled) return
    const windowStart = shiftDate(today, -365)
    supabase.from('habits').select('*').order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setHabitsLocal(data) })
    supabase.from('habit_completions').select('habit_id, completed_date').gte('completed_date', windowStart)
      .then(({ data }) => { if (data) setCompletionsLocal(data) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const monday = isoMonday(compact ? 0 : weekOffset)
  const days = weekDates(monday)

  const isDone = (habitId, dateStr) =>
    completions.some(c => c.habit_id === habitId && c.completed_date === dateStr)

  function habitStreak(habitId) {
    const set = new Set(completions.filter(c => c.habit_id === habitId).map(c => c.completed_date))
    return streakEndingToday(set, today)
  }

  async function setCompletion(habitId, dateStr, done) {
    setCompletions(prev => done
      ? [...prev, { habit_id: habitId, completed_date: dateStr }]
      : prev.filter(c => !(c.habit_id === habitId && c.completed_date === dateStr)))
    if (done) {
      await supabase.from('habit_completions')
        .upsert({ habit_id: habitId, completed_date: dateStr }, { onConflict: 'habit_id,completed_date', ignoreDuplicates: true })
    } else {
      await supabase.from('habit_completions').delete().eq('habit_id', habitId).eq('completed_date', dateStr)
    }
  }

  function onDotClick(e, habit, dateStr) {
    if (dateStr > today) return // future day — not completable
    const done = isDone(habit.id, dateStr)
    if (dateStr === today) {
      setCompletion(habit.id, dateStr, !done)
      return
    }
    // Any past day (past week or earlier this week) requires confirmation.
    setPopover({ habitId: habit.id, dateStr, done, habitName: habit.name, x: e.clientX, y: e.clientY })
  }

  function confirmPopover() {
    if (popover) setCompletion(popover.habitId, popover.dateStr, !popover.done)
    setPopover(null)
  }

  async function addHabit() {
    const name = addName.trim()
    if (!name) return
    const { data } = await supabase.from('habits')
      .insert({ name, created_at: new Date().toISOString() }).select().single()
    if (data) setHabits(prev => [...prev, data])
    setAddName('')
    setAdding(false)
  }

  function startEdit(habit) {
    setEditingId(habit.id)
    setEditName(habit.name)
  }

  async function saveEdit(habit) {
    const name = editName.trim()
    if (!name) { setEditingId(null); return }
    await supabase.from('habits').update({ name }).eq('id', habit.id)
    setHabits(prev => prev.map(h => (h.id === habit.id ? { ...h, name } : h)))
    setEditingId(null)
  }

  async function deleteHabit(habit) {
    await supabase.from('habits').delete().eq('id', habit.id)
    setHabits(prev => prev.filter(h => h.id !== habit.id))
    setCompletions(prev => prev.filter(c => c.habit_id !== habit.id))
    setEditingId(null)
  }

  const dotSize = compact ? 'w-5 h-5' : 'w-6 h-6'
  const inputCls = 'bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-400'

  function DotGrid({ habit }) {
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        {days.map(dateStr => {
          const done = isDone(habit.id, dateStr)
          const isFuture = dateStr > today
          const isToday = dateStr === today
          return (
            <button
              key={dateStr}
              disabled={isFuture}
              onClick={e => onDotClick(e, habit, dateStr)}
              title={dayLabel(dateStr)}
              className={`${dotSize} rounded-md border transition-colors ${
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
    )
  }

  function HabitRow({ habit }) {
    const streak = habitStreak(habit.id)
    if (!compact && editingId === habit.id) {
      return (
        <div className="flex items-center gap-2 py-1">
          <input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveEdit(habit)}
            className={`flex-1 ${inputCls}`}
            autoFocus
          />
          <button onClick={() => saveEdit(habit)} className="text-xs text-emerald-400 hover:text-emerald-300 uppercase tracking-widest">Save</button>
          <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 hover:text-white uppercase tracking-widest">Cancel</button>
          <button onClick={() => deleteHabit(habit)} className="text-xs text-gray-600 hover:text-red-400 uppercase tracking-widest">Delete</button>
        </div>
      )
    }
    return (
      <div className="group flex items-center gap-3 py-1">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm text-white truncate">{habit.name}</span>
          {!compact && (
            <button
              onClick={() => startEdit(habit)}
              className="text-gray-600 hover:text-white transition-colors text-xs opacity-0 group-hover:opacity-100 shrink-0"
              title="Edit habit"
            >✎</button>
          )}
        </div>
        <DotGrid habit={habit} />
        <div className="shrink-0 w-14 text-right">
          {streak > 0
            ? <span className="text-xs text-emerald-400 font-medium">🔥 {streak}d</span>
            : <span className="text-xs text-gray-600">—</span>}
        </div>
      </div>
    )
  }

  const rows = (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      {habits.length === 0
        ? <div className="text-sm text-gray-600">No habits yet</div>
        : habits.map(h => <HabitRow key={h.id} habit={h} />)}
    </div>
  )

  const popoverEl = popover && (
    <ConfirmPopover
      x={popover.x}
      y={popover.y}
      message={popover.done
        ? `Unmark ${dayLabel(popover.dateStr)} for ${popover.habitName}?`
        : `Mark ${dayLabel(popover.dateStr)} as done for ${popover.habitName}?`}
      confirmLabel={popover.done ? 'Unmark' : 'Confirm'}
      onConfirm={confirmPopover}
      onCancel={() => setPopover(null)}
    />
  )

  // Compact: just the rows (Overview wraps its own card/header/link around this).
  if (compact) {
    return <>{rows}{popoverEl}</>
  }

  // Full: card with week navigator + add control.
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="text-sm tracking-widest uppercase text-gray-400">Habits</h2>
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
            disabled={weekOffset === 0}
            className="text-gray-500 hover:text-white transition-colors text-xl leading-none disabled:opacity-30 disabled:cursor-default"
          >›</button>
        </div>
      </div>

      {rows}

      <div className="mt-4">
        {adding ? (
          <div className="flex items-center gap-2">
            <input
              value={addName}
              onChange={e => setAddName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' ? addHabit() : e.key === 'Escape' ? setAdding(false) : null}
              placeholder="Habit name"
              className={`flex-1 ${inputCls}`}
              autoFocus
            />
            <button onClick={addHabit} disabled={!addName.trim()} className="text-xs text-emerald-400 hover:text-emerald-300 uppercase tracking-widest disabled:opacity-40">Add</button>
            <button onClick={() => { setAdding(false); setAddName('') }} className="text-xs text-gray-500 hover:text-white uppercase tracking-widest">Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="text-xs tracking-widest uppercase px-3 py-1.5 border border-emerald-400 text-emerald-400 rounded hover:bg-emerald-400 hover:text-gray-950 transition-colors"
          >+ Add Habit</button>
        )}
      </div>

      {popoverEl}
    </div>
  )
}
