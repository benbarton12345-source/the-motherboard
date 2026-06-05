import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useCurrency } from '../CurrencyContext'
import { LineChart, Line, ResponsiveContainer } from 'recharts'

const HABIT_LIST = [
  '10k steps',
  'Gratitude',
  '10 mins reading',
  'Log mood',
  'Morning gym / walk',
  'No phone before 8am',
]

const CATEGORIES = ['Cash', 'Investments', 'Property', 'Crypto', 'Other']
const TARGET = 1_500_000

const PRIORITY_COLOURS = {
  HOT: 'text-red-400 border-red-400',
  WARM: 'text-emerald-400 border-emerald-400',
  COOL: 'text-blue-400 border-blue-400',
}

function getLocalDateString() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getWeekStart() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const diff = d.getDay() === 0 ? -6 : 1 - d.getDay()
  d.setDate(d.getDate() + diff)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function HomePage() {
  const { convert, format } = useCurrency()

  const [clock, setClock] = useState(new Date())
  const [snapshots, setSnapshots] = useState([])
  const [budgetEntries, setBudgetEntries] = useState([])

  const [habits, setHabits] = useState(Array(6).fill(false))
  const [habitsLoaded, setHabitsLoaded] = useState(false)

  const [tasks, setTasks] = useState([])
  const [newTask, setNewTask] = useState('')
  const [newPriority, setNewPriority] = useState('WARM')

  const [review, setReview] = useState({ wins: '', slipped: '', openLoops: '', next3: '' })
  const [reviewLoaded, setReviewLoaded] = useState(false)
  const [saveStatus, setSaveStatus] = useState('idle')

  const [focus, setFocus] = useState(() => localStorage.getItem('mb_focus') || '')
  useEffect(() => { localStorage.setItem('mb_focus', focus) }, [focus])

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    supabase
      .from('net_worth_snapshots')
      .select('*')
      .order('date', { ascending: false })
      .then(({ data }) => { if (data) setSnapshots(data) })
  }, [])

  useEffect(() => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]
    supabase
      .from('budget_entries')
      .select('*')
      .gte('month', start)
      .lt('month', end)
      .then(({ data }) => { if (data) setBudgetEntries(data) })
  }, [])

  useEffect(() => {
    supabase
      .from('habit_logs')
      .select('habits')
      .eq('date', getLocalDateString())
      .maybeSingle()
      .then(({ data }) => {
        if (data?.habits) setHabits(data.habits)
        setHabitsLoaded(true)
      })
  }, [])

  useEffect(() => {
    supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setTasks(data) })
  }, [])

  useEffect(() => {
    supabase
      .from('weekly_reviews')
      .select('*')
      .eq('week_start', getWeekStart())
      .maybeSingle()
      .then(({ data }) => {
        if (data) setReview({
          wins: data.wins || '',
          slipped: data.slipped || '',
          openLoops: data.open_loops || '',
          next3: data.next_week_top_3 || '',
        })
        setReviewLoaded(true)
      })
  }, [])

  useEffect(() => {
    if (!reviewLoaded) return
    const timer = setTimeout(async () => {
      await supabase
        .from('weekly_reviews')
        .upsert({
          week_start: getWeekStart(),
          wins: review.wins,
          slipped: review.slipped,
          open_loops: review.openLoops,
          next_week_top_3: review.next3,
        }, { onConflict: 'week_start' })
      setSaveStatus(s => s === 'saving' ? 'saved' : s)
      setTimeout(() => setSaveStatus(s => s === 'saved' ? 'idle' : s), 2000)
    }, 800)
    return () => clearTimeout(timer)
  }, [review, reviewLoaded])

  function toggleHabit(i) {
    if (!habitsLoaded) return
    setHabits(prev => {
      const updated = prev.map((v, j) => j === i ? !v : v)
      supabase
        .from('habit_logs')
        .upsert({ date: getLocalDateString(), habits: updated }, { onConflict: 'date' })
        .then()
      return updated
    })
  }

  async function addTask() {
    if (!newTask.trim()) return
    const text = newTask.trim()
    setNewTask('')
    const { data } = await supabase
      .from('tasks')
      .insert([{ text, priority: newPriority }])
      .select()
      .single()
    if (data) setTasks(t => [...t, data])
  }

  async function toggleTask(id) {
    const task = tasks.find(t => t.id === id)
    if (!task) return
    setTasks(t => t.map(t2 => t2.id === id ? { ...t2, done: !t2.done } : t2))
    await supabase.from('tasks').update({ done: !task.done }).eq('id', id)
  }

  async function removeTask(id) {
    setTasks(t => t.filter(t2 => t2.id !== id))
    await supabase.from('tasks').delete().eq('id', id)
  }

  // Derived: net worth
  const latest = snapshots[0]
  const prev = snapshots[1]

  const monthDelta = latest && prev ? latest.total - prev.total : null
  const monthDeltaPct = monthDelta !== null && prev ? (monthDelta / prev.total) * 100 : null

  const sparkData = [...snapshots]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-8)
    .map(s => ({ v: s.total }))

  const catTotals = latest
    ? CATEGORIES.reduce((acc, cat) => {
        acc[cat] = latest.entries
          .filter(e => e.type === cat)
          .reduce((sum, e) => sum + convert(parseFloat(e.value || 0), e.currency || 'GBP'), 0)
        return acc
      }, {})
    : {}

  const progress = latest ? Math.min((latest.total / TARGET) * 100, 100) : 0

  let projectedYears = null
  if (latest && monthDelta && monthDelta > 0) {
    projectedYears = ((TARGET - latest.total) / (monthDelta * 12)).toFixed(1)
  }

  // Derived: budget
  const inc = budgetEntries.filter(e => e.type === 'income')
  const exp = budgetEntries.filter(e => e.type === 'expense')
  const totalInc = inc.reduce((sum, e) => sum + convert(parseFloat(e.amount), e.currency || 'GBP'), 0)
  const totalExp = exp.reduce((sum, e) => sum + convert(parseFloat(e.amount), e.currency || 'GBP'), 0)
  const saved = totalInc - totalExp
  const saveRate = totalInc > 0 ? (saved / totalInc) * 100 : 0

  // Clock
  const perthTime = clock.toLocaleTimeString('en-GB', {
    timeZone: 'Australia/Perth', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const ukTime = clock.toLocaleTimeString('en-GB', {
    timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const dateStr = clock.toLocaleDateString('en-GB', {
    timeZone: 'Australia/Perth', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const weekNum = (() => {
    const d = new Date(clock)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
    const w1 = new Date(d.getFullYear(), 0, 4)
    return 1 + Math.round(((d - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7)
  })()

  const perthHour = parseInt(perthTime.split(':')[0])
  const greeting = perthHour < 12 ? 'Good morning' : perthHour < 17 ? 'Good afternoon' : 'Good evening'
  const habitsScore = habits.filter(Boolean).length
  const monthShort = new Date().toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()
  const nwDisplay = latest ? format(convert(latest.total, 'GBP')) : '—'
  const targetDisplay = format(convert(TARGET, 'GBP'))

  return (
    <div className="flex flex-col lg:flex-row gap-6">

      {/* LEFT COLUMN */}
      <div className="lg:w-[220px] shrink-0 space-y-6">

        {/* OPERATOR */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-sm tracking-widest uppercase text-gray-400 mb-4">Operator</h2>
          <div className="text-lg font-bold text-white mb-0.5">Ben Barton</div>
          <div className="text-xs text-gray-500 mb-4">Perth, AU</div>
          <div className="flex gap-2 mb-4">
            <div className="flex-1 bg-gray-800 rounded p-3 text-center">
              <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Week</div>
              <div className="text-base font-bold text-white">{weekNum}</div>
            </div>
            <div className="flex-1 bg-gray-800 rounded p-3 text-center">
              <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Score</div>
              <div className="text-base font-bold text-emerald-400">{habitsScore}/6</div>
            </div>
          </div>
          <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Focus today</div>
          <input
            value={focus}
            onChange={e => setFocus(e.target.value)}
            placeholder="What matters today..."
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400"
          />
        </div>

        {/* NET WORTH */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-sm tracking-widest uppercase text-gray-400 mb-4">Net Worth</h2>
          <div className="text-4xl font-bold text-white mb-2">{nwDisplay}</div>
          {monthDelta !== null && (
            <div className="mb-2">
              <span className={`text-sm font-medium ${monthDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {monthDelta >= 0 ? '+' : ''}{format(convert(Math.abs(monthDelta), 'GBP'))}
                {' '}({monthDeltaPct >= 0 ? '+' : ''}{monthDeltaPct.toFixed(1)}%)
              </span>
            </div>
          )}
          {prev && (
            <div className="text-xs text-gray-500 mb-3">
              Last month: {format(convert(prev.total, 'GBP'))}
            </div>
          )}
          {sparkData.length > 1 && (
            <ResponsiveContainer width="100%" height={44}>
              <LineChart data={sparkData}>
                <Line type="monotone" dataKey="v" stroke="#34d399" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* FREEDOM FIGURE */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm tracking-widest uppercase text-gray-400">Freedom Figure</h2>
            <span className="text-xs text-gray-500">Target: {targetDisplay}</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2 mb-2">
            <div
              className="bg-emerald-400 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-xs text-gray-500 mb-1">{progress.toFixed(1)}% of target</div>
          <div className="text-sm text-white font-medium">{nwDisplay} of {targetDisplay}</div>
          {projectedYears && (
            <div className="text-xs text-gray-500 mt-1">≈ {projectedYears} yrs at current rate</div>
          )}
        </div>
      </div>

      {/* CENTRE COLUMN */}
      <div className="flex-1 min-w-0 space-y-6">

        {/* SESSION */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-sm tracking-widest uppercase text-gray-400 mb-4">Session</h2>
          <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">{greeting}, Ben</div>
          <div className="text-4xl font-bold text-white tracking-tight leading-none mb-2">{perthTime}</div>
          <div className="text-sm text-gray-400 mb-1">{dateStr}</div>
          <div className="text-xs text-gray-500 mb-4">UK · {ukTime}</div>
          <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Today I will</div>
          <input
            value={focus}
            onChange={e => setFocus(e.target.value)}
            placeholder="Set your intention for today..."
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400"
          />
        </div>

        {/* HABITS */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-sm tracking-widest uppercase text-gray-400 mb-4">Habits</h2>
          <div className="space-y-3 mb-4">
            {HABIT_LIST.map((h, i) => (
              <button
                key={i}
                onClick={() => toggleHabit(i)}
                className="w-full flex items-center gap-3 text-left group"
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  habits[i] ? 'bg-emerald-400 border-emerald-400' : 'border-gray-700 group-hover:border-gray-500'
                }`}>
                  {habits[i] && (
                    <svg className="w-2.5 h-2.5 text-gray-950" viewBox="0 0 10 10" fill="none">
                      <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className={`text-sm transition-colors ${
                  habits[i] ? 'text-emerald-400 line-through decoration-emerald-400/40' : 'text-gray-400 group-hover:text-white'
                }`}>
                  {h}
                </span>
              </button>
            ))}
          </div>
          <div className="text-xs text-gray-500">
            <span className="text-emerald-400 font-medium">{habitsScore}</span> / 6 today
          </div>
        </div>

        {/* THIS WEEK */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-sm tracking-widest uppercase text-gray-400 mb-4">This Week</h2>
          <div className="flex gap-2 mb-4">
            <input
              value={newTask}
              onChange={e => setNewTask(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTask()}
              placeholder="Add a goal..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400"
            />
            <select
              value={newPriority}
              onChange={e => setNewPriority(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400"
            >
              <option value="HOT">HOT</option>
              <option value="WARM">WARM</option>
              <option value="COOL">COOL</option>
            </select>
            <button
              onClick={addTask}
              className="px-4 py-2 bg-emerald-400 text-gray-950 text-xs font-bold tracking-widest uppercase rounded hover:bg-emerald-300 transition-colors"
            >
              Add
            </button>
          </div>
          {tasks.length === 0 ? (
            <div className="text-sm text-gray-600">No goals set this week</div>
          ) : (
            <div className="space-y-3">
              {tasks.map(task => (
                <div key={task.id} className="flex items-center gap-3 group py-1 border-b border-gray-800 last:border-0">
                  <button
                    onClick={() => toggleTask(task.id)}
                    className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center transition-colors ${
                      task.done ? 'bg-emerald-400 border-emerald-400' : 'border-gray-700 hover:border-gray-500'
                    }`}
                  />
                  <span className={`text-sm flex-1 ${task.done ? 'line-through text-gray-600' : 'text-white'}`}>
                    {task.text}
                  </span>
                  <span className={`text-xs border px-1.5 py-0.5 rounded tracking-widest shrink-0 ${PRIORITY_COLOURS[task.priority]}`}>
                    {task.priority}
                  </span>
                  <button
                    onClick={() => removeTask(task.id)}
                    className="text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-base leading-none"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* WEEKLY REVIEW */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm tracking-widest uppercase text-gray-400">Weekly Review</h2>
            {saveStatus !== 'idle' && (
              <span className="text-xs text-gray-600">
                {saveStatus === 'saving' ? 'Saving...' : '✓ Saved'}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: 'wins', label: 'Wins this week' },
              { key: 'slipped', label: 'What slipped' },
              { key: 'openLoops', label: 'Open loops' },
              { key: 'next3', label: 'Next week top 3' },
            ].map(({ key, label }) => (
              <div key={key}>
                <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">{label}</div>
                <textarea
                  value={review[key]}
                  onChange={e => {
                    setSaveStatus('saving')
                    setReview(r => ({ ...r, [key]: e.target.value }))
                  }}
                  rows={3}
                  placeholder="..."
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm placeholder-gray-700 focus:outline-none focus:border-emerald-400 resize-none"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN */}
      <div className="lg:w-[200px] shrink-0 space-y-6">

        {/* ASSETS */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-sm tracking-widest uppercase text-gray-400 mb-4">Assets</h2>
          {latest ? (
            <div className="space-y-3">
              {CATEGORIES.filter(cat => (catTotals[cat] || 0) > 0).map(cat => {
                const val = catTotals[cat]
                const displayTotal = convert(latest.total, 'GBP')
                const pct = displayTotal > 0 ? (val / displayTotal) * 100 : 0
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-400">{cat}</span>
                      <span className="text-xs text-gray-500">{pct.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-1 mb-1">
                      <div className="bg-emerald-400 h-1 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-xs text-white">{format(val)}</div>
                  </div>
                )
              })}
              {CATEGORIES.every(cat => !(catTotals[cat] > 0)) && (
                <div className="text-sm text-gray-600">No data</div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-600">No snapshot yet</div>
          )}
        </div>

        {/* BUDGET */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-sm tracking-widest uppercase text-gray-400 mb-4">Budget · {monthShort}</h2>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Income</div>
              <div className="text-sm font-medium text-emerald-400">{format(totalInc)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Expenses</div>
              <div className="text-sm font-medium text-red-400">{format(totalExp)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Saved</div>
              <div className={`text-sm font-medium ${saved >= 0 ? 'text-white' : 'text-red-400'}`}>
                {saved < 0 ? '-' : ''}{format(Math.abs(saved))}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Save rate</div>
              <div className="w-full bg-gray-800 rounded-full h-1 mb-1">
                <div
                  className="bg-emerald-400 h-1 rounded-full"
                  style={{ width: `${Math.max(0, Math.min(saveRate, 100))}%` }}
                />
              </div>
              <div className="text-xs text-gray-500">{saveRate > 0 ? saveRate.toFixed(0) : '0'}%</div>
            </div>
          </div>
        </div>

        {/* TRADING */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm tracking-widest uppercase text-gray-400">Trading</h2>
            <span className="text-xs tracking-widest text-gray-600 border border-gray-700 rounded px-2 py-0.5">DEMO</span>
          </div>
          <div className="space-y-2">
            {['Win rate', 'P&L MTD', 'Avg R:R', 'Open trades', 'Max drawdown'].map(label => (
              <div key={label} className="flex items-center justify-between py-1 border-b border-gray-800 last:border-0">
                <span className="text-xs text-gray-500">{label}</span>
                <span className="text-xs text-gray-600">—</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
