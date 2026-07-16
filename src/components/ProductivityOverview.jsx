import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { localDate, shiftDate } from '../utils/taskHelpers'
import {
  isoMonday, streakEndingToday, yearFraction, yearlyPaceStatus, PACE_META,
  isoWeekNumber, weekRangeLabel,
} from '../utils/productivityHelpers'
import HabitTracker from './HabitTracker'
import TodaysTasks from './TodaysTasks'
import WeeklyReviewModal from './WeeklyReviewModal'
import DailyIdentityModal from './DailyIdentityModal'
import {
  IDENTITY_DOMAINS, IDENTITY_WINDOW_DAYS, identityBadge, tallyLabel,
} from '../utils/identityDomains'

// Productivity Overview — a 10-second pulse across all four sub-pages. Reads
// live data where the source is already built (habits, weekly/yearly goals,
// weekly review, reading, tasks). The Weekly Review card opens the full
// WeeklyReviewModal (edit or history mode) and refreshes on seal.
export default function ProductivityOverview({ onOpenSub }) {
  const today = localDate()
  const monday = isoMonday(0)

  const [habits, setHabits] = useState([])
  const [completions, setCompletions] = useState([])
  const [weeklyGoals, setWeeklyGoals] = useState([])
  const [weeklyCompletions, setWeeklyCompletions] = useState([])
  const [yearlyGoals, setYearlyGoals] = useState([])
  const [tasks, setTasks] = useState([])
  const [currentBook, setCurrentBook] = useState(null)
  const [booksDone, setBooksDone] = useState(0)
  const [readingGoal, setReadingGoal] = useState(24)
  const [review, setReview] = useState(null)
  const [sealedWeeks, setSealedWeeks] = useState(new Set())
  const [reviewModal, setReviewModal] = useState(null) // null | { history: bool }
  const [identityToday, setIdentityToday] = useState([])   // today's rows
  const [identityWindow, setIdentityWindow] = useState([]) // trailing-window rows
  const [identityOpen, setIdentityOpen] = useState(false)

  function refreshReview() {
    supabase.from('weekly_reviews').select('*').eq('week_start', monday).maybeSingle()
      .then(({ data }) => { setReview(data || null) })
    supabase.from('weekly_reviews').select('week_start, sealed_at').not('sealed_at', 'is', null)
      .then(({ data }) => { if (data) setSealedWeeks(new Set(data.map(r => r.week_start))) })
  }

  function refreshIdentity() {
    const windowStart = shiftDate(today, -(IDENTITY_WINDOW_DAYS - 1))
    supabase.from('identity_votes').select('domain, vote, note').eq('vote_date', today)
      .then(({ data }) => { if (data) setIdentityToday(data) })
    supabase.from('identity_votes').select('domain, vote').gte('vote_date', windowStart)
      .then(({ data }) => { if (data) setIdentityWindow(data) })
  }

  useEffect(() => {
    const windowStart = shiftDate(today, -365)
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
    // Today's regular tasks + still-open overdue (recurring tasks excluded — the
    // Tasks sub-page owns the recurrence engine; this is a glance stat only).
    supabase.from('tasks').select('*').eq('is_recurring', false).lte('task_date', today)
      .then(({ data }) => { if (data) setTasks(data) })
    // Reading (books table is live — pull real current book + finished count).
    supabase.from('books').select('*')
      .then(({ data }) => {
        if (!data) return
        setCurrentBook(data.find(b => b.status === 'current') || null)
        const yr = new Date().getFullYear()
        setBooksDone(data.filter(b => b.status === 'finished' && (b.finished_at || '').slice(0, 4) === String(yr)).length)
      })
    supabase.from('reading_settings').select('goal').limit(1).maybeSingle()
      .then(({ data }) => { if (data?.goal) setReadingGoal(data.goal) })
    supabase.from('weekly_reviews').select('*').eq('week_start', monday).maybeSingle()
      .then(({ data }) => { setReview(data || null) })
    supabase.from('weekly_reviews').select('week_start, sealed_at').not('sealed_at', 'is', null)
      .then(({ data }) => { if (data) setSealedWeeks(new Set(data.map(r => r.week_start))) })
    // Identity votes — today (stat card + banner) and the trailing window (widget).
    const identityStart = shiftDate(today, -(IDENTITY_WINDOW_DAYS - 1))
    supabase.from('identity_votes').select('domain, vote, note').eq('vote_date', today)
      .then(({ data }) => { if (data) setIdentityToday(data) })
    supabase.from('identity_votes').select('domain, vote').gte('vote_date', identityStart)
      .then(({ data }) => { if (data) setIdentityWindow(data) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Snapshot stats ─────────────────────────────────────────────────────────
  const todayTasks = tasks.filter(t => t.task_date === today)
  const tasksDone = todayTasks.filter(t => t.done).length
  const tasksTotal = todayTasks.length
  const overdue = tasks.filter(t => t.task_date < today && !t.done).length

  const habitScoreToday = habits.filter(h =>
    completions.some(c => c.habit_id === h.id && c.completed_date === today)).length
  const topStreak = habits.reduce((max, h) => {
    const set = new Set(completions.filter(c => c.habit_id === h.id).map(c => c.completed_date))
    return Math.max(max, streakEndingToday(set))
  }, 0)

  const weeklyHit = weeklyGoals.filter(g => {
    const target = g.goal_type === 'boolean' ? 1 : g.target_count || 1
    return weeklyCompletions.filter(c => c.weekly_goal_id === g.id).length >= target
  }).length

  // ── Reading ────────────────────────────────────────────────────────────────
  const expectedBooks = readingGoal * yearFraction()
  const readingOnTrack = booksDone - expectedBooks >= -0.7

  // ── Weekly review state ────────────────────────────────────────────────────
  const reviewSealed = !!review?.sealed_at
  const reviewInProgress = !reviewSealed && !!review && [
    review.went_well, review.challenge_overcome, review.improve_next_week,
    review.proud_of, review.anything_else, review.consistency_score,
  ].some(v => v !== null && v !== '' && v !== undefined)

  let reviewStreak = 0
  {
    let cur = sealedWeeks.has(monday) ? monday : shiftDate(monday, -7)
    while (sealedWeeks.has(cur)) { reviewStreak++; cur = shiftDate(cur, -7) }
  }

  // ── Goals pulse (2-4 numeric yearly goals) ─────────────────────────────────
  const pulseGoals = yearlyGoals
    .filter(g => !/freedom figure/i.test(g.name) && g.goal_type === 'numeric')
    .slice(0, 4)

  // ── Identity ───────────────────────────────────────────────────────────────
  // Today's tally (stat card + banner subtitle).
  const identityCounts = identityToday.reduce((acc, r) => {
    if (r.vote === 'for') acc.forCount++
    else if (r.vote === 'neutral') acc.neutral++
    else if (r.vote === 'against') acc.against++
    return acc
  }, { forCount: 0, neutral: 0, against: 0 })
  const identityCast = identityCounts.forCount + identityCounts.neutral + identityCounts.against

  // Trailing-window aggregate, one entry per domain (in fixed domain order).
  const identityAgg = IDENTITY_DOMAINS.map(d => {
    const rows = identityWindow.filter(r => r.domain === d.name)
    const t = {
      forCount: rows.filter(r => r.vote === 'for').length,
      neutral: rows.filter(r => r.vote === 'neutral').length,
      against: rows.filter(r => r.vote === 'against').length,
    }
    const total = t.forCount + t.neutral + t.against
    return { name: d.name, ...t, total, badge: identityBadge(t) }
  })

  const cardCls = 'bg-gray-900 border border-gray-800 rounded-lg p-5'
  const labelCls = 'text-[10px] text-gray-500 uppercase tracking-widest mb-2'
  const viewAll = sub => (
    <button onClick={() => onOpenSub?.(sub)} className="text-xs text-emerald-400 hover:text-emerald-300 uppercase tracking-widest transition-colors">View all →</button>
  )

  // Snapshot cards
  const snapshot = [
    {
      label: 'Tasks Today',
      main: <><span className="text-3xl font-bold text-white">{tasksDone}</span><span className="text-sm text-gray-500">/ {tasksTotal}</span></>,
      sub: overdue > 0 ? <span className="text-red-400">{overdue} overdue</span> : <span className="text-gray-600">none overdue</span>,
    },
    {
      label: 'Habit Score',
      main: <><span className="text-3xl font-bold text-emerald-400">{habitScoreToday}</span><span className="text-sm text-gray-500">/ {habits.length}</span></>,
      sub: topStreak > 0 ? <span className="text-gray-500">top streak {topStreak}d 🔥</span> : <span className="text-gray-600">no streak yet</span>,
    },
    {
      label: 'Goals This Week',
      main: <><span className={`text-3xl font-bold ${weeklyGoals.length > 0 && weeklyHit === weeklyGoals.length ? 'text-emerald-400' : weeklyHit === 0 ? 'text-red-400' : 'text-white'}`}>{weeklyHit}</span><span className="text-sm text-gray-500">/ {weeklyGoals.length}</span></>,
      sub: <span className="text-gray-600">hit this week</span>,
    },
    {
      label: 'Reading',
      main: <span className="text-lg font-bold text-white truncate block">{currentBook ? currentBook.title : 'No current book'}</span>,
      sub: <span className="text-gray-500">{currentBook && currentBook.progress != null ? `${currentBook.progress}% · ` : ''}{booksDone}/{readingGoal} books</span>,
    },
    {
      label: 'Identity Today',
      main: <><span className="text-3xl font-bold text-emerald-400">{identityCast}</span><span className="text-sm text-gray-500">/ {IDENTITY_DOMAINS.length}</span></>,
      sub: <span className="text-gray-500">{tallyLabel(identityCounts)}</span>,
    },
  ]

  return (
    <div className="space-y-4">
      {/* Week snapshot strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {snapshot.map(s => (
          <div key={s.label} className={cardCls}>
            <div className={labelCls}>{s.label}</div>
            <div className="flex items-baseline gap-1.5 min-w-0">{s.main}</div>
            <div className="text-xs mt-1">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Habits This Week + Goals Pulse */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className={`${cardCls} lg:col-span-3`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm tracking-widest uppercase text-gray-400">Habits This Week</h2>
            {viewAll('habits-goals')}
          </div>
          <HabitTracker compact
            habits={habits} setHabits={setHabits}
            completions={completions} setCompletions={setCompletions}
          />
        </div>

        <div className={`${cardCls} lg:col-span-2`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm tracking-widest uppercase text-gray-400">Goals Pulse</h2>
            {viewAll('habits-goals')}
          </div>
          {pulseGoals.length === 0 ? (
            <div className="text-sm text-gray-600">No yearly goals yet</div>
          ) : (
            <div className="space-y-3">
              {pulseGoals.map(g => {
                const current = Number(g.current_value) || 0
                const target = Number(g.target_value) || 0
                const meta = PACE_META[yearlyPaceStatus(current, target)]
                const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0
                return (
                  <div key={g.id}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm text-white truncate">{g.name}</span>
                      <span className={`text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded border shrink-0 ${meta.text} ${meta.border}`}>{meta.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${meta.bar}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[11px] text-gray-500 shrink-0">{current}/{target}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Identity — votes toward who I'm becoming (trailing window, all domains) */}
      <div className={cardCls}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm tracking-widest uppercase text-gray-400">Identity — votes toward who I'm becoming</h2>
          <button onClick={() => setIdentityOpen(true)} className="text-xs text-emerald-400 hover:text-emerald-300 uppercase tracking-widest transition-colors">View all →</button>
        </div>
        <div className="text-[11px] text-gray-600 mb-4">Last {IDENTITY_WINDOW_DAYS} days, all domains</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-7 gap-y-4">
          {identityAgg.map(d => {
            const total = d.total || 1
            return (
              <div key={d.name}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[13px] font-semibold text-gray-100 truncate">{d.name}</span>
                  <span className={`shrink-0 text-[10px] font-bold tracking-widest px-1.5 py-0.5 rounded border whitespace-nowrap ${d.badge.text} ${d.badge.border}`}>{d.badge.label}</span>
                </div>
                <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
                  <div className="bg-emerald-400" style={{ width: `${(d.forCount / total) * 100}%` }} />
                  <div className="bg-amber-400" style={{ width: `${(d.neutral / total) * 100}%` }} />
                  <div className="bg-red-400" style={{ width: `${(d.against / total) * 100}%` }} />
                </div>
                <div className="mt-1 text-[10.5px] text-gray-500">{tallyLabel(d)}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Weekly Review card */}
      <div className={`bg-gray-900 border rounded-lg p-6 ${reviewSealed ? 'border-emerald-400/50' : 'border-amber-400/50'}`}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {reviewSealed ? (
              <span className="w-8 h-8 rounded-full bg-emerald-400/15 text-emerald-400 flex items-center justify-center text-sm font-bold">✓</span>
            ) : (
              <span className="w-8 h-8 rounded-full bg-amber-400/15 text-amber-400 flex items-center justify-center text-sm">◔</span>
            )}
            <div>
              <div className="text-sm text-white font-medium">
                Weekly Review · Week {isoWeekNumber(monday)}
              </div>
              <div className="text-xs text-gray-500">
                {weekRangeLabel(monday)}
                {reviewStreak > 0 && <span className="text-emerald-400"> · {reviewStreak}-week streak</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setReviewModal({ history: true })}
              className="text-xs text-gray-500 hover:text-white uppercase tracking-widest transition-colors"
            >View past reviews</button>
            {reviewSealed ? (
              <button onClick={() => setReviewModal({ history: false })} className="text-xs text-emerald-400 hover:text-emerald-300 uppercase tracking-widest transition-colors">View this week's review →</button>
            ) : (
              <button
                onClick={() => setReviewModal({ history: false })}
                className="px-4 py-2 bg-amber-400 text-gray-950 text-xs font-bold tracking-widest uppercase rounded hover:bg-amber-300 transition-colors"
              >{reviewInProgress ? 'Continue Review' : 'Start Weekly Review'}</button>
            )}
          </div>
        </div>
      </div>

      {/* Identity Check-In banner (same shape as the Weekly Review card) */}
      <div className={`bg-gray-900 border rounded-lg p-6 ${identityCast > 0 ? 'border-emerald-400/50' : 'border-gray-800'}`}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-emerald-400/15 text-emerald-400 flex items-center justify-center text-sm font-bold">✓</span>
            <div>
              <div className="text-sm text-white font-medium">Identity Check-In · Today</div>
              <div className="text-xs text-gray-500">
                {identityCast === 0 ? 'No votes cast yet' : tallyLabel(identityCounts)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIdentityOpen(true)}
              className="px-4 py-2 bg-emerald-400 text-gray-950 text-xs font-bold tracking-widest uppercase rounded hover:bg-emerald-300 transition-colors"
            >{identityCast > 0 ? "Update today's votes" : "Cast today's votes"}</button>
          </div>
        </div>
      </div>

      {/* Today's Tasks + Reading */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TodaysTasks compact />

        <div className={cardCls}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm tracking-widest uppercase text-gray-400">Reading</h2>
            {viewAll('reading')}
          </div>
          {currentBook ? (
            <div className="flex items-start gap-4">
              <div className="w-14 h-20 rounded bg-gradient-to-br from-emerald-950 to-emerald-900 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{currentBook.title}</div>
                <div className="text-xs text-gray-500 truncate mb-3">{currentBook.author || '—'}</div>
                <div className="w-full bg-gray-800 rounded-full h-1.5 mb-1">
                  <div className="h-1.5 rounded-full bg-emerald-400" style={{ width: `${currentBook.progress || 0}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">{currentBook.progress || 0}%</span>
                  <span className={`text-[10px] font-bold tracking-widest px-1.5 py-0.5 rounded border ${readingOnTrack ? 'text-emerald-400 border-emerald-400' : 'text-amber-400 border-amber-400'}`}>
                    {readingOnTrack ? 'ON TRACK' : 'BEHIND'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-600">No book in progress</div>
          )}
        </div>
      </div>

      {reviewModal && (
        <WeeklyReviewModal
          startInHistory={reviewModal.history}
          onClose={() => setReviewModal(null)}
          onSealed={refreshReview}
        />
      )}

      {identityOpen && (
        <DailyIdentityModal
          onClose={() => { setIdentityOpen(false); refreshIdentity() }}
          onChange={refreshIdentity}
        />
      )}
    </div>
  )
}
