import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, ReferenceLine, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import Modal from './Modal'
import { localDate, shiftDate } from '../utils/taskHelpers'

// Accent colours — emerald/amber/red match the app's Tailwind tokens; teal/blue
// are the approved data-series hues for this screen. Charts only (Recharts needs hex).
const ACCENT = {
  emerald: '#34d399', amber: '#fbbf24', red: '#f87171',
  purple: '#a78bfa', teal: '#2dd4bf', blue: '#60a5fa', greyBlue: '#8aa0b6',
}
// Chart internals matched to HealthPage's weight chart (gray-800 grid, gray-500 ticks)
const CHART_GRID = '#1f2937'
const CHART_TICK = '#6b7280'

const statusHex = (s) => (s === 'progressing' ? ACCENT.emerald : s === 'skipped' ? ACCENT.red : ACCENT.amber)

// ── Muscle bucketing — collapse the bank's 11 groups into the design's 6 ─
const BUCKETS = ['Chest', 'Back', 'Shoulders', 'Legs', 'Arms', 'Core']
const BUCKET_MAP = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', core: 'Core', arms: 'Arms',
  legs: 'Legs', quads: 'Legs', hamstrings: 'Legs', glutes: 'Legs', calves: 'Legs',
  biceps: 'Arms', triceps: 'Arms', forearms: 'Arms',
}
const bucketOf = (mg) => BUCKET_MAP[(mg || '').trim().toLowerCase()] || null

// Weekly hard-set targets per muscle [low, high] — domain defaults from the design
const SET_TARGETS = {
  Chest: [12, 16], Back: [14, 20], Shoulders: [12, 16], Legs: [14, 20], Arms: [10, 16], Core: [8, 12],
}
const setStatus = (s, lo) => (s >= lo ? 'ok' : (s >= lo * 0.6 ? 'low' : 'under'))
const SETCOL = { ok: ACCENT.emerald, low: ACCENT.amber, under: ACCENT.red }

// ── Pure helpers ────────────────────────────────────────────────────
const epley = (w, r) => w * (1 + r / 30)
const fmtTop = (v) => (v % 1 === 0 ? String(v) : v.toFixed(1))

function pearson(xs, ys) {
  const n = xs.length
  if (n < 2) return 0
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sx = 0, sy = 0
  xs.forEach((x, i) => { const dx = x - mx, dy = ys[i] - my; sxy += dx * dy; sx += dx * dx; sy += dy * dy })
  return (sx && sy) ? sxy / Math.sqrt(sx * sy) : 0
}

// Least-squares endpoints over (xs,ys) at the given x bounds
function trendSegment(xs, ys, xmin, xmax) {
  const n = xs.length
  if (n < 2) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) * (x - mx) })
  const slope = sxx ? sxy / sxx : 0
  const b = my - slope * mx
  return [{ x: xmin, y: slope * xmin + b }, { x: xmax, y: slope * xmax + b }]
}

// classify() — exact logic from the design, over the last 3 sessions
function classify(weights, reps) {
  const k = Math.min(3, weights.length)
  const w = weights.slice(-k), r = reps.slice(-k)
  if (w.length === 0) return { status: 'stalled', why: 'flat' }
  if (w[w.length - 1] > w[0] + 1e-9) return { status: 'progressing', why: 'load' }
  if (r[r.length - 1] > r[0]) return { status: 'progressing', why: 'reps' }
  return { status: 'stalled', why: 'flat' }
}

function daysBetween(dateStr, today) {
  const [y1, m1, d1] = dateStr.split('-').map(Number)
  const [y2, m2, d2] = today.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

function weekStartMonday(today) {
  const [y, m, d] = today.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const offset = (dt.getDay() + 6) % 7 // 0 = Mon
  return shiftDate(today, -offset)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtShort(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${MONTHS[m - 1]} ${String(d).padStart(2, '0')}`
}

// Top set of a session for one exercise: set_number === 1, else heaviest valid set
function topSetOf(sets) {
  const valid = sets.filter(s => s.actual_weight != null && s.actual_reps != null)
  if (!valid.length) return null
  return valid.find(s => s.set_number === 1)
    || valid.slice().sort((a, b) => (b.actual_weight - a.actual_weight) || (b.actual_reps - a.actual_reps))[0]
}

// ── Component ───────────────────────────────────────────────────────
export default function TrainingAnalysis({ onClose }) {
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState([])     // performed_sessions + nested ex/sets
  const [exerciseMap, setExerciseMap] = useState({}) // id -> {name, muscle_group, bucket}
  const [allExercises, setAllExercises] = useState([])
  const [weightLogs, setWeightLogs] = useState([])  // [{date, weight_kg}] desc

  const [groupFilter, setGroupFilter] = useState('ALL')
  const [selectedLift, setSelectedLift] = useState(null) // exercise object or null
  const [aTab, setATab] = useState('1rm')
  const [showWeight, setShowWeight] = useState(true)
  const [showRatio, setShowRatio] = useState(true)
  const [showSelector, setShowSelector] = useState(false)
  const [query, setQuery] = useState('')

  const today = localDate()

  useEffect(() => { init() }, [])

  async function init() {
    const [{ data: exs }, { data: ps }, { data: wl }] = await Promise.all([
      supabase.from('exercises').select('id, name, muscle_group').order('muscle_group').order('name'),
      supabase.from('performed_sessions').select(`
        id, performed_date, session_rating, energy_rating,
        performed_exercises ( exercise_id, performed_sets ( set_number, actual_weight, actual_reps ) )
      `).order('performed_date'),
      supabase.from('weight_logs').select('date, weight_kg').order('date', { ascending: false }),
    ])

    const map = {}
    for (const e of exs || []) map[e.id] = { name: e.name, muscle_group: e.muscle_group, bucket: bucketOf(e.muscle_group) }
    setExerciseMap(map)
    setAllExercises(exs || [])
    setSessions(ps || [])
    setWeightLogs(wl || [])
    setLoading(false)
  }

  // Bodyweight on/just-before a date (most recent prior log)
  function bodyweightOn(dateStr) {
    for (const l of weightLogs) if (l.date <= dateStr) return l.weight_kg
    return weightLogs.length ? weightLogs[weightLogs.length - 1].weight_kg : null
  }
  const latestBodyweight = weightLogs[0]?.weight_kg ?? null

  // ── Per-exercise session series (oldest → newest) ─────────────────
  const seriesByExercise = useMemo(() => {
    const byEx = {}
    for (const sess of sessions) {
      const well = (sess.session_rating != null && sess.energy_rating != null)
        ? (sess.session_rating + sess.energy_rating) / 2 : null
      for (const pe of sess.performed_exercises || []) {
        const top = topSetOf(pe.performed_sets || [])
        if (!top) continue
        const volume = (pe.performed_sets || [])
          .filter(s => s.actual_weight != null && s.actual_reps != null)
          .reduce((a, s) => a + s.actual_weight * s.actual_reps, 0)
        ;(byEx[pe.exercise_id] ||= []).push({
          date: sess.performed_date,
          weight: top.actual_weight,
          reps: top.actual_reps,
          volume,
          well,
          e1rm: epley(top.actual_weight, top.actual_reps),
        })
      }
    }
    for (const id in byEx) byEx[id].sort((a, b) => a.date.localeCompare(b.date))
    return byEx
  }, [sessions])

  // ── Per-exercise status (classifier + 14-day skip) ────────────────
  const statusByExercise = useMemo(() => {
    const out = {}
    for (const id in seriesByExercise) {
      const s = seriesByExercise[id]
      const cls = classify(s.map(x => x.weight), s.map(x => x.reps))
      const last = s[s.length - 1].date
      const status = daysBetween(last, today) >= 14 ? 'skipped' : cls.status
      out[id] = { status, why: cls.why, lastDate: last }
    }
    return out
  }, [seriesByExercise, today])

  // ── Status tally ──────────────────────────────────────────────────
  const tally = useMemo(() => {
    const t = { progressing: 0, stalled: 0, skipped: 0 }
    for (const id in statusByExercise) t[statusByExercise[id].status]++
    return t
  }, [statusByExercise])

  // ── Weekly set volume per bucket (current week) ───────────────────
  const weeklySets = useMemo(() => {
    const wkStart = weekStartMonday(today)
    const counts = Object.fromEntries(BUCKETS.map(b => [b, 0]))
    for (const sess of sessions) {
      if (sess.performed_date < wkStart) continue
      for (const pe of sess.performed_exercises || []) {
        const bucket = exerciseMap[pe.exercise_id]?.bucket
        if (!bucket) continue
        const hard = (pe.performed_sets || []).filter(s => s.actual_reps != null).length
        counts[bucket] += hard
      }
    }
    return BUCKETS.map(m => {
      const [lo, hi] = SET_TARGETS[m]
      const sets = counts[m]
      const st = setStatus(sets, lo)
      return { muscle: m, sets, low: lo, high: hi, range: `${lo}–${hi}`, color: SETCOL[st], pct: Math.min(sets / hi, 1) * 100 }
    })
  }, [sessions, exerciseMap, today])
  const weekTotal = weeklySets.reduce((a, b) => a + b.sets, 0)
  const weeklyByBucket = Object.fromEntries(weeklySets.map(w => [w.muscle, w]))

  // ── Overview groups (lift cards by bucket) ────────────────────────
  const groups = useMemo(() => {
    const byBucket = {}
    for (const id in seriesByExercise) {
      const meta = exerciseMap[id]
      if (!meta?.bucket) continue
      const s = seriesByExercise[id]
      const st = statusByExercise[id]
      const lastV = s[s.length - 1].weight
      const prevV = s.length > 1 ? s[s.length - 2].weight : lastV
      const prevR = s.length > 1 ? s[s.length - 2].reps : s[s.length - 1].reps
      const wDelta = lastV - prevV
      const rDelta = s[s.length - 1].reps - prevR
      let delta
      if (st.status === 'skipped') delta = '—'
      else if (wDelta > 0) delta = '+' + fmtTop(wDelta)
      else if (st.why === 'reps' && rDelta > 0) delta = '+' + rDelta + ' rep'
      else delta = '0'
      const label = st.status === 'progressing'
        ? (st.why === 'reps' ? 'PROGRESSING · REPS' : 'PROGRESSING')
        : (st.status === 'skipped' ? 'NOT TRAINED' : 'STALLED')
      ;(byBucket[meta.bucket] ||= []).push({
        id, name: meta.name, top: fmtTop(lastV), delta, color: statusHex(st.status), label,
        daysAgo: daysBetween(st.lastDate, today),
        spark: s.slice(-8).map((x, i) => ({ i, v: x.weight })),
        exercise: { id, name: meta.name, muscle_group: meta.muscle_group },
      })
    }
    return BUCKETS
      .filter(b => byBucket[b]?.length)
      .filter(b => groupFilter === 'ALL' || b === groupFilter)
      .map(b => {
        const lifts = byBucket[b].sort((a, b2) => a.daysAgo - b2.daysAgo)
        const wk = weeklyByBucket[b]
        return { muscle: b, count: lifts.length, lifts, weekSets: wk.sets, weekRange: wk.range, weekColor: wk.color }
      })
  }, [seriesByExercise, statusByExercise, exerciseMap, groupFilter, weeklyByBucket, today])

  const trackedCount = Object.keys(seriesByExercise).length

  // ── Selector data ─────────────────────────────────────────────────
  const recents = useMemo(() => {
    return Object.keys(seriesByExercise)
      .map(id => ({ id, meta: exerciseMap[id], st: statusByExercise[id] }))
      .filter(x => x.meta)
      .sort((a, b) => a.st.lastDate < b.st.lastDate ? 1 : -1)
      .slice(0, 8)
      .map(x => ({
        id: x.id, name: x.meta.name, muscle: x.meta.muscle_group,
        daysAgo: daysBetween(x.st.lastDate, today),
        color: statusHex(x.st.status),
        exercise: { id: x.id, name: x.meta.name, muscle_group: x.meta.muscle_group },
      }))
  }, [seriesByExercise, statusByExercise, exerciseMap, today])

  const groupedExercises = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? allExercises.filter(e => e.name.toLowerCase().includes(q)) : allExercises
    const g = {}
    for (const e of list) (g[e.muscle_group] ||= []).push(e)
    return Object.keys(g).sort().map(mg => ({ mg, items: g[mg] }))
  }, [allExercises, query])

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-950">
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center gap-4 px-8 py-4 border-b border-gray-800 bg-gray-950">
        {selectedLift ? (
          <button onClick={() => setSelectedLift(null)} className="text-xs tracking-widest uppercase text-gray-500 hover:text-white transition-colors">‹ Training Analysis</button>
        ) : (
          <span className="text-xs tracking-widest uppercase text-gray-500">Training Analysis</span>
        )}
        {selectedLift && (
          <>
            <span className="text-gray-700">/</span>
            <span className="text-sm tracking-wide text-gray-300">{selectedLift.name}</span>
          </>
        )}
        <button onClick={onClose} className="ml-auto text-2xl leading-none text-gray-500 hover:text-white transition-colors">&times;</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-sm text-gray-600">Loading…</div>
      ) : selectedLift ? (
        <PerLiftView
          exercise={selectedLift}
          series={seriesByExercise[selectedLift.id] || []}
          status={statusByExercise[selectedLift.id]}
          bodyweightOn={bodyweightOn}
          latestBodyweight={latestBodyweight}
          today={today}
          aTab={aTab} setATab={setATab}
          showWeight={showWeight} setShowWeight={setShowWeight}
          showRatio={showRatio} setShowRatio={setShowRatio}
          onOpenSelector={() => { setQuery(''); setShowSelector(true) }}
        />
      ) : (
        <OverviewView
          tally={tally} trackedCount={trackedCount}
          weeklySets={weeklySets} weekTotal={weekTotal}
          groups={groups} groupFilter={groupFilter} setGroupFilter={setGroupFilter}
          onSelectLift={(ex) => { setSelectedLift(ex); setATab('1rm') }}
          onOpenSelector={() => { setQuery(''); setShowSelector(true) }}
        />
      )}

      {showSelector && (
        <Modal title="Select Exercise" onClose={() => setShowSelector(false)} hideSave cancelLabel="Close" maxWidth="max-w-xl">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search 173 exercises…"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-400"
          />
          {!query && recents.length > 0 && (
            <div>
              <p className="text-xs tracking-widest uppercase text-emerald-400 mb-2">★ Recently trained</p>
              <div className="space-y-px">
                {recents.map(r => (
                  <button key={r.id} onClick={() => { setSelectedLift(r.exercise); setShowSelector(false); setATab('1rm') }}
                    className="w-full flex items-center gap-3 px-2 py-2.5 rounded text-left hover:bg-gray-800 transition-colors">
                    <StatusDot color={r.color} size={7} />
                    <span className="flex-1 text-sm text-white truncate">{r.name}</span>
                    <span className="text-xs uppercase tracking-wider text-gray-500">{r.muscle}</span>
                    <span className="text-xs w-9 text-right text-gray-600">{r.daysAgo}d</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {groupedExercises.map(({ mg, items }) => (
            <div key={mg}>
              <p className="text-xs tracking-widest uppercase text-gray-400 mb-2">{mg}</p>
              <div className="space-y-px">
                {items.map(ex => {
                  const tracked = !!seriesByExercise[ex.id]
                  return (
                    <button key={ex.id} onClick={() => { setSelectedLift(ex); setShowSelector(false); setATab('1rm') }}
                      className="w-full flex items-center gap-3 px-2 py-2.5 rounded text-left hover:bg-gray-800 transition-colors">
                      <span className="flex-1 text-sm text-white truncate">{ex.name}</span>
                      {tracked && (
                        <span className="text-[10px] tracking-widest uppercase text-emerald-400 border border-emerald-400/40 rounded px-1.5 py-0.5">Tracked</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {groupedExercises.length === 0 && <p className="text-sm text-gray-600">No exercises match.</p>}
        </Modal>
      )}
    </div>
  )
}

// ── Small shared bits ───────────────────────────────────────────────
function Chip({ active, color, children, onClick }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] tracking-widest uppercase font-semibold transition-colors ${active ? '' : 'border border-gray-700 text-gray-500 hover:text-gray-300'}`}
      style={active ? { border: `1px solid ${color}`, color, background: `${color}1f` } : undefined}>
      {children}
    </button>
  )
}

function StatusDot({ color, size = 8 }) {
  return <span className="rounded-full flex-none" style={{ width: size, height: size, background: color, boxShadow: `0 0 ${size}px ${color}66` }} />
}

// Sparkline of recent top sets. Pads the y-domain so flat/limited series render a
// visible line rather than a clipped dot; a single point shows a centred marker.
function Sparkline({ data, color }) {
  const vals = data.map(d => d.v)
  let min = Math.min(...vals), max = Math.max(...vals)
  if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1 }
  if (min === max) { min -= 1; max += 1 }
  const pad = (max - min) * 0.2
  const single = data.length <= 1
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, bottom: 4, left: 2, right: 2 }}>
        <YAxis hide domain={[min - pad, max + pad]} />
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} isAnimationActive={false}
          dot={single ? { r: 2.5, fill: color, strokeWidth: 0 } : false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Overview ────────────────────────────────────────────────────────
function OverviewView({ tally, trackedCount, weeklySets, weekTotal, groups, groupFilter, setGroupFilter, onSelectLift, onOpenSelector }) {
  return (
    <div className="px-8 pt-7 pb-12 max-w-[1420px] mx-auto">
      {/* Title */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-white">Training Analysis</h1>
          <p className="text-sm text-gray-500 mt-1">{trackedCount} lifts tracked · trailing performance</p>
        </div>
        <button onClick={onOpenSelector}
          className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white hover:border-gray-600 transition-colors">
          ⌕ Find a lift…
        </button>
      </div>

      {trackedCount === 0 ? (
        <div className="mt-10 bg-gray-900 border border-gray-800 rounded-lg p-10 text-center">
          <p className="text-sm text-gray-300">No logged sessions yet.</p>
          <p className="text-xs text-gray-500 mt-2">Log a few training sessions and your progress analysis will populate here.</p>
        </div>
      ) : (
        <>
          {/* Status tally */}
          <div className="flex flex-wrap gap-3 mt-6 mb-2">
            {[
              { n: tally.progressing, label: 'Progressing', color: ACCENT.emerald },
              { n: tally.stalled, label: 'Stalled', color: ACCENT.amber },
              { n: tally.skipped, label: 'Not trained 14d+', color: ACCENT.red },
            ].map(t => (
              <div key={t.label} className="flex items-center gap-2.5 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
                <StatusDot color={t.color} />
                <span className="text-xl font-bold text-white">{t.n}</span>
                <span className="text-[11px] tracking-widest uppercase font-semibold" style={{ color: t.color }}>{t.label}</span>
              </div>
            ))}
          </div>

          {/* Weekly set volume */}
          <div className="mt-6 mb-1">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs tracking-widest uppercase text-gray-400 font-semibold">Weekly Set Volume</span>
              <span className="text-[11px] text-gray-600">{weekTotal} hard sets · current week · target range per muscle</span>
              <div className="flex-1 h-px bg-gray-800" />
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {weeklySets.map(ws => (
                <div key={ws.muscle} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[10px] tracking-widest uppercase text-gray-400 font-semibold">{ws.muscle}</span>
                    <StatusDot color={ws.color} size={6} />
                  </div>
                  <div className="flex items-end gap-1.5 mb-2.5">
                    <span className="text-2xl font-bold text-white">{ws.sets}</span>
                    <span className="text-xs text-gray-500 pb-0.5">/ {ws.range}</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${ws.pct}%`, background: ws.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Muscle filter */}
          <div className="flex gap-2 mt-6 mb-6 flex-wrap">
            {['ALL', ...BUCKETS.map(b => b.toUpperCase())].map(b => (
              <Chip key={b} active={groupFilter === b} color="#e6edf0"
                onClick={() => setGroupFilter(b === 'ALL' ? 'ALL' : BUCKETS.find(x => x.toUpperCase() === b))}>
                {b}
              </Chip>
            ))}
          </div>

          {/* Groups */}
          {groups.map(group => (
            <div key={group.muscle} className="mb-8">
              <div className="flex items-center gap-3.5 mb-3.5">
                <span className="text-sm tracking-widest uppercase text-gray-400 font-semibold">{group.muscle}</span>
                <span className="text-[11px] uppercase tracking-wider text-gray-600">{group.count} lifts</span>
                <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold" style={{ color: group.weekColor }}>
                  <StatusDot color={group.weekColor} size={5} />{group.weekSets} sets/wk · {group.weekRange}
                </span>
                <div className="flex-1 h-px bg-gray-800" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.lifts.map(lift => (
                  <button key={lift.id} onClick={() => onSelectLift(lift.exercise)}
                    className="text-left bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col gap-2.5 hover:border-gray-600 transition-colors">
                    <div className="flex justify-between items-start">
                      <div className="text-sm font-bold text-white">{lift.name}</div>
                      <span className="mt-1"><StatusDot color={lift.color} size={7} /></span>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="text-2xl font-bold text-white">{lift.top}</div>
                      <div className="text-xs text-gray-500 pb-1">kg</div>
                      <div className="ml-auto text-sm font-semibold pb-1" style={{ color: lift.color }}>{lift.delta}</div>
                    </div>
                    <div className="h-[34px]">
                      <Sparkline data={lift.spark} color={lift.color} />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] tracking-widest uppercase font-semibold" style={{ color: lift.color }}>{lift.label}</span>
                      <span className="text-[11px] text-gray-600">{lift.daysAgo}d ago</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ── Per-lift (Direction A — Hero Overlay) ───────────────────────────
function PerLiftView({ exercise, series, status, bodyweightOn, latestBodyweight, today, aTab, setATab, showWeight, setShowWeight, showRatio, setShowRatio, onOpenSelector }) {
  const bucket = bucketOf(exercise.muscle_group)
  const n = series.length

  const derived = useMemo(() => {
    const rows = series.map(s => ({
      ...s,
      label: fmtShort(s.date),
      ratio: bodyweightOn(s.date) ? s.weight / bodyweightOn(s.date) : null,
    }))
    const weights = rows.map(r => r.weight)
    const e1rms = rows.map(r => r.e1rm)
    const last = rows[rows.length - 1]
    const prev = rows.length > 1 ? rows[rows.length - 2] : null
    const pbVal = Math.max(...weights)
    const pbRow = rows.find(r => r.weight === pbVal)

    const prs = []
    let running = -Infinity
    for (const r of rows) { if (r.weight > running) { running = r.weight; prs.push(r) } }

    const wb = rows.filter(r => r.well != null)
    const r = wb.length >= 2 ? pearson(wb.map(x => x.well), wb.map(x => x.e1rm)) : 0

    const byWeight = {}
    for (const row of rows) (byWeight[row.weight] ||= []).push(row)
    const repBlocks = Object.keys(byWeight)
      .map(w => ({ w: parseFloat(w), rows: byWeight[w] }))
      .filter(b => b.rows.length >= 2)
      .map(b => {
        const reps = b.rows.map(x => x.reps)
        const gain = reps[reps.length - 1] - reps[0]
        return {
          kg: fmtTop(b.w),
          repStr: reps.join(' → '),
          gain: gain > 0 ? `+${gain} rep` : (gain < 0 ? `${gain} rep` : '±0'),
          gainPositive: gain > 0,
          dates: `${fmtShort(b.rows[0].date)} → ${fmtShort(b.rows[b.rows.length - 1].date)}`,
          count: b.rows.length,
          lastDate: b.rows[b.rows.length - 1].date,
        }
      })
      .sort((a, b) => (a.lastDate < b.lastDate ? 1 : -1))

    const cutoff = shiftDate(today, -90)
    const base = rows.find(r => r.date >= cutoff) || rows[0]
    const trendKg = last.weight - base.weight
    const trendPct = base.weight ? (trendKg / base.weight) * 100 : 0

    let freq = null
    if (rows.length >= 2) {
      const span = Math.max(daysBetween(rows[0].date, last.date), 1)
      freq = (rows.length / (span / 7))
    }

    return { rows, weights, e1rms, last, prev, pbVal, pbRow, prs, wb, r, repBlocks, trendKg, trendPct, freq }
  }, [series, bodyweightOn, today])

  if (n === 0) {
    return (
      <div className="px-8 py-10 max-w-[1420px] mx-auto">
        <LiftHeader exercise={exercise} bucket={bucket} onOpenSelector={onOpenSelector} status={status} headline={null} />
        <div className="mt-8 bg-gray-900 border border-gray-800 rounded-lg p-10 text-center">
          <p className="text-sm text-gray-300">No logged sets for {exercise.name} yet.</p>
          <p className="text-xs text-gray-500 mt-2">Log this lift in a session to start tracking its progress.</p>
        </div>
      </div>
    )
  }

  const { rows, last, prev, pbVal, pbRow, prs, r, repBlocks, trendKg, trendPct, freq } = derived
  const ratioNow = last.ratio
  const wDelta = prev ? last.weight - prev.weight : 0

  const railRows = [
    ['Current top set', `${fmtTop(last.weight)} kg`, last.weight >= pbVal ? 'text-emerald-400' : 'text-white'],
    ['Personal best', `${fmtTop(pbVal)} kg`, 'text-white', fmtShort(pbRow.date)],
    ['Est. 1RM', `~${Math.round(last.e1rm)} kg`, 'text-white', 'Epley'],
    ['Strength ratio', ratioNow ? `${ratioNow.toFixed(2)}× BW` : '—', 'text-purple-400'],
    ['Bodyweight', latestBodyweight ? `${fmtTop(latestBodyweight)} kg` : '—', 'text-white'],
    ['Frequency', freq ? `${freq.toFixed(1)}×/wk` : '—', 'text-white'],
    ['90-day trend', `${trendKg >= 0 ? '+' : ''}${fmtTop(trendKg)} kg · ${trendPct >= 0 ? '+' : ''}${trendPct.toFixed(1)}%`, trendKg >= 0 ? 'text-emerald-400' : 'text-red-400'],
  ]

  return (
    <div className="px-8 py-7 max-w-[1420px] mx-auto">
      <LiftHeader exercise={exercise} bucket={bucket} onOpenSelector={onOpenSelector} status={status}
        headline={{ weight: fmtTop(last.weight), wDelta, ratio: ratioNow }} />

      <div className="flex gap-5 flex-col lg:flex-row">
        {/* Hero chart */}
        <div className="flex-1 bg-gray-900 border border-gray-800 rounded-lg p-5">
          <div className="flex justify-between items-center mb-4">
            <div className="flex gap-2">
              <Chip active={showWeight} color={ACCENT.emerald} onClick={() => setShowWeight(v => !v)}>
                <span className="inline-block w-2 h-0.5 rounded" style={{ background: ACCENT.emerald }} />Weight (kg)
              </Chip>
              <Chip active={showRatio} color={ACCENT.purple} onClick={() => setShowRatio(v => !v)}>
                <span className="inline-block w-2 h-0.5 rounded" style={{ background: ACCENT.purple }} />×BW ratio
              </Chip>
            </div>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: CHART_TICK, fontSize: 11 }} tickLine={false} axisLine={{ stroke: CHART_GRID }} minTickGap={24} />
                <YAxis yAxisId="kg" tick={{ fill: CHART_TICK, fontSize: 11 }} tickLine={false} axisLine={false} width={36} domain={['auto', 'auto']} />
                <YAxis yAxisId="ratio" orientation="right" tick={{ fill: ACCENT.purple, fontSize: 11 }} tickLine={false} axisLine={false} width={44}
                  domain={['auto', 'auto']} tickFormatter={v => `${v.toFixed(2)}×`} />
                {showWeight && <Line yAxisId="kg" type="monotone" dataKey="weight" stroke={ACCENT.emerald} strokeWidth={2.4} dot={false} isAnimationActive={false} />}
                {showRatio && <Line yAxisId="ratio" type="monotone" dataKey="ratio" stroke={ACCENT.purple} strokeWidth={2} strokeDasharray="1 5" dot={false} connectNulls isAnimationActive={false} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stat rail */}
        <div className="w-full lg:w-[330px] flex-none">
          {railRows.map(([label, val, valClass, sub], i) => (
            <div key={label} className={`flex justify-between py-3 ${i < railRows.length - 1 ? 'border-b border-gray-800' : ''}`}>
              <span className="text-xs uppercase tracking-wider text-gray-500">{label}</span>
              <span className={`text-sm font-bold ${valClass}`}>
                {val}{sub && <span className="font-normal text-gray-600 ml-1">{sub}</span>}
              </span>
            </div>
          ))}
          <div className="mt-4 bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="text-xs tracking-widest uppercase text-gray-500 font-semibold mb-3">Recent PRs</div>
            {prs.slice(-3).reverse().map((p, i) => (
              <div key={i} className="flex justify-between text-sm mb-2 last:mb-0 text-gray-300">
                <span>{fmtTop(p.weight)} kg × {p.reps}</span>
                <span className="text-gray-600">{fmtShort(p.date)}</span>
              </div>
            ))}
            {prs.length === 0 && <div className="text-xs text-gray-600">—</div>}
          </div>
        </div>
      </div>

      {/* Deeper signals */}
      <div className="mt-5 bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 flex-wrap border-b border-gray-800">
          <span className="text-xs tracking-widest uppercase text-gray-500 font-semibold mr-2">Deeper signals</span>
          <Chip active={aTab === '1rm'} color={ACCENT.teal} onClick={() => setATab('1rm')}>Est 1RM</Chip>
          <Chip active={aTab === 'vol'} color={ACCENT.blue} onClick={() => setATab('vol')}>Volume</Chip>
          <Chip active={aTab === 'reps'} color={ACCENT.emerald} onClick={() => setATab('reps')}>Reps @ weight</Chip>
          <Chip active={aTab === 'well'} color={ACCENT.greyBlue} onClick={() => setATab('well')}>Wellbeing</Chip>
          <span className="ml-auto text-[11px] uppercase tracking-wider text-gray-600">{n} session{n === 1 ? '' : 's'}</span>
        </div>
        <div className="p-5">
          {aTab === '1rm' && <Est1rmTab derived={derived} />}
          {aTab === 'vol' && <VolumeTab derived={derived} />}
          {aTab === 'reps' && <RepsTab repBlocks={repBlocks} />}
          {aTab === 'well' && <WellbeingTab derived={derived} r={r} />}
        </div>
      </div>
    </div>
  )
}

function LiftHeader({ exercise, bucket, onOpenSelector, status, headline }) {
  const statusColor = statusHex(status?.status)
  const statusLabel = status?.status === 'progressing' ? (status.why === 'reps' ? 'PROGRESSING · REPS' : 'PROGRESSING') : (status?.status === 'skipped' ? 'NOT TRAINED' : 'STALLED')
  return (
    <div className="flex justify-between items-start mb-6 gap-4">
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-3xl font-bold text-white">{exercise.name}</h1>
        <span className="text-[10px] tracking-widest uppercase text-gray-400 border border-gray-700 rounded px-2 py-1.5">{bucket || exercise.muscle_group || ''}</span>
        {status && (
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] tracking-widest uppercase font-semibold"
            style={{ border: `1px solid ${statusColor}55`, background: `${statusColor}1a`, color: statusColor }}>
            <StatusDot color={statusColor} size={6} />{statusLabel}
          </span>
        )}
        <button onClick={onOpenSelector} className="text-[11px] tracking-wider uppercase text-gray-500 hover:text-white border border-gray-700 hover:border-gray-600 rounded px-2.5 py-1.5 transition-colors">⌕ Switch lift</button>
      </div>
      {headline && (
        <div className="text-right">
          <div className="text-3xl font-bold text-white">{headline.weight}<span className="text-base text-gray-500"> kg</span></div>
          <div className="text-sm mt-1.5 font-semibold" style={{ color: headline.wDelta > 0 ? ACCENT.emerald : '#6b7280' }}>
            {headline.wDelta > 0 ? `▲ +${fmtTop(headline.wDelta)} vs last` : 'flat vs last'}{headline.ratio ? ` · ${headline.ratio.toFixed(2)}× BW` : ''}
          </div>
        </div>
      )}
    </div>
  )
}

function TabHead({ title, desc, value, valueColor, sub }) {
  return (
    <div className="flex justify-between items-start mb-3 gap-5">
      <div className="max-w-[600px]">
        <div className="text-sm font-bold text-white">{title}</div>
        <div className="text-xs text-gray-500 leading-relaxed mt-1.5">{desc}</div>
      </div>
      {value && (
        <div className="text-right flex-none">
          <div className="text-xl font-bold" style={{ color: valueColor }}>{value}</div>
          {sub && <div className="text-[11px] text-gray-600 mt-1.5">{sub}</div>}
        </div>
      )}
    </div>
  )
}

function Est1rmTab({ derived }) {
  const { rows, last } = derived
  const peak = Math.round(Math.max(...rows.map(r => r.e1rm)))
  return (
    <div>
      <TabHead title="Estimated 1RM vs raw top-set"
        desc="Epley · load × (1 + reps/30). A more honest 'getting stronger?' read than weight alone — it ranks a heavy set for high reps above a heavier set for low reps."
        value={`~${Math.round(last.e1rm)} kg`} valueColor={ACCENT.teal} sub={`peak ${peak} kg`} />
      <div className="flex gap-4 mb-2 text-[11px]">
        <span className="text-emerald-400"><span className="inline-block w-2.5 h-0.5 rounded mr-1.5 align-middle" style={{ background: ACCENT.emerald }} />Top set (raw)</span>
        <span style={{ color: ACCENT.teal }}><span className="inline-block w-2.5 h-0.5 rounded mr-1.5 align-middle" style={{ background: ACCENT.teal }} />Est 1RM</span>
      </div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: CHART_TICK, fontSize: 11 }} tickLine={false} axisLine={{ stroke: CHART_GRID }} minTickGap={24} />
            <YAxis tick={{ fill: CHART_TICK, fontSize: 11 }} tickLine={false} axisLine={false} width={34} domain={['auto', 'auto']} />
            <Line type="monotone" dataKey="weight" stroke={ACCENT.emerald} strokeWidth={2} strokeDasharray="2 4" dot={false} isAnimationActive={false} opacity={0.7} />
            <Line type="monotone" dataKey="e1rm" stroke={ACCENT.teal} strokeWidth={2.4} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function VolumeTab({ derived }) {
  const { rows, last } = derived
  return (
    <div>
      <TabHead title="Training volume per session"
        desc="Σ weight × reps across all sets. Catches the work the top-set number hides — total tonnage can climb while top-set weight holds."
        value={`${Math.round(last.volume)} kg`} valueColor={ACCENT.blue} sub="this session" />
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: CHART_TICK, fontSize: 11 }} tickLine={false} axisLine={{ stroke: CHART_GRID }} minTickGap={24} />
            <YAxis tick={{ fill: CHART_TICK, fontSize: 11 }} tickLine={false} axisLine={false} width={42} domain={['auto', 'auto']} />
            <Bar dataKey="volume" fill={ACCENT.blue} fillOpacity={0.55} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function RepsTab({ repBlocks }) {
  if (!repBlocks.length) {
    return <p className="text-xs text-gray-500">No weight has been held across multiple sessions yet — rep progression appears once you repeat a load.</p>
  }
  return (
    <div>
      <div className="text-xs text-gray-500 leading-relaxed mb-3.5 max-w-[660px]">
        Same load, more reps <span className="text-gray-300">is</span> progressive overload — counted as <span className="text-emerald-400">progress</span>, never a stall. Rep trend at each weight held for multiple sessions:
      </div>
      <div className="flex flex-col gap-2.5">
        {repBlocks.map((b, i) => {
          const twoSess = b.count === 2
          const tagColor = twoSess ? ACCENT.amber : ACCENT.emerald
          const tag = twoSess ? '2 SESSIONS' : 'PROGRESS'
          return (
            <div key={i} className="flex items-center gap-5 bg-gray-800 border border-gray-800 rounded-lg px-4 py-3.5 flex-wrap">
              <div className="text-lg font-bold text-white w-[90px] flex-none">{b.kg}<span className="text-xs text-gray-500"> kg</span></div>
              <div className="text-lg font-bold text-gray-200 flex-1">{b.repStr}<span className="text-xs text-gray-600"> reps</span></div>
              <div className="text-xs font-semibold" style={{ color: b.gainPositive ? ACCENT.emerald : '#6b7280' }}>{b.gain}</div>
              <div className="text-[11px] text-gray-600 w-[140px] text-right flex-none">{b.dates}</div>
              <span className="text-[10px] tracking-widest uppercase font-semibold rounded px-1.5 py-1 flex-none" style={{ color: tagColor, border: `1px solid ${tagColor}55` }}>{tag}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WellbeingTab({ derived, r }) {
  const { wb } = derived
  const n = wb.length
  const MIN = 8
  if (n < MIN) {
    const pct = (n / MIN) * 100
    return (
      <div>
        <div className="flex justify-between items-start mb-3 gap-5">
          <div className="max-w-[520px]">
            <div className="text-sm font-bold text-white">Wellbeing vs performance</div>
            <div className="text-xs text-gray-500 leading-relaxed mt-1.5">Session + energy rating (averaged /10) against that day's est 1RM.</div>
          </div>
          <span className="text-[11px] tracking-wider uppercase font-semibold rounded px-2 py-1.5 flex-none" style={{ color: ACCENT.amber, border: `1px solid ${ACCENT.amber}55` }}>n={n} · building</span>
        </div>
        <div className="bg-gray-800 border border-gray-800 rounded-lg h-[200px] flex flex-col items-center justify-center text-center">
          <div className="w-[34px] h-[34px] rounded-full flex items-center justify-center mb-3.5 text-base text-gray-500 border border-gray-700">◴</div>
          <div className="text-xs tracking-widest uppercase font-semibold mb-2.5 text-gray-300">Not enough data yet</div>
          <div className="text-xs text-gray-500 leading-relaxed max-w-[380px]">A correlation off {n} session{n === 1 ? '' : 's'} is noise, not signal. We'll show it once the trend is trustworthy.</div>
        </div>
        <div className="mt-5">
          <div className="flex justify-between items-baseline mb-2">
            <span className="text-[11px] tracking-wider uppercase text-gray-400">{n} of {MIN} sessions logged</span>
            <span className="text-[11px] font-semibold text-gray-600">{MIN - n} to go</span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded overflow-hidden">
            <div className="h-full rounded" style={{ width: `${pct}%`, background: ACCENT.amber }} />
          </div>
          <div className="text-[11px] text-gray-600 leading-relaxed mt-3.5">Keep logging your session + energy rating after each workout — this insight unlocks at {MIN} sessions.</div>
        </div>
      </div>
    )
  }

  const xs = wb.map(x => x.well)
  const ys = wb.map(x => x.e1rm)
  const seg = trendSegment(xs, ys, 4, 10)
  const corrAbs = Math.abs(r).toFixed(2)
  const data = wb.map(x => ({ well: x.well, e1rm: x.e1rm }))
  return (
    <div>
      <div className="flex justify-between items-start mb-3 gap-5">
        <div className="max-w-[520px]">
          <div className="text-sm font-bold text-white">Wellbeing vs performance</div>
          <div className="text-xs text-gray-500 leading-relaxed mt-1.5">Session + energy rating (averaged /10) against that day's est 1RM. Each dot is one session.</div>
        </div>
        <div className="flex-none flex gap-2.5 items-center">
          <span className="text-[11px] tracking-wider uppercase font-semibold rounded px-2 py-1.5" style={{ color: ACCENT.emerald, border: `1px solid ${ACCENT.emerald}55` }}>n={n} · reliable</span>
          <div className="text-right">
            <div className="text-lg font-bold text-gray-200">r = {r >= 0 ? '+' : '−'}{corrAbs}</div>
            <div className="text-[10px] text-gray-600 mt-1">{r >= 0 ? 'positive' : 'negative'} link</div>
          </div>
        </div>
      </div>
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" />
            <XAxis type="number" dataKey="well" domain={[4, 10]} ticks={[4, 6, 8, 10]} tick={{ fill: CHART_TICK, fontSize: 11 }} tickLine={false} axisLine={{ stroke: CHART_GRID }} name="Wellbeing" />
            <YAxis type="number" dataKey="e1rm" domain={['auto', 'auto']} tick={{ fill: CHART_TICK, fontSize: 11 }} tickLine={false} axisLine={false} width={34} name="Est 1RM" />
            {seg && <ReferenceLine stroke={ACCENT.greyBlue} strokeWidth={1.6} strokeDasharray="4 4" segment={seg} ifOverflow="extendDomain" />}
            <Scatter data={data} fill={ACCENT.teal} fillOpacity={0.85} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="text-[11px] text-gray-500 leading-relaxed mt-2 pt-2.5 border-t border-gray-800">
        Y-axis is est 1RM (kg); X is wellbeing /10. {r >= 0 ? 'Performance tends to track how you felt going in.' : 'No clear positive link in this window.'}
      </div>
    </div>
  )
}
