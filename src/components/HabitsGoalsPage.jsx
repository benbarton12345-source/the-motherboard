import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { localDate, shiftDate } from '../utils/taskHelpers'
import { isoMonday, streakEndingToday, yearlyPaceStatus } from '../utils/productivityHelpers'
import HabitTracker from './HabitTracker'
import WeeklyGoalsSection from './WeeklyGoalsSection'
import YearlyGoalsSection from './YearlyGoalsSection'
import LongTermGoalsSection from './LongTermGoalsSection'

// Habits & Goals — one long scrollable page covering habits plus all three goal
// tiers. Owns the shared data so the summary strip and the individual sections
// stay in sync (sections mutate via passed setters).
export default function HabitsGoalsPage() {
  const [habits, setHabits] = useState([])
  const [completions, setCompletions] = useState([])
  const [weeklyGoals, setWeeklyGoals] = useState([])
  const [weeklyCompletions, setWeeklyCompletions] = useState([])
  const [yearlyGoals, setYearlyGoals] = useState([])
  const [longTermGoals, setLongTermGoals] = useState([])
  const [journal, setJournal] = useState([])

  const monday = isoMonday(0)

  useEffect(() => {
    const windowStart = shiftDate(localDate(), -365)
    supabase.from('habits').select('*').order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setHabits(data) })
    supabase.from('habit_completions').select('habit_id, completed_date').gte('completed_date', windowStart)
      .then(({ data }) => { if (data) setCompletions(data) })
    supabase.from('weekly_goals').select('*').eq('active', true).order('created_at')
      .then(({ data }) => { if (data) setWeeklyGoals(data) })
    supabase.from('weekly_goal_completions').select('*').eq('week_start_date', monday)
      .then(({ data }) => { if (data) setWeeklyCompletions(data) })
    supabase.from('yearly_goals').select('*').order('created_at')
      .then(({ data }) => { if (data) setYearlyGoals(data) })
    supabase.from('long_term_goals').select('*').order('created_at')
      .then(({ data }) => { if (data) setLongTermGoals(data) })
    supabase.from('long_term_goal_journal').select('*').order('entry_date', { ascending: false }).order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setJournal(data) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Summary strip ──────────────────────────────────────────────────────────
  const visibleYearly = yearlyGoals.filter(g => !/freedom figure/i.test(g.name))
  const numericYearly = visibleYearly.filter(g => g.goal_type === 'numeric')
  const yearlyOnTrack = numericYearly.filter(g => yearlyPaceStatus(Number(g.current_value) || 0, Number(g.target_value) || 0) === 'on_track').length

  const topStreak = habits.reduce((max, h) => {
    const set = new Set(completions.filter(c => c.habit_id === h.id).map(c => c.completed_date))
    return Math.max(max, streakEndingToday(set))
  }, 0)

  const ltAchieved = longTermGoals.filter(g => g.status === 'done').length

  const weeklyHit = weeklyGoals.filter(g => {
    const target = g.goal_type === 'boolean' ? 1 : g.target_count || 1
    const count = weeklyCompletions.filter(c => c.weekly_goal_id === g.id).length
    return count >= target
  }).length

  const stats = [
    { label: 'Yearly Goals', value: `${yearlyOnTrack}`, sub: `/ ${visibleYearly.length} on track`, tone: 'text-emerald-400' },
    { label: 'Top Habit Streak', value: topStreak, sub: topStreak === 1 ? 'day' : 'days', tone: 'text-emerald-400' },
    { label: 'Long-term Goals', value: `${ltAchieved}`, sub: `/ ${longTermGoals.length} achieved`, tone: 'text-white' },
    { label: 'Weekly Goals', value: `${weeklyHit}`, sub: `/ ${weeklyGoals.length} hit this week`, tone: weeklyGoals.length > 0 && weeklyHit === weeklyGoals.length ? 'text-emerald-400' : 'text-white' },
  ]

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-lg p-5">
            <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">{s.label}</div>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-3xl font-bold ${s.tone}`}>{s.value}</span>
              <span className="text-xs text-gray-500">{s.sub}</span>
            </div>
          </div>
        ))}
      </div>

      <HabitTracker
        habits={habits} setHabits={setHabits}
        completions={completions} setCompletions={setCompletions}
      />

      <WeeklyGoalsSection
        goals={weeklyGoals} setGoals={setWeeklyGoals}
        completions={weeklyCompletions} setCompletions={setWeeklyCompletions}
      />

      <YearlyGoalsSection goals={yearlyGoals} setGoals={setYearlyGoals} />

      <LongTermGoalsSection
        goals={longTermGoals} setGoals={setLongTermGoals}
        journal={journal} setJournal={setJournal}
      />
    </div>
  )
}
