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
  WARM: 'text-[#00ff88] border-[#00ff88]',
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

function SLabel({ n, title }) {
  return (
    <p className="font-mono text-[10px] tracking-[0.18em] text-[#3a3a3a] uppercase mb-3">
      {String(n).padStart(2, '0')} // {title}
    </p>
  )
}

function Card({ children, className = '' }) {
  return (
    <div className={`bg-[#0f0f0f] border border-[#1c1c1c] rounded-xl p-4 ${className}`}>
      {children}
    </div>
  )
}

function Stat({ label, value, valueClass = 'text-white' }) {
  return (
    <div>
      <div className="font-mono text-[9px] text-[#3a3a3a] uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`font-mono text-sm font-bold ${valueClass}`}>{value}</div>
    </div>
  )
}

export default function HomePage() {
  const { convert, format } = useCurrency()

  const [clock, setClock] = useState(new Date())
  const [snapshots, setSnapshots] = useState([])
  const [budgetEntries, setBudgetEntries] = useState([])

  // Habits — loaded from Supabase, reset daily by date key
  const [habits, setHabits] = useState(Array(6).fill(false))
  const [habitsLoaded, setHabitsLoaded] = useState(false)

  // Tasks — persisted to Supabase indefinitely
  const [tasks, setTasks] = useState([])
  const [newTask, setNewTask] = useState('')
  const [newPriority, setNewPriority] = useState('WARM')

  // Weekly review — one row per week, auto-saved
  const [review, setReview] = useState({ wins: '', slipped: '', openLoops: '', next3: '' })
  const [reviewLoaded, setReviewLoaded] = useState(false)

  // Focus text stays in localStorage — it's ephemeral, daily intent
  const [focus, setFocus] = useState(() => localStorage.getItem('mb_focus') || '')
  useEffect(() => { localStorage.setItem('mb_focus', focus) }, [focus])

  // Clock
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Net worth snapshots
  useEffect(() => {
    supabase
      .from('net_worth_snapshots')
      .select('*')
      .order('date', { ascending: false })
      .then(({ data }) => { if (data) setSnapshots(data) })
  }, [])

  // Current month budget
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

  // Load today's habits
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

  // Load all tasks
  useEffect(() => {
    supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setTasks(data) })
  }, [])

  // Load this week's review
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

  // Auto-save weekly review (debounced 800ms)
  useEffect(() => {
    if (!reviewLoaded) return
    const timer = setTimeout(() => {
      supabase
        .from('weekly_reviews')
        .upsert({
          week_start: getWeekStart(),
          wins: review.wins,
          slipped: review.slipped,
          open_loops: review.openLoops,
          next_week_top_3: review.next3,
        }, { onConflict: 'week_start' })
        .then()
    }, 800)
    return () => clearTimeout(timer)
  }, [review, reviewLoaded])

  // Toggle a habit and immediately upsert today's row
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

  // Tasks — optimistic updates for toggle and delete
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

  const thirtyDaysAgo = new Date(clock)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const prevSnapshot = snapshots.find(s => new Date(s.date) <= thirtyDaysAgo)
  const delta30 = latest && prevSnapshot ? latest.total - prevSnapshot.total : null
  const delta30pct = delta30 !== null && prevSnapshot ? (delta30 / prevSnapshot.total) * 100 : null

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
  if (latest && delta30 && delta30 > 0) {
    const remaining = TARGET - latest.total
    projectedYears = (remaining / (delta30 * 12)).toFixed(1)
  }

  // Derived: budget
  const inc = budgetEntries.filter(e => e.type === 'income')
  const exp = budgetEntries.filter(e => e.type === 'expense')
  const totalInc = inc.reduce((sum, e) => sum + convert(parseFloat(e.amount), e.currency || 'GBP'), 0)
  const totalExp = exp.reduce((sum, e) => sum + convert(parseFloat(e.amount), e.currency || 'GBP'), 0)
  const saved = totalInc - totalExp
  const saveRate = totalInc > 0 ? (saved / totalInc) * 100 : 0

  // Clock displays
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
    <div className="flex flex-col lg:flex-row gap-4">

      {/* LEFT COLUMN */}
      <div className="lg:w-[220px] shrink-0 space-y-3">

        {/* 01 // OPERATOR */}
        <Card>
          <SLabel n={1} title="operator" />
          <div className="font-syne text-white font-bold text-lg leading-tight mb-0.5">Ben Barton</div>
          <div className="font-mono text-[11px] text-[#555] mb-4">Operator · Perth, AU</div>
          <div className="flex gap-2 mb-4">
            <div className="flex-1 bg-[#161616] rounded-lg px-3 py-2 text-center">
              <div className="font-mono text-[9px] text-[#3a3a3a] uppercase tracking-wider mb-1">Week</div>
              <div className="font-mono text-base font-bold text-white">{weekNum}</div>
            </div>
            <div className="flex-1 bg-[#161616] rounded-lg px-3 py-2 text-center">
              <div className="font-mono text-[9px] text-[#3a3a3a] uppercase tracking-wider mb-1">Score</div>
              <div className="font-mono text-base font-bold text-[#00ff88]">{habitsScore}/6</div>
            </div>
          </div>
          <div className="font-mono text-[9px] text-[#3a3a3a] uppercase tracking-wider mb-1.5">Focus today</div>
          <input
            value={focus}
            onChange={e => setFocus(e.target.value)}
            placeholder="What matters today..."
            className="w-full bg-[#161616] border border-[#1c1c1c] rounded-lg px-3 py-2 font-mono text-xs text-white placeholder-[#2e2e2e] focus:outline-none focus:border-[#00ff88] transition-colors"
          />
        </Card>

        {/* 02 // FINANCE PULSE */}
        <Card>
          <SLabel n={2} title="finance pulse" />
          <div className="font-mono text-2xl font-bold text-white mb-1">{nwDisplay}</div>
          {delta30 !== null ? (
            <div className={`font-mono text-xs mb-3 ${delta30 >= 0 ? 'text-[#00ff88]' : 'text-red-400'}`}>
              {delta30 >= 0 ? '+' : ''}{format(convert(Math.abs(delta30), 'GBP'))}
              {delta30pct !== null && (
                <span className="text-[#444] ml-1">({delta30pct >= 0 ? '+' : ''}{delta30pct.toFixed(1)}%)</span>
              )}
              <span className="text-[#333] ml-1">30d</span>
            </div>
          ) : (
            <div className="font-mono text-xs text-[#333] mb-3">No comparison data yet</div>
          )}
          {sparkData.length > 1 && (
            <div className="-mx-1">
              <ResponsiveContainer width="100%" height={44}>
                <LineChart data={sparkData}>
                  <Line type="monotone" dataKey="v" stroke="#00ff88" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* 03 // FREEDOM FIGURE */}
        <Card>
          <SLabel n={3} title="freedom figure" />
          <div className="font-mono text-[10px] text-[#444] mb-2">Target: {targetDisplay}</div>
          <div className="w-full bg-[#1a1a1a] rounded-full h-1.5 mb-3">
            <div
              className="h-1.5 rounded-full bg-[#00ff88] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="font-mono text-2xl font-bold text-white mb-1">{progress.toFixed(1)}%</div>
          <div className="font-mono text-[11px] text-[#555] mb-2">
            {nwDisplay} of {targetDisplay}
          </div>
          {projectedYears && (
            <div className="font-mono text-[10px] text-[#3a3a3a]">≈ {projectedYears} yrs at current rate</div>
          )}
        </Card>
      </div>

      {/* CENTRE COLUMN */}
      <div className="flex-1 min-w-0 space-y-3">

        {/* 04 // SESSION */}
        <Card>
          <SLabel n={4} title="session" />
          <div className="font-syne text-xs text-[#444] tracking-[0.15em] uppercase mb-2">{greeting}, Ben</div>
          <div className="font-mono text-5xl font-bold text-white tracking-tighter leading-none mb-2">{perthTime}</div>
          <div className="font-mono text-[11px] text-[#555] mb-1">{dateStr}</div>
          <div className="font-mono text-[10px] text-[#333] mb-4">UK · {ukTime}</div>
          <div className="font-mono text-[9px] text-[#3a3a3a] uppercase tracking-wider mb-1.5">Today I will</div>
          <input
            value={focus}
            onChange={e => setFocus(e.target.value)}
            placeholder="Set your intention for today..."
            className="w-full bg-[#161616] border border-[#1c1c1c] rounded-lg px-3 py-2 font-mono text-sm text-white placeholder-[#2e2e2e] focus:outline-none focus:border-[#00ff88] transition-colors"
          />
        </Card>

        {/* 05 // HABITS */}
        <Card>
          <SLabel n={5} title="habits" />
          <div className="space-y-2.5 mb-4">
            {HABIT_LIST.map((h, i) => (
              <button
                key={i}
                onClick={() => toggleHabit(i)}
                className="w-full flex items-center gap-3 text-left group"
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  habits[i] ? 'bg-[#00ff88] border-[#00ff88]' : 'border-[#2e2e2e] group-hover:border-[#444]'
                }`}>
                  {habits[i] && (
                    <svg className="w-2.5 h-2.5 text-black" viewBox="0 0 10 10" fill="none">
                      <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className={`font-mono text-xs transition-colors ${
                  habits[i] ? 'text-[#00ff88] line-through decoration-[#00ff88]/30' : 'text-[#777] group-hover:text-[#999]'
                }`}>
                  {h}
                </span>
              </button>
            ))}
          </div>
          <div className="font-mono text-xs text-[#333]">
            <span className="text-[#00ff88] font-bold">{habitsScore}</span> / 6 today
          </div>
        </Card>

        {/* 06 // THIS WEEK */}
        <Card>
          <SLabel n={6} title="this week" />
          <div className="flex gap-2 mb-4">
            <input
              value={newTask}
              onChange={e => setNewTask(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTask()}
              placeholder="Add a goal..."
              className="flex-1 bg-[#161616] border border-[#1c1c1c] rounded-lg px-3 py-2 font-mono text-xs text-white placeholder-[#2e2e2e] focus:outline-none focus:border-[#00ff88] transition-colors"
            />
            <select
              value={newPriority}
              onChange={e => setNewPriority(e.target.value)}
              className="bg-[#161616] border border-[#1c1c1c] rounded-lg px-2 py-2 font-mono text-xs text-white focus:outline-none focus:border-[#00ff88] transition-colors"
            >
              <option value="HOT">HOT</option>
              <option value="WARM">WARM</option>
              <option value="COOL">COOL</option>
            </select>
            <button
              onClick={addTask}
              className="bg-[#00ff88] text-black font-mono text-sm font-bold px-4 py-2 rounded-lg hover:bg-[#00e07a] transition-colors"
            >
              +
            </button>
          </div>
          {tasks.length === 0 ? (
            <div className="font-mono text-xs text-[#2e2e2e]">No goals set this week</div>
          ) : (
            <div className="space-y-2.5">
              {tasks.map(task => (
                <div key={task.id} className="flex items-center gap-3 group">
                  <button
                    onClick={() => toggleTask(task.id)}
                    className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center transition-colors ${
                      task.done ? 'bg-[#00ff88] border-[#00ff88]' : 'border-[#2e2e2e] hover:border-[#444]'
                    }`}
                  />
                  <span className={`font-mono text-xs flex-1 transition-colors ${task.done ? 'line-through text-[#2e2e2e]' : 'text-[#ccc]'}`}>
                    {task.text}
                  </span>
                  <span className={`font-mono text-[9px] border px-1.5 py-0.5 rounded tracking-widest shrink-0 ${PRIORITY_COLOURS[task.priority]}`}>
                    {task.priority}
                  </span>
                  <button
                    onClick={() => removeTask(task.id)}
                    className="text-[#2e2e2e] hover:text-red-400 font-mono text-base leading-none transition-colors opacity-0 group-hover:opacity-100"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 07 // WEEKLY REVIEW */}
        <Card>
          <SLabel n={7} title="weekly review" />
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: 'wins', label: 'Wins this week' },
              { key: 'slipped', label: 'What slipped' },
              { key: 'openLoops', label: 'Open loops' },
              { key: 'next3', label: 'Next week top 3' },
            ].map(({ key, label }) => (
              <div key={key}>
                <div className="font-mono text-[9px] text-[#3a3a3a] uppercase tracking-wider mb-1.5">{label}</div>
                <textarea
                  value={review[key]}
                  onChange={e => setReview(r => ({ ...r, [key]: e.target.value }))}
                  rows={3}
                  placeholder="..."
                  className="w-full bg-[#161616] border border-[#1c1c1c] rounded-lg px-3 py-2 font-mono text-xs text-white placeholder-[#2a2a2a] focus:outline-none focus:border-[#00ff88] resize-none transition-colors"
                />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* RIGHT COLUMN */}
      <div className="lg:w-[200px] shrink-0 space-y-3">

        {/* 08 // ASSETS */}
        <Card>
          <SLabel n={8} title="assets" />
          {latest ? (
            <div className="space-y-3">
              {CATEGORIES.filter(cat => (catTotals[cat] || 0) > 0).map(cat => {
                const val = catTotals[cat]
                const displayTotal = convert(latest.total, 'GBP')
                const pct = displayTotal > 0 ? (val / displayTotal) * 100 : 0
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[10px] text-[#555] uppercase">{cat}</span>
                      <span className="font-mono text-[10px] text-[#555]">{pct.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-[#1a1a1a] rounded-full h-1 mb-1">
                      <div className="h-1 rounded-full bg-[#00ff88]" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="font-mono text-xs text-white">{format(val)}</div>
                  </div>
                )
              })}
              {CATEGORIES.every(cat => !(catTotals[cat] > 0)) && (
                <div className="font-mono text-xs text-[#333]">No data</div>
              )}
            </div>
          ) : (
            <div className="font-mono text-xs text-[#333]">No snapshot yet</div>
          )}
        </Card>

        {/* 09 // BUDGET */}
        <Card>
          <SLabel n={9} title={`budget · ${monthShort}`} />
          <div className="space-y-3">
            <Stat label="Income" value={format(totalInc)} valueClass="text-[#00ff88]" />
            <Stat label="Expenses" value={format(totalExp)} valueClass="text-red-400" />
            <Stat
              label="Saved"
              value={`${saved < 0 ? '-' : ''}${format(Math.abs(saved))}`}
              valueClass={saved >= 0 ? 'text-white' : 'text-red-400'}
            />
            <div>
              <div className="font-mono text-[9px] text-[#3a3a3a] uppercase tracking-wider mb-1.5">Save rate</div>
              <div className="w-full bg-[#1a1a1a] rounded-full h-1 mb-1">
                <div
                  className="h-1 rounded-full bg-[#00ff88]"
                  style={{ width: `${Math.max(0, Math.min(saveRate, 100))}%` }}
                />
              </div>
              <div className="font-mono text-xs text-white">{saveRate > 0 ? saveRate.toFixed(0) : '0'}%</div>
            </div>
          </div>
        </Card>

        {/* 10 // TRADING */}
        <Card>
          <SLabel n={10} title="trading" />
          <div className="inline-flex items-center border border-[#2a2a2a] rounded px-2 py-0.5 mb-4">
            <span className="font-mono text-[9px] text-[#444] tracking-[0.2em]">DEMO</span>
          </div>
          <div className="space-y-2.5">
            {['Win rate', 'P&L MTD', 'Avg R:R', 'Open trades', 'Max drawdown'].map(label => (
              <div key={label} className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-[#444]">{label}</span>
                <span className="font-mono text-[10px] text-[#2e2e2e]">—</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
