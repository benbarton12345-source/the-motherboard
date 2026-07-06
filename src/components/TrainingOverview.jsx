import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { localDate, shiftDate } from '../utils/taskHelpers'
import {
  ACCENT, bucketOf, daysBetween, weekStartMonday,
  fmtTop, fmtShort,
  buildSeriesByExercise, buildStatusByExercise, buildWeeklySets,
} from '../utils/trainingAnalytics'

// Training Overview — the landing page for the Training module. Everything here
// is derived client-side from the same performed_* data the Analysis screen uses;
// the stall classifier and weekly set-volume logic are shared via trainingAnalytics.
// Bodyweight Ratios (a third Making Gains tile) is intentionally left as a gap —
// it lands once we've worked out exercise → canonical-lift matching.

const HEAT_EMPTY = '#1f2937' // gray-800
const heatColor = (c) => (c === 0 ? HEAT_EMPTY : c === 1 ? 'rgba(52,211,153,0.4)' : c === 2 ? 'rgba(52,211,153,0.7)' : ACCENT.emerald)

export default function TrainingOverview({ onStartSession, onOpenSub }) {
  const [loading, setLoading] = useState(true)
  const [programme, setProgramme] = useState(null)      // { id, name } | null
  const [planned, setPlanned] = useState([])            // [{ id, name, sort_order, count }]
  const [perf, setPerf] = useState([])                  // performed_sessions (asc by date) + nested ex/sets
  const [exerciseMap, setExerciseMap] = useState({})    // id -> { name, muscle_group, bucket }

  const today = localDate()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: prog } = await supabase
        .from('programmes').select('id, name').eq('is_active', true).limit(1).maybeSingle()

      let plannedSessions = []
      if (prog) {
        const { data: ss } = await supabase
          .from('sessions')
          .select('id, name, sort_order, session_exercises(count)')
          .eq('programme_id', prog.id)
          .order('sort_order')
        plannedSessions = (ss || []).map(s => ({
          id: s.id, name: s.name, sort_order: s.sort_order,
          count: s.session_exercises?.[0]?.count ?? 0,
        }))
      }

      const [{ data: exs }, { data: ps }] = await Promise.all([
        supabase.from('exercises').select('id, name, muscle_group'),
        supabase.from('performed_sessions').select(`
          id, performed_date, session_id, programme_id, session_rating, energy_rating,
          performed_exercises ( exercise_id, performed_sets ( set_number, actual_weight, actual_reps ) )
        `).order('performed_date'),
      ])

      if (cancelled) return
      const map = {}
      for (const e of exs || []) map[e.id] = { name: e.name, muscle_group: e.muscle_group, bucket: bucketOf(e.muscle_group) }
      setProgramme(prog || null)
      setPlanned(plannedSessions)
      setExerciseMap(map)
      setPerf(ps || [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const series = useMemo(() => buildSeriesByExercise(perf), [perf])
  const status = useMemo(() => buildStatusByExercise(series, today), [series, today])
  const weeklySets = useMemo(() => buildWeeklySets(perf, exerciseMap, today), [perf, exerciseMap, today])

  const m = useMemo(() => {
    const weekStart = weekStartMonday(today)
    const plannedPerWeek = planned.length
    const progPerf = programme ? perf.filter(p => p.programme_id === programme.id) : []

    // Status strip
    const sessionsThisWeek = perf.filter(p => p.performed_date >= weekStart).length
    const firstProgDate = progPerf.length ? progPerf[0].performed_date : null
    const weeksOn = firstProgDate ? Math.floor(daysBetween(firstProgDate, today) / 7) + 1 : null
    const windowStart = shiftDate(today, -27) // rolling 4 weeks (28 days inclusive)
    const completed4w = progPerf.filter(p => p.performed_date >= windowStart).length
    const planned4w = plannedPerWeek * 4
    const adherence = planned4w ? Math.round((completed4w / planned4w) * 100) : null

    // Heatmap (current year)
    const year = today.slice(0, 4)
    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`
    const countMap = {}
    for (const p of perf) {
      if (p.performed_date.slice(0, 4) !== year) continue
      countMap[p.performed_date] = (countMap[p.performed_date] || 0) + 1
    }
    const totalThisYear = Object.values(countMap).reduce((a, b) => a + b, 0)
    const columns = []
    let cursor = weekStartMonday(yearStart)
    while (cursor <= yearEnd) {
      const cells = []
      let monthLabel = null
      for (let i = 0; i < 7; i++) {
        const d = shiftDate(cursor, i)
        if (d < yearStart || d > yearEnd) { cells.push(null); continue }
        cells.push({ date: d, count: countMap[d] || 0 })
        if (monthLabel === null && d.slice(8, 10) <= '07') monthLabel = d.slice(5, 7) // first week of a month
      }
      columns.push({ cells, monthLabel })
      cursor = shiftDate(cursor, 7)
    }

    // Week streak — consecutive weeks with ≥1 session, back from the current week
    // (an empty in-progress current week doesn't break it).
    const performedSet = new Set(perf.map(p => p.performed_date))
    const hasInWeek = (mon) => { for (let i = 0; i < 7; i++) if (performedSet.has(shiftDate(mon, i))) return true; return false }
    let streak = 0
    let wk = weekStartMonday(today)
    if (!hasInWeek(wk)) wk = shiftDate(wk, -7)
    while (hasInWeek(wk)) { streak++; wk = shiftDate(wk, -7) }

    // New PRs this month — based on what was actually logged, not estimated 1RM.
    // A repeat-improvement PR = a session that beat the previous logged one:
    // heavier top set at ≥ the same reps, or more reps at the same weight.
    // A first-ever log of an exercise this month is a NEW LIFT. Repeat PRs are
    // prioritised; NEW LIFT entries are capped so early logs don't crowd them out.
    const ym = today.slice(0, 7)
    const repeatPRs = []
    const newLifts = []
    for (const id in series) {
      const s = series[id]
      const name = exerciseMap[id]?.name || 'Exercise'
      if (s.length && s[0].date.slice(0, 7) === ym) {
        newLifts.push({ id, name, weight: s[0].weight, reps: s[0].reps, date: s[0].date, isNew: true })
      }
      for (let i = 1; i < s.length; i++) {
        const cur = s[i], prev = s[i - 1]
        if (cur.date.slice(0, 7) !== ym) continue
        const heavier = cur.weight > prev.weight && cur.reps >= prev.reps
        const moreReps = cur.weight === prev.weight && cur.reps > prev.reps
        if (heavier || moreReps) {
          repeatPRs.push({ id, name, weight: cur.weight, reps: cur.reps, date: cur.date, prevWeight: prev.weight, prevReps: prev.reps })
        }
      }
    }
    repeatPRs.sort((a, b) => (a.date < b.date ? 1 : -1))
    newLifts.sort((a, b) => (a.date < b.date ? 1 : -1))
    const NEW_LIFT_CAP = 3
    const newPRs = [...repeatPRs, ...newLifts.slice(0, NEW_LIFT_CAP)]

    // Fastest progressing — plain top-set weight gain over the trailing ~4 weeks
    // (actual last-minus-first logged weight, not a per-week extrapolation).
    const trendStart = shiftDate(today, -27)
    const progressing = []
    for (const id in series) {
      const pts = series[id].filter(r => r.date >= trendStart)
      if (pts.length < 2) continue
      const first = pts[0], last = pts[pts.length - 1]
      const change = last.weight - first.weight
      if (change > 0.01) {
        progressing.push({
          id, name: exerciseMap[id]?.name || 'Exercise',
          change, spanDays: daysBetween(first.date, last.date),
          spark: pts.slice(-6).map(r => r.weight),
        })
      }
    }
    progressing.sort((a, b) => (b.change - a.change) || (a.spanDays - b.spanDays))
    const fastest = progressing.slice(0, 3)

    // Stalled lifts (reused classifier status)
    const stalled = []
    for (const id in status) {
      if (status[id].status !== 'stalled') continue
      const s = series[id]
      stalled.push({
        id, name: exerciseMap[id]?.name || 'Exercise',
        muscle: exerciseMap[id]?.muscle_group || '',
        top: s[s.length - 1].weight,
        daysAgo: daysBetween(status[id].lastDate, today),
      })
    }
    stalled.sort((a, b) => a.daysAgo - b.daysAgo)

    // Volume gaps — muscle buckets below their weekly target
    const weekTotalSets = weeklySets.reduce((a, b) => a + b.sets, 0)
    const gaps = weeklySets.filter(w => w.status !== 'ok')

    // Right Now — last session + next in the programme rotation
    const byId = Object.fromEntries(planned.map(s => [s.id, s]))
    const lastPerf = perf.length ? perf[perf.length - 1] : null
    const lastName = lastPerf ? (lastPerf.session_id ? (byId[lastPerf.session_id]?.name || 'Session') : 'Ad hoc session') : null
    let nextSession = null
    if (planned.length) {
      const lastWithSession = [...perf].reverse().find(p => p.session_id && byId[p.session_id])
      if (lastWithSession) {
        const idx = planned.findIndex(s => s.id === lastWithSession.session_id)
        nextSession = planned[(idx + 1) % planned.length]
      } else {
        nextSession = planned[0]
      }
    }

    return {
      plannedPerWeek, sessionsThisWeek, weeksOn, adherence, completed4w, planned4w,
      columns, totalThisYear, streak,
      newPRs, fastest, stalled, gaps, weekTotalSets,
      lastPerf, lastName, nextSession,
    }
  }, [perf, planned, programme, exerciseMap, series, status, weeklySets, today])

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-sm text-gray-600">Loading…</div>
  }

  // Truly empty account — no programme and nothing ever logged
  if (!programme && perf.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-10 text-center">
        <p className="text-sm text-gray-300">Your training overview lives here.</p>
        <p className="text-xs text-gray-500 mt-2 mb-5">Build a programme and log your first session to see your weekly volume, streaks, PRs and stalled lifts.</p>
        <button onClick={() => onOpenSub?.('programmes')}
          className="px-4 py-2 bg-emerald-400 text-gray-950 text-xs font-bold tracking-widest uppercase rounded hover:bg-emerald-300 transition-colors">
          Build a programme
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* 1 ── Status strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatBlock title="Sessions this week">
          {m.plannedPerWeek > 0 ? (
            <>
              <DotRow done={m.sessionsThisWeek} planned={m.plannedPerWeek} />
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-white">{m.sessionsThisWeek}</span>
                <span className="text-sm text-gray-500">/ {m.plannedPerWeek} planned</span>
              </div>
            </>
          ) : (
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-white">{m.sessionsThisWeek}</span>
              <span className="text-sm text-gray-500">logged</span>
            </div>
          )}
        </StatBlock>

        <StatBlock title="Weeks on programme">
          {m.weeksOn != null ? (
            <>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-white">{m.weeksOn}</span>
                <span className="text-sm text-gray-500">{m.weeksOn === 1 ? 'week' : 'weeks'}</span>
              </div>
              <p className="text-xs text-gray-600 mt-2 truncate">{programme?.name || 'Current programme'}</p>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-gray-600">—</div>
              <p className="text-xs text-gray-600 mt-2">No sessions logged yet</p>
            </>
          )}
        </StatBlock>

        <StatBlock title="Programme adherence">
          {m.adherence != null ? (
            <>
              <div className="flex items-baseline gap-1.5 mb-2.5">
                <span className="text-2xl font-bold text-white">{m.adherence}%</span>
                <span className="text-sm text-gray-500 ml-auto">{m.completed4w}/{m.planned4w} · 4wk</span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.min(m.adherence, 100)}%`, background: m.adherence >= 80 ? ACCENT.emerald : m.adherence >= 50 ? ACCENT.amber : ACCENT.red }} />
              </div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-gray-600">—</div>
              <p className="text-xs text-gray-600 mt-2">Needs an active programme</p>
            </>
          )}
        </StatBlock>
      </div>

      {/* 2 ── Sessions heatmap ─────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <span className="text-xs tracking-widest uppercase text-gray-400 font-semibold">Sessions · {today.slice(0, 4)}</span>
          <div className="flex-1 h-px bg-gray-800 min-w-[20px]" />
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold" style={{ color: m.streak > 0 ? ACCENT.emerald : '#6b7280' }}>
            {m.streak > 0 ? `🔥 ${m.streak}-week streak` : 'No active streak'}
          </span>
          <span className="text-[11px] uppercase tracking-wider text-gray-600">{m.totalThisYear} session{m.totalThisYear === 1 ? '' : 's'}</span>
        </div>
        {m.totalThisYear === 0 ? (
          <EmptyRow>No sessions logged this year yet — your training calendar fills in as you log.</EmptyRow>
        ) : (
          <div className="overflow-x-auto pb-1">
            <Heatmap columns={m.columns} />
            <div className="flex items-center gap-1.5 mt-3 text-[10px] text-gray-600">
              <span>Less</span>
              {[0, 1, 2, 3].map(c => <span key={c} className="w-2.5 h-2.5 rounded-[2px]" style={{ background: heatColor(c) }} />)}
              <span>More</span>
            </div>
          </div>
        )}
      </div>

      {/* 3 ── Making Gains ─────────────────────────────────────────── */}
      <div>
        <SectionLabel>Making Gains</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* New PRs this month */}
          <Panel title="New PRs this month" badge={m.newPRs.length || null}>
            {m.newPRs.length === 0 ? (
              <EmptyRow>No PRs yet this month. Beat a top set — heavier, or more reps at the same weight — to bank one.</EmptyRow>
            ) : (
              <div className="space-y-2 max-h-[224px] overflow-y-auto">
                {m.newPRs.map((pr, i) => {
                  // Both PR and NEW LIFT rows use emerald; the distinction is the badge text only.
                  const tone = ACCENT.emerald
                  const repGain = pr.isNew ? 0 : pr.reps - pr.prevReps
                  const delta = pr.isNew ? null
                    : pr.weight > pr.prevWeight
                      ? `+${fmtTop(pr.weight - pr.prevWeight)}kg`
                      : `+${repGain} rep${repGain === 1 ? '' : 's'}`
                  return (
                    <div key={`${pr.id}-${pr.date}-${i}`} className="flex items-center gap-3 bg-gray-800/50 rounded-lg px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-white truncate">{pr.name}</div>
                        <div className="text-[11px] text-gray-500">
                          {fmtShort(pr.date)}
                          {delta && <span className="font-semibold" style={{ color: ACCENT.emerald }}> · {delta}</span>}
                        </div>
                      </div>
                      <div className="text-right flex-none">
                        <div className="text-sm font-bold" style={{ color: tone }}>{fmtTop(pr.weight)}kg × {pr.reps}</div>
                        <div className="text-[10px] tracking-wider uppercase font-semibold" style={{ color: tone }}>
                          {pr.isNew ? 'New lift' : 'PR'}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>

          {/* Fastest progressing */}
          <Panel title="Fastest progressing" badge={m.fastest.length || null}>
            {m.fastest.length === 0 ? (
              <EmptyRow>Not enough recent data. Log a lift a few times over 3–4 weeks to see its trend.</EmptyRow>
            ) : (
              <div className="space-y-2">
                {m.fastest.map(f => (
                  <div key={f.id} className="flex items-center gap-3 bg-gray-800/50 rounded-lg px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white truncate">{f.name}</div>
                      <div className="text-[11px] font-semibold" style={{ color: ACCENT.emerald }}>+{fmtTop(f.change)}kg over {spanLabel(f.spanDays)} · top set</div>
                    </div>
                    <div className="w-[64px] h-7 flex-none"><MiniSpark values={f.spark} color={ACCENT.teal} /></div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Bodyweight Ratios — intentionally left as a gap for this build */}
          <div className="hidden lg:flex flex-col items-center justify-center bg-gray-900/40 border border-dashed border-gray-800 rounded-lg p-4 text-center">
            <div className="text-xs tracking-widest uppercase text-gray-600 font-semibold">Bodyweight Ratios</div>
            <div className="text-[11px] text-gray-700 mt-1.5">Coming in a later build</div>
          </div>
        </div>
      </div>

      {/* 4 ── Needs Attention ──────────────────────────────────────── */}
      <div>
        <SectionLabel>Needs Attention</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Stalled lifts */}
          <Panel title="Stalled lifts" badge={m.stalled.length || null} badgeColor={ACCENT.amber}>
            {m.stalled.length === 0 ? (
              <EmptyRow>Nothing stalled — every tracked lift is moving or freshly trained.</EmptyRow>
            ) : (
              <div className="space-y-2 max-h-[224px] overflow-y-auto">
                {m.stalled.map(l => (
                  <div key={l.id} className="flex items-center gap-3 bg-gray-800/50 rounded-lg px-3 py-2.5">
                    <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: ACCENT.amber }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white truncate">{l.name}</div>
                      <div className="text-[11px] text-gray-500 uppercase tracking-wider">{l.muscle}</div>
                    </div>
                    <div className="text-right flex-none">
                      <div className="text-sm font-bold text-white">{fmtTop(l.top)}kg</div>
                      <div className="text-[11px] text-gray-600">{l.daysAgo}d ago</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Volume gaps */}
          <Panel title="Volume gaps" badge={m.weekTotalSets > 0 ? (m.gaps.length || null) : null} badgeColor={ACCENT.red}>
            {m.weekTotalSets === 0 ? (
              <EmptyRow>No sets logged this week yet — volume by muscle group appears once you train.</EmptyRow>
            ) : m.gaps.length === 0 ? (
              <EmptyRow>Every muscle group is on target for hard sets this week. Nice work.</EmptyRow>
            ) : (
              <div className="space-y-2.5">
                {m.gaps.map(g => (
                  <div key={g.muscle} className="flex items-center gap-3">
                    <span className="text-xs tracking-wider uppercase text-gray-400 w-20 flex-none">{g.muscle}</span>
                    <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${g.pct}%`, background: g.color }} />
                    </div>
                    <span className="text-[11px] text-gray-500 w-16 text-right flex-none">{g.sets} / {g.range}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* 5 ── Right Now ────────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-5">
          <div className="flex-1 min-w-0">
            <p className="text-xs tracking-widest uppercase text-gray-500 mb-3">Right now</p>
            {m.nextSession ? (
              <>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-lg font-bold text-white">{m.nextSession.name}</span>
                  <span className="text-xs text-gray-500">up next · {m.nextSession.count} {m.nextSession.count === 1 ? 'exercise' : 'exercises'}</span>
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  {m.lastPerf
                    ? `Last: ${m.lastName} · ${daysAgoLabel(daysBetween(m.lastPerf.performed_date, today))}`
                    : 'No sessions logged yet — this is a great place to start.'}
                </p>
              </>
            ) : (
              <>
                <span className="text-lg font-bold text-white">No programme sessions</span>
                <p className="text-xs text-gray-600 mt-2">Add sessions to your programme to start logging.</p>
              </>
            )}
          </div>
          <div className="flex-none">
            {m.nextSession ? (
              <button onClick={() => onStartSession?.(m.nextSession.id)}
                className="w-full md:w-auto px-6 py-3 bg-emerald-400 text-gray-950 text-sm font-bold tracking-widest uppercase rounded-lg hover:bg-emerald-300 transition-colors">
                Start session
              </button>
            ) : (
              <button onClick={() => onOpenSub?.('programmes')}
                className="w-full md:w-auto px-6 py-3 bg-gray-800 border border-gray-700 text-gray-300 text-sm font-bold tracking-widest uppercase rounded-lg hover:text-white hover:border-gray-600 transition-colors">
                Manage programme
              </button>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}

// ── Small building blocks ───────────────────────────────────────────
function StatBlock({ title, children }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
      <p className="text-xs tracking-widest uppercase text-gray-500 mb-3">{title}</p>
      {children}
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-xs tracking-widest uppercase text-gray-400 font-semibold">{children}</span>
      <div className="flex-1 h-px bg-gray-800" />
    </div>
  )
}

function Panel({ title, badge, badgeColor, children }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-bold text-white">{title}</span>
        {badge != null && (
          <span className="text-[10px] font-bold tracking-wider uppercase rounded px-1.5 py-0.5"
            style={{ color: badgeColor || ACCENT.emerald, border: `1px solid ${(badgeColor || ACCENT.emerald)}55` }}>
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function EmptyRow({ children }) {
  return <p className="text-xs text-gray-600 leading-relaxed py-2">{children}</p>
}

function DotRow({ done, planned }) {
  const total = Math.min(Math.max(done, planned), 10)
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className="w-2.5 h-2.5 rounded-full" style={{ background: i < done ? ACCENT.emerald : HEAT_EMPTY }} />
      ))}
    </div>
  )
}

// GitHub-style calendar: one column per week, 7 rows Mon→Sun. Month labels sit
// above the column that starts each month.
function Heatmap({ columns }) {
  const MONTH_ABBR = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  // Label the first column of each month (a month's first week is the only one
  // carrying its monthLabel; compare to the previous column so it shows once).
  const labels = columns.map((col, i) => {
    const mo = col.monthLabel
    const prev = i > 0 ? columns[i - 1].monthLabel : null
    return mo && mo !== prev ? MONTH_ABBR[Number(mo)] : ''
  })
  return (
    <div className="inline-flex flex-col gap-1">
      <div className="flex gap-[3px] h-3">
        {labels.map((label, i) => (
          <div key={i} className="w-2.5 text-[9px] text-gray-600 leading-none">{label}</div>
        ))}
      </div>
      <div className="flex gap-[3px]">
        {columns.map((col, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {col.cells.map((cell, j) => (
              <span key={j} className="w-2.5 h-2.5 rounded-[2px]"
                style={{ background: cell ? heatColor(cell.count) : 'transparent' }}
                title={cell ? `${cell.date}: ${cell.count} session${cell.count === 1 ? '' : 's'}` : ''} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// Tiny inline-SVG sparkline (no chart dependency) for the Fastest Progressing rows.
function MiniSpark({ values, color }) {
  if (!values || values.length < 2) return null
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const w = 64, h = 28, pad = 3
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2)
    const y = h - pad - ((v - min) / span) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function daysAgoLabel(d) {
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  return `${d} days ago`
}

// Span between first and last logged session in the trend window, in plain terms.
function spanLabel(days) {
  if (days < 7) return `${days} day${days === 1 ? '' : 's'}`
  const w = Math.round(days / 7)
  return `${w} week${w === 1 ? '' : 's'}`
}
