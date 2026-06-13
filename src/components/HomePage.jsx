import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useCurrency } from '../CurrencyContext'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import TodaysTasks from './TodaysTasks'
import Modal from './Modal'

const DEFAULT_HABITS = [
  '10k steps',
  'Gratitude',
  '10 mins reading',
  'Log mood',
  'Morning gym / walk',
  'No phone before 8am',
]

const CATEGORIES = ['Cash', 'Investments', 'Property', 'Crypto', 'Other']
const TARGET = 1_500_000

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

function getWeekRange() {
  const ws = getWeekStart()
  const [y, m, d] = ws.split('-').map(Number)
  const start = new Date(y, m - 1, d)
  const end = new Date(y, m - 1, d + 6)
  const fmt = dt => dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${fmt(start)} – ${fmt(end)}`
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function HomePage() {
  const { convert, format } = useCurrency()

  const [clock, setClock] = useState(new Date())
  const [snapshots, setSnapshots] = useState([])
  const [budgetEntries, setBudgetEntries] = useState([])

  // Habit definitions
  const [habitDefs, setHabitDefs] = useState([])
  const [showHabitModal, setShowHabitModal] = useState(false)
  const [editingDefs, setEditingDefs] = useState([])
  const [newHabitLabel, setNewHabitLabel] = useState('')
  const [habitSaving, setHabitSaving] = useState(false)

  // Habit log (today's checkboxes)
  const [habits, setHabits] = useState([])
  const [habitsLoaded, setHabitsLoaded] = useState(false)

  const [review, setReview] = useState({
    wentWell: '', challengeOvercome: '', improveNextWeek: '', consistencyScore: '', proudOf: '',
  })
  const [reviewLoaded, setReviewLoaded] = useState(false)
  const [saveStatus, setSaveStatus] = useState('idle')
  const [sealedAt, setSealedAt] = useState(null)
  const [showReviewModal, setShowReviewModal] = useState(false)

  // ── Effects

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    supabase.from('net_worth_snapshots').select('*').order('date', { ascending: false })
      .then(({ data }) => { if (data) setSnapshots(data) })
  }, [])

  useEffect(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    const start = `${y}-${String(m).padStart(2, '0')}-01`
    const end = `${m === 12 ? y + 1 : y}-${String(m % 12 + 1).padStart(2, '0')}-01`
    supabase.from('budget_entries').select('*').gte('month', start).lt('month', end)
      .then(({ data }) => { if (data) setBudgetEntries(data) })
  }, [])

  useEffect(() => {
    async function loadHabitDefs() {
      const { data } = await supabase.from('habit_definitions').select('*').order('position', { ascending: true })
      if (data && data.length > 0) {
        setHabitDefs(data)
      } else {
        await supabase.from('habit_definitions').insert(
          DEFAULT_HABITS.map((label, i) => ({ position: i, label }))
        )
        const { data: seeded } = await supabase.from('habit_definitions').select('*').order('position', { ascending: true })
        if (seeded) setHabitDefs(seeded)
      }
    }
    loadHabitDefs()
  }, [])

  useEffect(() => {
    supabase.from('habit_logs').select('habits').eq('date', getLocalDateString()).maybeSingle()
      .then(({ data }) => {
        if (data?.habits) setHabits(data.habits)
        setHabitsLoaded(true)
      })
  }, [])

  useEffect(() => {
    supabase.from('weekly_reviews').select('*').eq('week_start', getWeekStart()).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setReview({
            wentWell: data.went_well || '',
            challengeOvercome: data.challenge_overcome || '',
            improveNextWeek: data.improve_next_week || '',
            consistencyScore: data.consistency_score ?? '',
            proudOf: data.proud_of || '',
          })
          if (data.sealed_at) setSealedAt(data.sealed_at)
        }
        setReviewLoaded(true)
      })
  }, [])

  useEffect(() => {
    if (!reviewLoaded) return
    const timer = setTimeout(async () => {
      setSaveStatus('saving')
      await supabase.from('weekly_reviews').upsert({
        week_start: getWeekStart(),
        went_well: review.wentWell,
        challenge_overcome: review.challengeOvercome,
        improve_next_week: review.improveNextWeek,
        consistency_score: review.consistencyScore !== '' ? parseInt(review.consistencyScore) : null,
        proud_of: review.proudOf,
      }, { onConflict: 'week_start' })
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    }, 800)
    return () => clearTimeout(timer)
  }, [review, reviewLoaded])

  // ── Habit functions

  function toggleHabit(i) {
    if (!habitsLoaded) return
    setHabits(prev => {
      const len = habitDefs.length
      const current = Array.from({ length: len }, (_, idx) => prev[idx] ?? false)
      const updated = current.map((v, j) => j === i ? !v : v)
      supabase.from('habit_logs').upsert({ date: getLocalDateString(), habits: updated }, { onConflict: 'date' }).then()
      return updated
    })
  }

  function enterHabitEdit() {
    setEditingDefs(habitDefs.map(d => ({ ...d })))
    setNewHabitLabel('')
    setShowHabitModal(true)
  }

  async function saveHabitEdit() {
    setHabitSaving(true)
    const toSave = editingDefs.filter(d => d.label.trim()).map((d, i) => ({ label: d.label.trim(), position: i }))
    await supabase.from('habit_definitions').delete().gte('position', 0)
    if (toSave.length > 0) {
      await supabase.from('habit_definitions').insert(toSave)
    }
    const { data } = await supabase.from('habit_definitions').select('*').order('position', { ascending: true })
    if (data) {
      setHabitDefs(data)
      const updated = Array.from({ length: data.length }, (_, i) => habits[i] ?? false)
      setHabits(updated)
      await supabase.from('habit_logs').upsert({ date: getLocalDateString(), habits: updated }, { onConflict: 'date' })
    }
    setShowHabitModal(false)
    setHabitSaving(false)
  }

  function addHabitToEdit() {
    if (!newHabitLabel.trim()) return
    setEditingDefs(d => [...d, { label: newHabitLabel.trim() }])
    setNewHabitLabel('')
  }

  // ── Review functions

  async function sealWeek() {
    const now = new Date().toISOString()
    await supabase.from('weekly_reviews').upsert({
      week_start: getWeekStart(),
      went_well: review.wentWell,
      challenge_overcome: review.challengeOvercome,
      improve_next_week: review.improveNextWeek,
      consistency_score: review.consistencyScore !== '' ? parseInt(review.consistencyScore) : null,
      proud_of: review.proudOf,
      sealed_at: now,
    }, { onConflict: 'week_start' })
    setSealedAt(now)
    setShowReviewModal(false)
  }

  // ── Derived values

  const latest = snapshots[0]
  const prev = snapshots[1]
  const monthDelta = latest && prev ? latest.total - prev.total : null
  const monthDeltaPct = monthDelta !== null && prev ? (monthDelta / prev.total) * 100 : null
  const sparkData = [...snapshots].sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-8).map(s => ({ v: s.total }))

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

  const inc = budgetEntries.filter(e => e.type === 'income')
  const exp = budgetEntries.filter(e => e.type === 'expense')
  const totalInc = inc.reduce((sum, e) => sum + convert(parseFloat(e.amount), e.currency || 'GBP'), 0)
  const totalExp = exp.reduce((sum, e) => sum + convert(parseFloat(e.amount), e.currency || 'GBP'), 0)
  const saved = totalInc - totalExp
  const saveRate = totalInc > 0 ? (saved / totalInc) * 100 : 0

  const perthTime = clock.toLocaleTimeString('en-GB', { timeZone: 'Australia/Perth', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const ukTime = clock.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false })
  const dateStr = clock.toLocaleDateString('en-GB', { timeZone: 'Australia/Perth', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

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

  const inputCls = 'bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400'
  const textareaCls = 'w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm placeholder-gray-700 focus:outline-none focus:border-emerald-400 resize-none disabled:opacity-60 disabled:cursor-not-allowed'

  return (
    <div className="flex flex-col lg:flex-row gap-6">

      {/* LEFT COLUMN */}
      <div className="lg:w-[220px] shrink-0 space-y-6">

        {/* OPERATOR */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-sm tracking-widest uppercase text-gray-400 mb-4">Operator</h2>
          <div className="text-lg font-bold text-white mb-0.5">Ben Barton</div>
          <div className="text-xs text-gray-500 mb-4">Perth, AU</div>
          <div className="flex gap-2">
            <div className="flex-1 bg-gray-800 rounded p-3 text-center">
              <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Week</div>
              <div className="text-base font-bold text-white">{weekNum}</div>
            </div>
            <div className="flex-1 bg-gray-800 rounded p-3 text-center">
              <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Score</div>
              <div className="text-base font-bold text-emerald-400">{habitsScore}/{habitDefs.length || 6}</div>
            </div>
          </div>
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
            <div className="text-xs text-gray-500 mb-3">Last month: {format(convert(prev.total, 'GBP'))}</div>
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
            <div className="bg-emerald-400 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
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
          <div className="text-xs text-gray-500">UK · {ukTime}</div>
        </div>

        {/* HABITS */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm tracking-widest uppercase text-gray-400">Habits</h2>
            <button onClick={enterHabitEdit} className="text-xs text-gray-600 hover:text-white transition-colors uppercase tracking-widest">Edit</button>
          </div>
          <div className="space-y-3 mb-4">
            {habitDefs.map((def, i) => (
              <button
                key={def.id}
                onClick={() => toggleHabit(i)}
                className="w-full flex items-center gap-3 text-left group"
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  (habits[i] ?? false) ? 'bg-emerald-400 border-emerald-400' : 'border-gray-700 group-hover:border-gray-500'
                }`}>
                  {(habits[i] ?? false) && (
                    <svg className="w-2.5 h-2.5 text-gray-950" viewBox="0 0 10 10" fill="none">
                      <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className={`text-sm transition-colors truncate min-w-0 ${
                  (habits[i] ?? false) ? 'text-emerald-400 line-through decoration-emerald-400/40' : 'text-gray-400 group-hover:text-white'
                }`}>
                  {def.label}
                </span>
              </button>
            ))}
          </div>
          <div className="text-xs text-gray-500">
            <span className="text-emerald-400 font-medium">{habitsScore}</span> / {habitDefs.length} today
          </div>
        </div>

        {/* TODAY'S TASKS */}
        <TodaysTasks compact={true} />

        {/* WEEKLY REVIEW — compact card */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm tracking-widest uppercase text-gray-400">Weekly Review</h2>
            {sealedAt && (
              <span className="text-xs text-gray-600 border border-gray-700 rounded px-1.5 py-0.5 uppercase tracking-wider">Sealed</span>
            )}
          </div>
          <div className="space-y-2 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 uppercase tracking-widest">Week</span>
              <span className="text-xs text-gray-400">{getWeekRange()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 uppercase tracking-widest">Score</span>
              <span className={`text-sm font-bold ${review.consistencyScore !== '' ? 'text-white' : 'text-gray-600'}`}>
                {review.consistencyScore !== '' ? `${review.consistencyScore}/10` : '—'}
              </span>
            </div>
            {review.wentWell && (
              <div className="text-xs text-gray-500 truncate" title={review.wentWell}>{review.wentWell}</div>
            )}
          </div>
          <button
            onClick={() => setShowReviewModal(true)}
            className="text-xs tracking-widest uppercase px-4 py-2 border border-gray-700 text-gray-400 rounded hover:border-emerald-400 hover:text-emerald-400 transition-colors"
          >
            {sealedAt ? 'View Review' : 'Write Review'}
          </button>
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
                <div className="bg-emerald-400 h-1 rounded-full" style={{ width: `${Math.max(0, Math.min(saveRate, 100))}%` }} />
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

      {/* ── Edit Habits modal ──────────────────────────────────────────────────── */}
      {showHabitModal && (
        <Modal
          title="Edit Habits"
          onClose={() => setShowHabitModal(false)}
          onSave={saveHabitEdit}
          saveLabel="Save"
          saveDisabled={habitSaving}
          saving={habitSaving}
        >
          <div className="space-y-2">
            {editingDefs.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={d.label}
                  onChange={e => setEditingDefs(defs => defs.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                  className={`flex-1 ${inputCls}`}
                />
                <button
                  onClick={() => setEditingDefs(defs => defs.filter((_, j) => j !== i))}
                  className="text-gray-600 hover:text-red-400 transition-colors text-lg leading-none px-1"
                >×</button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-gray-800">
            <input
              value={newHabitLabel}
              onChange={e => setNewHabitLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addHabitToEdit()}
              placeholder="Add habit..."
              className={`flex-1 ${inputCls}`}
            />
            <button
              onClick={addHabitToEdit}
              className="text-xs tracking-widest uppercase px-3 py-2 border border-emerald-400 text-emerald-400 rounded hover:bg-emerald-400 hover:text-gray-950 transition-colors"
            >Add</button>
          </div>
        </Modal>
      )}

      {/* ── Weekly Review modal ────────────────────────────────────────────────── */}
      {showReviewModal && (
        <Modal
          title="Weekly Review"
          onClose={() => setShowReviewModal(false)}
          onSave={() => setShowReviewModal(false)}
          saveLabel="Done"
          cancelLabel="Close"
        >
          <div className="space-y-4">
            {saveStatus !== 'idle' && (
              <div className="text-xs text-gray-500">{saveStatus === 'saving' ? 'Saving...' : '✓ Saved'}</div>
            )}

            {[
              { key: 'wentWell', label: 'What went well this week?' },
              { key: 'challengeOvercome', label: 'One challenge I overcame' },
              { key: 'improveNextWeek', label: 'One thing I can improve next week' },
              { key: 'proudOf', label: 'One thing I am proud of' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">{label}</label>
                <textarea
                  value={review[key]}
                  onChange={e => { if (!sealedAt) { setSaveStatus('saving'); setReview(r => ({ ...r, [key]: e.target.value })) } }}
                  rows={3}
                  placeholder="..."
                  disabled={!!sealedAt}
                  className={textareaCls}
                />
              </div>
            ))}

            <div>
              <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Consistency score 1–10</label>
              <input
                type="number"
                min="1"
                max="10"
                value={review.consistencyScore}
                onChange={e => {
                  if (sealedAt) return
                  const v = e.target.value
                  if (v === '' || (parseInt(v) >= 1 && parseInt(v) <= 10)) {
                    setSaveStatus('saving')
                    setReview(r => ({ ...r, consistencyScore: v }))
                  }
                }}
                placeholder="1–10"
                disabled={!!sealedAt}
                className={`w-full ${inputCls} disabled:opacity-60 disabled:cursor-not-allowed`}
              />
            </div>

            {sealedAt ? (
              <div className="text-xs text-gray-500 pt-2 border-t border-gray-800">
                Sealed {fmtDate(sealedAt)}
              </div>
            ) : (
              <div className="pt-2 border-t border-gray-800">
                <button
                  onClick={sealWeek}
                  className="text-xs tracking-widest uppercase px-4 py-2 border border-gray-700 text-gray-400 rounded hover:border-emerald-400 hover:text-emerald-400 transition-colors"
                >
                  Seal Week
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}

    </div>
  )
}
