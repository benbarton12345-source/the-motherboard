import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, ReferenceLine, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import Modal from './Modal'
import { localDate, shiftDate } from '../utils/taskHelpers'

// ── Design tokens (exact hex from the approved handoff) ─────────────
const C = {
  bg: '#0a0c0e', panel: '#101317', inset: '#0c0f12', card: '#121519',
  cardBorder: '#1c2229', hair: '#171c22', chipBorder: '#232a31',
  primary: '#f1f4f7', secondary: '#9aa3ad', muted: '#6a747e', faint: '#46505a',
  emerald: '#34d399', amber: '#f5b13d', red: '#ef6a6a',
  purple: '#a78bfa', teal: '#2dd4bf', blue: '#60a5fa', greyBlue: '#8aa0b6',
}

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
const SETCOL = { ok: C.emerald, low: C.amber, under: C.red }

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
      const color = st.status === 'progressing' ? C.emerald : (st.status === 'skipped' ? C.red : C.amber)
      ;(byBucket[meta.bucket] ||= []).push({
        id, name: meta.name, top: fmtTop(lastV), delta, color, label,
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
        color: x.st.status === 'progressing' ? C.emerald : (x.st.status === 'skipped' ? C.red : C.amber),
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
    <div className="fixed inset-0 z-50 overflow-y-auto font-mono" style={{ background: C.bg }}>
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center gap-4 px-8 py-4 border-b" style={{ background: C.bg, borderColor: '#15191f' }}>
        {selectedLift ? (
          <button onClick={() => setSelectedLift(null)} className="text-[12px] tracking-widest" style={{ color: C.muted }}>‹ TRAINING ANALYSIS</button>
        ) : (
          <span className="text-[12px] tracking-widest" style={{ color: C.muted }}>TRAINING ANALYSIS</span>
        )}
        {selectedLift && (
          <>
            <span style={{ color: '#2a323a' }}>/</span>
            <span className="text-[13px] tracking-wide" style={{ color: C.secondary }}>{selectedLift.name.toUpperCase()}</span>
          </>
        )}
        <button onClick={onClose} className="ml-auto text-xl leading-none" style={{ color: C.muted }}>&times;</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-xs" style={{ color: C.muted }}>Loading…</div>
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
        <Modal
          title="Select Exercise"
          onClose={() => setShowSelector(false)}
          hideSave
          cancelLabel="Close"
          maxWidth="max-w-xl"
        >
          <input
            type="text"
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search 173 exercises…"
            className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none"
            style={{ background: C.panel, border: `1px solid ${C.chipBorder}` }}
          />
          {!query && recents.length > 0 && (
            <div>
              <p className="text-[10px] tracking-[0.16em] mb-2" style={{ color: C.emerald }}>★ RECENTLY TRAINED</p>
              <div className="space-y-px">
                {recents.map(r => (
                  <button key={r.id} onClick={() => { setSelectedLift(r.exercise); setShowSelector(false); setATab('1rm') }}
                    className="w-full flex items-center gap-3 px-2 py-2.5 rounded text-left hover:bg-[#121519]">
                    <span className="w-[7px] h-[7px] rounded-full flex-none" style={{ background: r.color, boxShadow: `0 0 8px ${r.color}` }} />
                    <span className="flex-1 text-sm text-white truncate">{r.name}</span>
                    <span className="text-[10.5px] tracking-wider" style={{ color: C.muted }}>{r.muscle}</span>
                    <span className="text-[11px] w-9 text-right" style={{ color: C.faint }}>{r.daysAgo}d</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {groupedExercises.map(({ mg, items }) => (
            <div key={mg}>
              <p className="text-[10px] tracking-[0.16em] mb-2" style={{ color: C.secondary }}>{mg.toUpperCase()}</p>
              <div className="space-y-px">
                {items.map(ex => {
                  const tracked = !!seriesByExercise[ex.id]
                  return (
                    <button key={ex.id} onClick={() => { setSelectedLift(ex); setShowSelector(false); setATab('1rm') }}
                      className="w-full flex items-center gap-3 px-2 py-2.5 rounded text-left hover:bg-[#121519]">
                      <span className="flex-1 text-sm text-white truncate">{ex.name}</span>
                      {tracked && (
                        <span className="text-[8.5px] tracking-[0.1em] rounded px-1.5 py-0.5" style={{ color: C.emerald, border: `1px solid ${C.emerald}55` }}>TRACKED</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {groupedExercises.length === 0 && <p className="text-xs" style={{ color: C.muted }}>No exercises match.</p>}
        </Modal>
      )}
    </div>
  )
}

// ── Small shared bits ───────────────────────────────────────────────
function Chip({ active, color, children, onClick }) {
  return (
    <button onClick={onClick}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] tracking-[0.1em] font-semibold"
      style={active
        ? { border: `1px solid ${color}`, color, background: `${color}1f` }
        : { border: `1px solid ${C.chipBorder}`, color: C.muted, background: 'transparent' }}>
      {children}
    </button>
  )
}

function StatusDot({ color, size = 8 }) {
  return <span className="rounded-full flex-none" style={{ width: size, height: size, background: color, boxShadow: `0 0 ${size + 2}px ${color}` }} />
}

// ── Overview ────────────────────────────────────────────────────────
function OverviewView({ tally, trackedCount, weeklySets, weekTotal, groups, groupFilter, setGroupFilter, onSelectLift, onOpenSelector }) {
  return (
    <div className="px-8 pt-7 pb-12 max-w-[1420px] mx-auto">
      {/* Title */}
      <div className="flex justify-between items-end">
        <div>
          <div className="text-[23px] font-semibold font-sans" style={{ color: '#eef1f4' }}>Training Analysis</div>
          <div className="text-[12px] mt-2" style={{ color: C.muted }}>{trackedCount} lifts tracked · trailing performance</div>
        </div>
        <button onClick={onOpenSelector} className="flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-[12px]"
          style={{ border: `1px solid ${C.chipBorder}`, color: C.muted }}>⌕ Find a lift…</button>
      </div>

      {trackedCount === 0 ? (
        <div className="mt-10 rounded-xl p-10 text-center" style={{ background: C.panel, border: `1px solid ${C.cardBorder}` }}>
          <p className="text-sm" style={{ color: C.secondary }}>No logged sessions yet.</p>
          <p className="text-[11px] mt-2" style={{ color: C.muted }}>Log a few training sessions and your progress analysis will populate here.</p>
        </div>
      ) : (
        <>
          {/* Status tally */}
          <div className="flex gap-3 mt-6 mb-2">
            {[
              { n: tally.progressing, label: 'PROGRESSING', color: C.emerald },
              { n: tally.stalled, label: 'STALLED', color: C.amber },
              { n: tally.skipped, label: 'NOT TRAINED 14d+', color: C.red },
            ].map(t => (
              <div key={t.label} className="flex items-center gap-2.5 px-4 py-3 rounded-lg" style={{ border: `1px solid #1e242b`, background: C.panel }}>
                <StatusDot color={t.color} />
                <span className="text-[19px] font-semibold" style={{ color: '#eef1f4' }}>{t.n}</span>
                <span className="text-[10px] tracking-[0.12em] font-semibold" style={{ color: t.color }}>{t.label}</span>
              </div>
            ))}
          </div>

          {/* Weekly set volume */}
          <div className="mt-5 mb-1">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[10px] tracking-[0.16em] font-semibold" style={{ color: C.secondary }}>WEEKLY SET VOLUME</span>
              <span className="text-[10px]" style={{ color: '#4b545d' }}>{weekTotal} HARD SETS · CURRENT WEEK · TARGET RANGE PER MUSCLE</span>
              <div className="flex-1 h-px" style={{ background: C.hair }} />
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {weeklySets.map(ws => (
                <div key={ws.muscle} className="rounded-lg p-3.5" style={{ background: C.panel, border: `1px solid #1e242b` }}>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[9.5px] tracking-[0.1em] font-semibold" style={{ color: C.secondary }}>{ws.muscle.toUpperCase()}</span>
                    <StatusDot color={ws.color} size={6} />
                  </div>
                  <div className="flex items-end gap-1.5 mb-2.5">
                    <span className="text-[22px] font-semibold" style={{ color: '#f1f4f7' }}>{ws.sets}</span>
                    <span className="text-[10px] pb-0.5" style={{ color: C.faint }}>/ {ws.range}</span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: '#1b2128' }}>
                    <div className="h-full rounded-full" style={{ width: `${ws.pct}%`, background: ws.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Muscle filter */}
          <div className="flex gap-2 mt-5 mb-6 flex-wrap">
            {['ALL', ...BUCKETS.map(b => b.toUpperCase())].map(b => (
              <Chip key={b} active={groupFilter === b} color="#c8d0d8"
                onClick={() => setGroupFilter(b === 'ALL' ? 'ALL' : BUCKETS.find(x => x.toUpperCase() === b))}>
                {b}
              </Chip>
            ))}
          </div>

          {/* Groups */}
          {groups.map(group => (
            <div key={group.muscle} className="mb-7">
              <div className="flex items-center gap-3.5 mb-3.5">
                <span className="text-[11px] tracking-[0.18em] font-semibold" style={{ color: C.secondary }}>{group.muscle.toUpperCase()}</span>
                <span className="text-[10px]" style={{ color: '#4b545d' }}>{group.count} LIFTS</span>
                <span className="inline-flex items-center gap-1.5 text-[9.5px] tracking-wider font-semibold" style={{ color: group.weekColor }}>
                  <StatusDot color={group.weekColor} size={5} />{group.weekSets} SETS/WK · {group.weekRange}
                </span>
                <div className="flex-1 h-px" style={{ background: C.hair }} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {group.lifts.map(lift => (
                  <button key={lift.id} onClick={() => onSelectLift(lift.exercise)}
                    className="text-left rounded-[10px] p-4 flex flex-col gap-2.5 hover:brightness-110 transition"
                    style={{ background: C.card, border: `1px solid #1e242b` }}>
                    <div className="flex justify-between items-start">
                      <div className="text-[13.5px] font-sans font-semibold" style={{ color: '#dfe4e9' }}>{lift.name}</div>
                      <span className="mt-1"><StatusDot color={lift.color} size={7} /></span>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="text-[25px] font-semibold" style={{ color: '#f1f4f7' }}>{lift.top}</div>
                      <div className="text-[11px] pb-0.5" style={{ color: C.muted }}>kg</div>
                      <div className="ml-auto text-[12px] font-semibold pb-0.5" style={{ color: lift.color }}>{lift.delta}</div>
                    </div>
                    <div className="h-[34px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={lift.spark} margin={{ top: 4, bottom: 4, left: 0, right: 0 }}>
                          <Line type="monotone" dataKey="v" stroke={lift.color} strokeWidth={1.8} dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[9.5px] tracking-[0.1em] font-semibold" style={{ color: lift.color }}>{lift.label}</span>
                      <span className="text-[10px]" style={{ color: C.faint }}>{lift.daysAgo}d ago</span>
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

    // PRs: sessions that set a new running-max top weight
    const prs = []
    let running = -Infinity
    for (const r of rows) { if (r.weight > running) { running = r.weight; prs.push(r) } }

    // wellbeing pairs (only sessions with a rating)
    const wb = rows.filter(r => r.well != null)
    const r = wb.length >= 2 ? pearson(wb.map(x => x.well), wb.map(x => x.e1rm)) : 0

    // held-weight rep blocks (weights used as top set across >=2 sessions)
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

    // 90-day trend
    const cutoff = shiftDate(today, -90)
    const base = rows.find(r => r.date >= cutoff) || rows[0]
    const trendKg = last.weight - base.weight
    const trendPct = base.weight ? (trendKg / base.weight) * 100 : 0

    // frequency: sessions per week across the logged span
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
        <div className="mt-8 rounded-xl p-10 text-center" style={{ background: C.panel, border: `1px solid ${C.cardBorder}` }}>
          <p className="text-sm" style={{ color: C.secondary }}>No logged sets for {exercise.name} yet.</p>
          <p className="text-[11px] mt-2" style={{ color: C.muted }}>Log this lift in a session to start tracking its progress.</p>
        </div>
      </div>
    )
  }

  const { rows, last, prev, pbVal, pbRow, prs, r, repBlocks, trendKg, trendPct, freq } = derived
  const statusColor = status?.status === 'progressing' ? C.emerald : (status?.status === 'skipped' ? C.red : C.amber)
  const statusLabel = status?.status === 'progressing' ? (status.why === 'reps' ? 'PROGRESSING · REPS' : 'PROGRESSING') : (status?.status === 'skipped' ? 'NOT TRAINED' : 'STALLED')
  const ratioNow = last.ratio
  const wDelta = prev ? last.weight - prev.weight : 0

  return (
    <div className="px-8 py-7 max-w-[1420px] mx-auto">
      <LiftHeader exercise={exercise} bucket={bucket} onOpenSelector={onOpenSelector} status={status}
        headline={{ weight: fmtTop(last.weight), wDelta, ratio: ratioNow, statusColor, statusLabel }} />

      <div className="flex gap-5 flex-col lg:flex-row">
        {/* Hero chart */}
        <div className="flex-1 rounded-[11px] p-5" style={{ background: C.panel, border: `1px solid ${C.cardBorder}` }}>
          <div className="flex justify-between items-center mb-4">
            <div className="flex gap-2">
              <Chip active={showWeight} color={C.emerald} onClick={() => setShowWeight(v => !v)}>
                <span className="inline-block w-2 h-0.5 rounded" style={{ background: C.emerald }} />WEIGHT (KG)
              </Chip>
              <Chip active={showRatio} color={C.purple} onClick={() => setShowRatio(v => !v)}>
                <span className="inline-block w-2 h-0.5 rounded" style={{ background: C.purple }} />×BW RATIO
              </Chip>
            </div>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid stroke={C.hair} strokeDasharray="0" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: C.faint, fontSize: 10 }} tickLine={false} axisLine={{ stroke: C.hair }} minTickGap={24} />
                <YAxis yAxisId="kg" tick={{ fill: C.faint, fontSize: 10 }} tickLine={false} axisLine={false} width={36} domain={['auto', 'auto']} />
                <YAxis yAxisId="ratio" orientation="right" tick={{ fill: '#6f64ad', fontSize: 10 }} tickLine={false} axisLine={false} width={44}
                  domain={['auto', 'auto']} tickFormatter={v => `${v.toFixed(2)}×`} />
                {showWeight && <Line yAxisId="kg" type="monotone" dataKey="weight" stroke={C.emerald} strokeWidth={2.4} dot={false} isAnimationActive={false} />}
                {showRatio && <Line yAxisId="ratio" type="monotone" dataKey="ratio" stroke={C.purple} strokeWidth={2} strokeDasharray="1 5" dot={false} connectNulls isAnimationActive={false} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stat rail */}
        <div className="w-full lg:w-[330px] flex-none">
          {[
            ['CURRENT TOP SET', `${fmtTop(last.weight)} kg`, last.weight >= pbVal ? C.emerald : null],
            ['PERSONAL BEST', `${fmtTop(pbVal)} kg`, null, fmtShort(pbRow.date)],
            ['EST. 1RM', `~${Math.round(last.e1rm)} kg`, null, 'Epley'],
            ['STRENGTH RATIO', ratioNow ? `${ratioNow.toFixed(2)}× BW` : '—', C.purple],
            ['BODYWEIGHT', latestBodyweight ? `${fmtTop(latestBodyweight)} kg` : '—', null],
            ['FREQUENCY', freq ? `${freq.toFixed(1)}×/wk` : '—', null],
            ['90-DAY TREND', `${trendKg >= 0 ? '+' : ''}${fmtTop(trendKg)} kg · ${trendPct >= 0 ? '+' : ''}${trendPct.toFixed(1)}%`, trendKg >= 0 ? C.emerald : C.red],
          ].map(([label, val, valColor, sub], i, arr) => (
            <div key={label} className="flex justify-between py-3" style={{ borderBottom: i < arr.length - 1 ? `1px solid ${C.hair}` : 'none' }}>
              <span className="text-[10.5px] tracking-wider" style={{ color: C.muted }}>{label}</span>
              <span className="text-[13px] font-semibold" style={{ color: valColor || '#eef1f4' }}>
                {val}{sub && <span className="font-normal ml-1" style={{ color: C.faint }}>{sub}</span>}
              </span>
            </div>
          ))}
          <div className="mt-4 rounded-[10px] p-4" style={{ background: C.panel, border: `1px solid ${C.cardBorder}` }}>
            <div className="text-[9.5px] tracking-[0.14em] font-semibold mb-3" style={{ color: C.muted }}>RECENT PRs</div>
            {prs.slice(-3).reverse().map((p, i) => (
              <div key={i} className="flex justify-between text-[12px] mb-2 last:mb-0" style={{ color: '#cdd5dd' }}>
                <span>{fmtTop(p.weight)} kg × {p.reps}</span>
                <span style={{ color: C.faint }}>{fmtShort(p.date)}</span>
              </div>
            ))}
            {prs.length === 0 && <div className="text-[11px]" style={{ color: C.muted }}>—</div>}
          </div>
        </div>
      </div>

      {/* Deeper signals */}
      <div className="mt-5 rounded-xl overflow-hidden" style={{ background: C.panel, border: `1px solid ${C.cardBorder}` }}>
        <div className="flex items-center gap-2 px-5 py-3.5 flex-wrap" style={{ borderBottom: `1px solid ${C.hair}` }}>
          <span className="text-[9.5px] tracking-[0.16em] font-semibold mr-2" style={{ color: C.muted }}>DEEPER SIGNALS</span>
          <Chip active={aTab === '1rm'} color={C.teal} onClick={() => setATab('1rm')}>EST 1RM</Chip>
          <Chip active={aTab === 'vol'} color={C.blue} onClick={() => setATab('vol')}>VOLUME</Chip>
          <Chip active={aTab === 'reps'} color={C.emerald} onClick={() => setATab('reps')}>REPS @ WEIGHT</Chip>
          <Chip active={aTab === 'well'} color={C.greyBlue} onClick={() => setATab('well')}>WELLBEING</Chip>
          <span className="ml-auto text-[9.5px] tracking-wider" style={{ color: C.faint }}>{n} SESSION{n === 1 ? '' : 'S'}</span>
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
  const statusColor = status?.status === 'progressing' ? C.emerald : (status?.status === 'skipped' ? C.red : C.amber)
  const statusLabel = status?.status === 'progressing' ? (status.why === 'reps' ? 'PROGRESSING · REPS' : 'PROGRESSING') : (status?.status === 'skipped' ? 'NOT TRAINED' : 'STALLED')
  return (
    <div className="flex justify-between items-start mb-6">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="text-[30px] font-sans font-semibold" style={{ color: '#f1f4f7' }}>{exercise.name}</div>
        <span className="text-[10px] tracking-[0.14em] rounded px-2 py-1.5" style={{ color: C.secondary, border: `1px solid ${C.chipBorder}` }}>{(bucket || exercise.muscle_group || '').toUpperCase()}</span>
        {status && (
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-[10.5px] tracking-[0.12em] font-semibold"
            style={{ border: `1px solid ${statusColor}55`, background: `${statusColor}1a`, color: statusColor }}>
            <StatusDot color={statusColor} size={6} />{statusLabel}
          </span>
        )}
        <button onClick={onOpenSelector} className="text-[11px] tracking-wider px-2.5 py-1.5 rounded" style={{ color: C.muted, border: `1px solid ${C.chipBorder}` }}>⌕ SWITCH LIFT</button>
      </div>
      {headline && (
        <div className="text-right">
          <div className="text-[30px] font-semibold" style={{ color: '#f1f4f7' }}>{headline.weight}<span className="text-[15px]" style={{ color: C.muted }}> kg</span></div>
          <div className="text-[12px] mt-1.5 font-semibold" style={{ color: headline.wDelta > 0 ? C.emerald : C.muted }}>
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
        <div className="text-[13px] font-sans font-semibold" style={{ color: '#e3e8ed' }}>{title}</div>
        <div className="text-[10.5px] leading-relaxed mt-1.5" style={{ color: C.muted }}>{desc}</div>
      </div>
      {value && (
        <div className="text-right flex-none">
          <div className="text-[21px] font-semibold" style={{ color: valueColor }}>{value}</div>
          {sub && <div className="text-[10px] mt-1.5" style={{ color: C.faint }}>{sub}</div>}
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
        value={`~${Math.round(last.e1rm)} kg`} valueColor={C.teal} sub={`peak ${peak} kg`} />
      <div className="flex gap-4 mb-1 text-[9.5px]">
        <span style={{ color: C.emerald }}><span className="inline-block w-2.5 h-0.5 rounded mr-1.5 align-middle" style={{ background: C.emerald }} />TOP SET (RAW)</span>
        <span style={{ color: C.teal }}><span className="inline-block w-2.5 h-0.5 rounded mr-1.5 align-middle" style={{ background: C.teal }} />EST 1RM</span>
      </div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid stroke={C.hair} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: C.faint, fontSize: 9.5 }} tickLine={false} axisLine={{ stroke: C.hair }} minTickGap={24} />
            <YAxis tick={{ fill: C.faint, fontSize: 9.5 }} tickLine={false} axisLine={false} width={34} domain={['auto', 'auto']} />
            <Line type="monotone" dataKey="weight" stroke={C.emerald} strokeWidth={2} strokeDasharray="2 4" dot={false} isAnimationActive={false} opacity={0.7} />
            <Line type="monotone" dataKey="e1rm" stroke={C.teal} strokeWidth={2.4} dot={false} isAnimationActive={false} />
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
        value={`${Math.round(last.volume)} kg`} valueColor={C.blue} sub="this session" />
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid stroke={C.hair} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: C.faint, fontSize: 9.5 }} tickLine={false} axisLine={{ stroke: C.hair }} minTickGap={24} />
            <YAxis tick={{ fill: C.faint, fontSize: 9.5 }} tickLine={false} axisLine={false} width={42} domain={['auto', 'auto']} />
            <Bar dataKey="volume" fill={C.blue} fillOpacity={0.5} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function RepsTab({ repBlocks }) {
  if (!repBlocks.length) {
    return <p className="text-[11px]" style={{ color: C.muted }}>No weight has been held across multiple sessions yet — rep progression appears once you repeat a load.</p>
  }
  return (
    <div>
      <div className="text-[10.5px] leading-relaxed mb-3.5 max-w-[660px]" style={{ color: C.muted }}>
        Same load, more reps <span style={{ color: '#cdd5dd' }}>is</span> progressive overload — counted as <span style={{ color: C.emerald }}>progress</span>, never a stall. Rep trend at each weight held for multiple sessions:
      </div>
      <div className="flex flex-col gap-2.5">
        {repBlocks.map((b, i) => {
          const twoSess = b.count === 2
          const tagColor = twoSess ? C.amber : C.emerald
          const tag = twoSess ? '2 SESSIONS' : 'PROGRESS'
          return (
            <div key={i} className="flex items-center gap-5 rounded-[9px] px-4.5 py-3.5 flex-wrap" style={{ background: C.inset, border: `1px solid ${C.cardBorder}` }}>
              <div className="text-[18px] font-semibold w-[90px] flex-none" style={{ color: '#eef1f4' }}>{b.kg}<span className="text-[11px]" style={{ color: C.muted }}> kg</span></div>
              <div className="text-[18px] font-semibold flex-1" style={{ color: '#dfe4e9', letterSpacing: '0.04em' }}>{b.repStr}<span className="text-[11px]" style={{ color: C.faint }}> reps</span></div>
              <div className="text-[11px] font-semibold" style={{ color: b.gainPositive ? C.emerald : C.muted }}>{b.gain}</div>
              <div className="text-[10px] w-[140px] text-right flex-none" style={{ color: C.faint }}>{b.dates}</div>
              <span className="text-[8.5px] tracking-[0.1em] font-semibold rounded px-1.5 py-1 flex-none" style={{ color: tagColor, border: `1px solid ${tagColor}55` }}>{tag}</span>
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
            <div className="text-[13px] font-sans font-semibold" style={{ color: '#e3e8ed' }}>Wellbeing vs performance</div>
            <div className="text-[10.5px] leading-relaxed mt-1.5" style={{ color: C.muted }}>Session + energy rating (averaged /10) against that day's est 1RM.</div>
          </div>
          <span className="text-[9.5px] tracking-wider font-semibold rounded px-2 py-1.5 flex-none" style={{ color: C.amber, border: `1px solid ${C.amber}55` }}>n={n} · BUILDING</span>
        </div>
        <div className="relative rounded-lg h-[200px] flex flex-col items-center justify-center text-center" style={{ background: C.inset, border: `1px solid ${C.cardBorder}` }}>
          <div className="w-[34px] h-[34px] rounded-full flex items-center justify-center mb-3.5 text-[16px]" style={{ border: '1px solid #2a323a', color: C.muted }}>◴</div>
          <div className="text-[11px] tracking-[0.14em] font-semibold mb-2.5" style={{ color: '#cdd5dd' }}>NOT ENOUGH DATA YET</div>
          <div className="text-[11px] leading-relaxed max-w-[380px]" style={{ color: C.muted }}>A correlation off {n} session{n === 1 ? '' : 's'} is noise, not signal. We'll show it once the trend is trustworthy.</div>
        </div>
        <div className="mt-5">
          <div className="flex justify-between items-baseline mb-2">
            <span className="text-[10px] tracking-[0.08em]" style={{ color: '#8a94a0' }}>{n} OF {MIN} SESSIONS LOGGED</span>
            <span className="text-[10px] font-semibold" style={{ color: C.faint }}>{MIN - n} to go</span>
          </div>
          <div className="h-1.5 rounded overflow-hidden" style={{ background: '#1b2128' }}>
            <div className="h-full rounded" style={{ width: `${pct}%`, background: C.amber }} />
          </div>
          <div className="text-[10px] leading-relaxed mt-3.5" style={{ color: C.faint }}>Keep logging your session + energy rating after each workout — this insight unlocks at {MIN} sessions.</div>
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
          <div className="text-[13px] font-sans font-semibold" style={{ color: '#e3e8ed' }}>Wellbeing vs performance</div>
          <div className="text-[10.5px] leading-relaxed mt-1.5" style={{ color: C.muted }}>Session + energy rating (averaged /10) against that day's est 1RM. Each dot is one session.</div>
        </div>
        <div className="flex-none flex gap-2.5 items-center">
          <span className="text-[9.5px] tracking-wider font-semibold rounded px-2 py-1.5" style={{ color: C.emerald, border: `1px solid ${C.emerald}55` }}>n={n} · RELIABLE</span>
          <div className="text-right">
            <div className="text-[17px] font-semibold" style={{ color: '#cdd5dd' }}>r = {r >= 0 ? '+' : '−'}{corrAbs}</div>
            <div className="text-[9px] mt-1" style={{ color: C.faint }}>{r >= 0 ? 'positive' : 'negative'} link</div>
          </div>
        </div>
      </div>
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid stroke={C.hair} />
            <XAxis type="number" dataKey="well" domain={[4, 10]} ticks={[4, 6, 8, 10]} tick={{ fill: C.faint, fontSize: 9 }} tickLine={false} axisLine={{ stroke: C.hair }} name="Wellbeing" />
            <YAxis type="number" dataKey="e1rm" domain={['auto', 'auto']} tick={{ fill: C.faint, fontSize: 9 }} tickLine={false} axisLine={false} width={34} name="Est 1RM" />
            {seg && <ReferenceLine stroke={C.greyBlue} strokeWidth={1.6} strokeDasharray="4 4" segment={seg} ifOverflow="extendDomain" />}
            <Scatter data={data} fill={C.teal} fillOpacity={0.85} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="text-[10px] leading-relaxed mt-2 pt-2.5" style={{ color: C.muted, borderTop: `1px solid ${C.hair}` }}>
        Y-axis is est 1RM (kg); X is wellbeing /10. {r >= 0 ? 'Performance tends to track how you felt going in.' : 'No clear positive link in this window.'}
      </div>
    </div>
  )
}
