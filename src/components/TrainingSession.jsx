import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { localDate } from '../utils/taskHelpers'

// Stable local id for in-session rows (not persisted as-is)
function uid() {
  return (crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2)}-${Date.now()}`)
}

function toInt(v) {
  if (v === '' || v == null) return null
  const n = parseInt(v, 10)
  return isNaN(n) ? null : n
}

function toNum(v) {
  if (v === '' || v == null) return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

// Placeholder trend icon — real trend data lands in step 4 (analysis)
function TrendIcon() {
  return (
    <svg viewBox="0 0 24 12" className="w-7 h-4 text-gray-600 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="1,9 7,6 13,8 23,2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const MUSCLE_GROUPS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core']

export default function TrainingSession({ session, programmeId, adHoc = false, onClose, onSaved }) {
  const sessionTitle = session?.name || 'Ad hoc session'

  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('overview') // 'overview' | 'logging' | 'swap' | 'add' | 'finish'

  const [sessionRowId, setSessionRowId] = useState(null)
  const [exercises, setExercises] = useState([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [activeSetIndex, setActiveSetIndex] = useState(0)

  // Guards concurrent lazy-creation of a performed_exercises row (exercise.uid -> Promise<id>)
  const peCreating = useRef({})

  // exercise_id -> { date, sets: [{ set_number, actual_reps, actual_weight }] }
  const [lastByExercise, setLastByExercise] = useState({})

  // Exercise picker (shared by swap + add)
  const [allExercises, setAllExercises] = useState([])
  const [pickerSearch, setPickerSearch] = useState('')

  // Create-new-exercise form (from the add picker)
  const [creating, setCreating] = useState(false)
  const [newExName, setNewExName] = useState('')
  const [newExGroup, setNewExGroup] = useState('')
  const [savingNewEx, setSavingNewEx] = useState(false)

  // Finish
  const [sessionRating, setSessionRating] = useState(null)
  const [energyRating, setEnergyRating] = useState(null)
  const [sessionNote, setSessionNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { init() }, [])

  async function init() {
    // Exercise bank — used by the swap + add pickers
    const { data: exs } = await supabase
      .from('exercises')
      .select('id, name, muscle_group')
      .order('muscle_group')
      .order('name')
    setAllExercises(exs || [])

    // Template for this session (ad-hoc sessions start empty)
    let built = []
    if (session?.id) {
      const { data } = await supabase
        .from('session_exercises')
        .select(`
          id, sort_order,
          exercise:exercises(id, name, muscle_group),
          sets:session_sets(id, set_number, target_reps)
        `)
        .eq('session_id', session.id)
        .order('sort_order')

      built = (data || []).map(se => ({
        uid: uid(),
        session_exercise_id: se.id,
        exercise: se.exercise,
        note: '',
        performedExerciseId: null,
        sets: [...(se.sets || [])]
          .sort((a, b) => a.set_number - b.set_number)
          .map(s => ({
            uid: uid(),
            set_number: s.set_number,
            target_reps: s.target_reps,
            actual_reps: '',
            actual_weight: '',
            logged: false,
            performedSetId: null,
          })),
      }))
    }
    setExercises(built)

    // Create the performed_sessions row up front so logging persists immediately.
    // session_id is null for ad-hoc sessions. Ratings/note stay null until Finish.
    const { data: ps } = await supabase
      .from('performed_sessions')
      .insert({
        session_id: session?.id ?? null,
        programme_id: programmeId ?? null,
        performed_date: localDate(),
        session_rating: null,
        energy_rating: null,
        session_note: null,
      })
      .select()
      .single()
    setSessionRowId(ps?.id ?? null)

    if (built.length) await loadLastPerformed(built.map(e => e.exercise.id))

    setLoading(false)
  }

  // Most recent performed sets per exercise, before today, for the reference line
  async function loadLastPerformed(exerciseIds) {
    if (!exerciseIds.length) return
    const today = localDate()
    const { data } = await supabase
      .from('performed_exercises')
      .select(`
        exercise_id,
        performed_sessions!inner(performed_date),
        performed_sets(set_number, actual_reps, actual_weight)
      `)
      .in('exercise_id', exerciseIds)

    const map = {}
    for (const row of data || []) {
      const date = row.performed_sessions?.performed_date
      if (!date || date >= today) continue
      // Only count completed sets — both weight and reps populated — so a
      // half-logged abandoned session never surfaces as the "last time" reference.
      const completed = (row.performed_sets || [])
        .filter(s => s.actual_reps != null && s.actual_weight != null)
        .sort((a, b) => a.set_number - b.set_number)
      if (completed.length === 0) continue
      const existing = map[row.exercise_id]
      if (!existing || date > existing.date) {
        map[row.exercise_id] = { date, sets: completed }
      }
    }
    setLastByExercise(prev => ({ ...prev, ...map }))
  }

  // ── Navigation ──────────────────────────────────────────────────

  function openExercise(index) {
    setActiveIndex(index)
    const firstUnlogged = exercises[index].sets.findIndex(s => !s.logged)
    setActiveSetIndex(firstUnlogged === -1 ? 0 : firstUnlogged)
    setView('logging')
  }

  function backToOverview() {
    setView('overview')
  }

  async function attemptClose() {
    const anyPersisted = exercises.some(e => e.sets.some(s => s.performedSetId))
    if (!anyPersisted) {
      // Nothing was logged — remove the empty session row so abandoned opens don't pile up.
      if (sessionRowId) await supabase.from('performed_sessions').delete().eq('id', sessionRowId)
      onClose()
      return
    }
    if (!window.confirm('Leave without finishing? Your logged sets are saved, but the session won’t be rated.')) return
    await cleanupEmptyExercises()
    onClose()
  }

  // Removes performed_exercises rows that ended up with no logged sets (e.g. note-only
  // strays or an exercise whose sets were all removed). Keeps the data tidy.
  async function cleanupEmptyExercises() {
    const stale = exercises.filter(e => e.performedExerciseId && !e.sets.some(s => s.performedSetId))
    for (const e of stale) {
      await supabase.from('performed_exercises').delete().eq('id', e.performedExerciseId)
    }
  }

  // Lazily creates the performed_exercises row for an exercise on first persist need.
  // Guarded so rapid taps can't create duplicate rows.
  async function ensurePerformedExercise(exIndex) {
    const ex = exercises[exIndex]
    if (ex.performedExerciseId) return ex.performedExerciseId
    if (peCreating.current[ex.uid]) return peCreating.current[ex.uid]
    const promise = supabase
      .from('performed_exercises')
      .insert({
        performed_session_id: sessionRowId,
        exercise_id: ex.exercise.id,
        sort_order: exIndex,
        exercise_note: ex.note.trim() || null,
      })
      .select()
      .single()
      .then(({ data }) => {
        const id = data?.id ?? null
        if (id) setExercises(prev => prev.map((e, i) => i === exIndex ? { ...e, performedExerciseId: id } : e))
        delete peCreating.current[ex.uid]
        return id
      })
    peCreating.current[ex.uid] = promise
    return promise
  }

  // ── Set editing ──────────────────────────────────────────────────

  function updateSet(exIndex, setIndex, patch) {
    setExercises(prev => prev.map((e, i) =>
      i !== exIndex ? e : {
        ...e,
        sets: e.sets.map((s, j) => j === setIndex ? { ...s, ...patch } : s),
      }
    ))
  }

  function bumpReps(exIndex, setIndex, delta) {
    const cur = toInt(exercises[exIndex].sets[setIndex].actual_reps) ?? 0
    const next = Math.max(0, cur + delta)
    updateSet(exIndex, setIndex, { actual_reps: String(next) })
  }

  function bumpWeight(exIndex, setIndex, delta) {
    const cur = toNum(exercises[exIndex].sets[setIndex].actual_weight) ?? 0
    const next = Math.max(0, Math.round((cur + delta) * 100) / 100)
    updateSet(exIndex, setIndex, { actual_weight: String(next) })
  }

  async function logSet(exIndex, setIndex) {
    updateSet(exIndex, setIndex, { logged: true })

    // Persist immediately — insert the first time, update on subsequent edits.
    const peId = await ensurePerformedExercise(exIndex)
    if (peId) {
      const s = exercises[exIndex].sets[setIndex]
      const payload = {
        performed_exercise_id: peId,
        set_number: s.set_number,
        target_reps: s.target_reps,
        actual_reps: toInt(s.actual_reps),
        actual_weight: toNum(s.actual_weight),
      }
      if (s.performedSetId) {
        await supabase.from('performed_sets').update(payload).eq('id', s.performedSetId)
      } else {
        const { data } = await supabase.from('performed_sets').insert(payload).select().single()
        if (data?.id) updateSet(exIndex, setIndex, { performedSetId: data.id })
      }
    }

    const ex = exercises[exIndex]
    // Next unlogged set in this exercise (skipping the one we just logged)
    const nextSet = ex.sets.findIndex((s, j) => j !== setIndex && !s.logged)
    if (nextSet !== -1) {
      setActiveSetIndex(nextSet)
      return
    }
    // Exercise complete → jump to next exercise with unlogged sets, else overview
    const nextEx = exercises.findIndex((e, i) =>
      i !== exIndex && e.sets.some(s => !s.logged)
    )
    if (nextEx !== -1) {
      openExercise(nextEx)
    } else {
      backToOverview()
    }
  }

  function addSet(exIndex) {
    setExercises(prev => prev.map((e, i) => {
      if (i !== exIndex) return e
      const nextNum = e.sets.length ? Math.max(...e.sets.map(s => s.set_number)) + 1 : 1
      const lastTarget = e.sets.length ? e.sets[e.sets.length - 1].target_reps : null
      return {
        ...e,
        sets: [...e.sets, {
          uid: uid(),
          set_number: nextNum,
          target_reps: lastTarget,
          actual_reps: '',
          actual_weight: '',
          logged: false,
          performedSetId: null,
        }],
      }
    }))
  }

  async function removeSet(exIndex, setIndex) {
    const ex = exercises[exIndex]
    if (ex.sets.length <= 1) return
    const s = ex.sets[setIndex]
    if (s.performedSetId) await supabase.from('performed_sets').delete().eq('id', s.performedSetId)
    setExercises(prev => prev.map((e, i) =>
      i === exIndex ? { ...e, sets: e.sets.filter((_, j) => j !== setIndex) } : e
    ))
  }

  function updateNote(exIndex, value) {
    setExercises(prev => prev.map((e, i) => i === exIndex ? { ...e, note: value } : e))
  }

  // Persist the per-exercise note on blur (creates the exercise row if needed).
  async function persistNote(exIndex) {
    const ex = exercises[exIndex]
    const trimmed = ex.note.trim()
    if (!ex.performedExerciseId && !trimmed) return
    const peId = await ensurePerformedExercise(exIndex)
    if (peId) await supabase.from('performed_exercises').update({ exercise_note: trimmed || null }).eq('id', peId)
  }

  // ── Add exercise (ad-hoc / on the fly) ───────────────────────────

  function openAdd() {
    setPickerSearch('')
    setCreating(false)
    setNewExName('')
    setNewExGroup('')
    setView('add')
  }

  function buildExercise(exercise) {
    return {
      uid: uid(),
      session_exercise_id: null,
      exercise,
      note: '',
      performedExerciseId: null,
      sets: [{ uid: uid(), set_number: 1, target_reps: null, actual_reps: '', actual_weight: '', logged: false, performedSetId: null }],
    }
  }

  async function addExerciseToSession(exercise) {
    const newIndex = exercises.length // appended item's index (current count)
    setExercises(prev => [...prev, buildExercise(exercise)])
    if (!lastByExercise[exercise.id]) await loadLastPerformed([exercise.id])
    setActiveIndex(newIndex)
    setActiveSetIndex(0)
    setView('logging')
  }

  async function createExercise() {
    const name = newExName.trim()
    if (!name || savingNewEx) return
    setSavingNewEx(true)
    const { data, error } = await supabase
      .from('exercises')
      .insert({ name, muscle_group: newExGroup.trim() || 'Other' })
      .select()
      .single()
    setSavingNewEx(false)
    if (error || !data) { alert('Could not create the exercise.'); return }
    setAllExercises(prev => [...prev, data].sort(
      (a, b) => (a.muscle_group || '').localeCompare(b.muscle_group || '') || a.name.localeCompare(b.name)
    ))
    await addExerciseToSession(data)
  }

  // ── Swap ─────────────────────────────────────────────────────────

  function openSwap() {
    setPickerSearch('')
    setView('swap')
  }

  async function swapExercise(newExercise) {
    const ex = exercises[activeIndex]
    // Drop the old persisted exercise row (cascade clears its sets) — the swapped-in
    // exercise starts fresh and creates its own row on first log.
    if (ex.performedExerciseId) {
      await supabase.from('performed_exercises').delete().eq('id', ex.performedExerciseId)
      delete peCreating.current[ex.uid]
    }
    setExercises(prev => prev.map((e, i) =>
      i !== activeIndex ? e : {
        ...e,
        exercise: newExercise,
        note: '',
        performedExerciseId: null,
        sets: e.sets.map(s => ({ ...s, actual_reps: '', actual_weight: '', logged: false, performedSetId: null })),
      }
    ))
    if (!lastByExercise[newExercise.id]) await loadLastPerformed([newExercise.id])
    setActiveSetIndex(0)
    setView('logging')
  }

  // ── Save ─────────────────────────────────────────────────────────

  async function saveSession() {
    if (saving) return
    setSaving(true)

    // Sets, notes and swaps are already persisted as-you-go — Finish just stamps the
    // ratings and note onto the existing session row, then tidies any empty exercises.
    if (sessionRowId) {
      const { error } = await supabase
        .from('performed_sessions')
        .update({
          session_rating: sessionRating,
          energy_rating: energyRating,
          session_note: sessionNote.trim() || null,
        })
        .eq('id', sessionRowId)
      if (error) {
        setSaving(false)
        alert('Could not save the session ratings. Please try again.')
        return
      }
    }

    await cleanupEmptyExercises()

    setSaving(false)
    onSaved?.()
    onClose()
  }

  // ── Derived ──────────────────────────────────────────────────────

  const pickerFiltered = allExercises.filter(ex =>
    ex.name.toLowerCase().includes(pickerSearch.toLowerCase()) ||
    (ex.muscle_group || '').toLowerCase().includes(pickerSearch.toLowerCase())
  )
  const pickerGrouped = pickerFiltered.reduce((acc, ex) => {
    (acc[ex.muscle_group || 'Other'] ??= []).push(ex)
    return acc
  }, {})
  const pickerGroups = Object.keys(pickerGrouped).sort()
  const muscleOptions = Array.from(new Set([...MUSCLE_GROUPS, ...allExercises.map(e => e.muscle_group).filter(Boolean)]))

  const loggedCount = exercises.filter(e => e.sets.length && e.sets.every(s => s.logged)).length

  // ── Render ───────────────────────────────────────────────────────

  const header = (title, onBack) => (
    <div className="flex items-center justify-between p-4 border-b border-gray-800 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        {onBack && (
          <button onClick={onBack} className="text-gray-500 hover:text-white transition-colors shrink-0 text-lg">←</button>
        )}
        <h2 className="text-sm tracking-widest uppercase text-gray-400 truncate">{title}</h2>
      </div>
      <button onClick={attemptClose} className="text-gray-600 hover:text-white transition-colors text-xl leading-none shrink-0 ml-3">&times;</button>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col">
      {loading ? (
        <>
          {header(sessionTitle, null)}
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-gray-600">Loading…</p>
          </div>
        </>
      ) : view === 'overview' ? (
        // ── Session overview ───────────────────────────────────────
        <>
          {header(sessionTitle, null)}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            <p className="text-xs text-gray-500 mb-1">
              {loggedCount} of {exercises.length} {exercises.length === 1 ? 'exercise' : 'exercises'} done
            </p>
            {exercises.length === 0 ? (
              <p className="text-xs text-gray-600">
                {adHoc ? 'No exercises yet. Add your first one below.' : 'This session has no exercises. Add some in Manage programme.'}
              </p>
            ) : exercises.map((ex, i) => {
              const done = ex.sets.length && ex.sets.every(s => s.logged)
              const setsLabel = ex.sets
                .map(s => s.target_reps != null ? s.target_reps : '—')
                .join(' · ')
              return (
                <button
                  key={ex.uid}
                  onClick={() => openExercise(i)}
                  className={`w-full text-left bg-gray-900 border rounded-lg p-4 transition-colors ${done ? 'border-emerald-400/40' : 'border-gray-800 hover:border-gray-600'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white truncate">{ex.exercise.name}</span>
                        {done && <span className="text-emerald-400 text-xs shrink-0">✓</span>}
                      </div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider mt-0.5">{ex.exercise.muscle_group}</p>
                    </div>
                    <TrendIcon />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {ex.sets.length} {ex.sets.length === 1 ? 'set' : 'sets'} · target reps {setsLabel}
                  </p>
                </button>
              )
            })}
            <button
              onClick={openAdd}
              className="w-full py-3 border border-dashed border-gray-700 rounded-lg text-xs tracking-widest uppercase text-gray-500 hover:text-emerald-400 hover:border-gray-600 transition-colors"
            >
              + Add exercise
            </button>
          </div>
          <div className="p-4 border-t border-gray-800 shrink-0">
            <button
              onClick={() => setView('finish')}
              className="w-full py-3 bg-emerald-400 text-gray-950 text-sm font-bold tracking-widest uppercase rounded-lg hover:bg-emerald-300 transition-colors"
            >
              Finish session
            </button>
          </div>
        </>
      ) : view === 'logging' ? (
        // ── Set logging ────────────────────────────────────────────
        (() => {
          const ex = exercises[activeIndex]
          const last = lastByExercise[ex.exercise.id]
          return (
            <>
              {header(ex.exercise.name, backToOverview)}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">

                {/* Exercise meta + swap */}
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">{ex.exercise.muscle_group}</p>
                  <button
                    onClick={openSwap}
                    className="text-xs tracking-widest uppercase text-gray-400 hover:text-emerald-400 transition-colors"
                  >
                    Swap exercise
                  </button>
                </div>

                {last && (
                  <p className="text-xs text-gray-500">
                    Last session ({last.date}): {last.sets.map(s =>
                      `${s.actual_weight ?? '—'}kg × ${s.actual_reps ?? '—'}`
                    ).join(', ')}
                  </p>
                )}

                {/* Sets */}
                <div className="space-y-3">
                  {ex.sets.map((s, j) => {
                    const lastSet = last?.sets.find(x => x.set_number === s.set_number)
                    const isActive = j === activeSetIndex
                    return (
                      <div
                        key={s.uid}
                        onClick={() => setActiveSetIndex(j)}
                        className={`bg-gray-900 border rounded-lg p-4 transition-colors ${isActive ? 'border-emerald-400' : s.logged ? 'border-emerald-400/30' : 'border-gray-800'}`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-white font-bold">Set {s.set_number}</span>
                            {s.logged && <span className="text-emerald-400 text-xs">✓</span>}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-500">
                              target {s.target_reps != null ? s.target_reps : '—'}
                              {lastSet && ` · last ${lastSet.actual_weight ?? '—'}kg × ${lastSet.actual_reps ?? '—'}`}
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); removeSet(activeIndex, j) }}
                              disabled={ex.sets.length <= 1}
                              className="text-gray-600 hover:text-red-400 transition-colors disabled:opacity-25 text-base leading-none"
                            >×</button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          {/* Weight */}
                          <div>
                            <p className="text-xs tracking-widest uppercase text-gray-500 mb-1">Weight (kg)</p>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); bumpWeight(activeIndex, j, -2.5) }}
                                className="w-9 h-10 bg-gray-800 border border-gray-700 rounded text-gray-400 hover:text-white text-lg leading-none shrink-0"
                              >−</button>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={s.actual_weight}
                                onChange={e => updateSet(activeIndex, j, { actual_weight: e.target.value })}
                                onClick={e => e.stopPropagation()}
                                placeholder={lastSet?.actual_weight != null ? String(lastSet.actual_weight) : '—'}
                                className="w-full min-w-0 h-10 bg-gray-800 border border-gray-700 rounded text-center text-white text-base placeholder-gray-600 focus:outline-none focus:border-emerald-400"
                              />
                              <button
                                onClick={(e) => { e.stopPropagation(); bumpWeight(activeIndex, j, 2.5) }}
                                className="w-9 h-10 bg-gray-800 border border-gray-700 rounded text-gray-400 hover:text-white text-lg leading-none shrink-0"
                              >+</button>
                            </div>
                          </div>
                          {/* Reps */}
                          <div>
                            <p className="text-xs tracking-widest uppercase text-gray-500 mb-1">Reps</p>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); bumpReps(activeIndex, j, -1) }}
                                className="w-9 h-10 bg-gray-800 border border-gray-700 rounded text-gray-400 hover:text-white text-lg leading-none shrink-0"
                              >−</button>
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={s.actual_reps}
                                onChange={e => updateSet(activeIndex, j, { actual_reps: e.target.value })}
                                onClick={e => e.stopPropagation()}
                                placeholder={s.target_reps != null ? String(s.target_reps) : '—'}
                                className="w-full min-w-0 h-10 bg-gray-800 border border-gray-700 rounded text-center text-white text-base placeholder-gray-600 focus:outline-none focus:border-emerald-400"
                              />
                              <button
                                onClick={(e) => { e.stopPropagation(); bumpReps(activeIndex, j, 1) }}
                                className="w-9 h-10 bg-gray-800 border border-gray-700 rounded text-gray-400 hover:text-white text-lg leading-none shrink-0"
                              >+</button>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={(e) => { e.stopPropagation(); logSet(activeIndex, j) }}
                          className={`w-full mt-3 py-2.5 text-xs font-bold tracking-widest uppercase rounded transition-colors ${s.logged ? 'bg-gray-800 text-gray-400 hover:text-white' : 'bg-emerald-400 text-gray-950 hover:bg-emerald-300'}`}
                        >
                          {s.logged ? 'Logged · update' : 'Log set'}
                        </button>
                      </div>
                    )
                  })}

                  <button
                    onClick={() => addSet(activeIndex)}
                    className="w-full py-2.5 border border-dashed border-gray-700 rounded-lg text-xs tracking-widest uppercase text-gray-500 hover:text-emerald-400 hover:border-gray-600 transition-colors"
                  >
                    + Add set
                  </button>
                </div>

                {/* Per-exercise note */}
                <div>
                  <p className="text-xs tracking-widest uppercase text-gray-500 mb-1">Note (optional)</p>
                  <textarea
                    value={ex.note}
                    onChange={e => updateNote(activeIndex, e.target.value)}
                    onBlur={() => persistNote(activeIndex)}
                    rows={2}
                    placeholder="e.g. felt a tweak on the last set"
                    className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-400 resize-none"
                  />
                </div>
              </div>

              <div className="p-4 border-t border-gray-800 shrink-0">
                <button
                  onClick={backToOverview}
                  className="w-full py-3 bg-gray-900 border border-gray-800 rounded-lg text-sm tracking-widest uppercase text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
                >
                  Back to overview
                </button>
              </div>
            </>
          )
        })()
      ) : view === 'swap' ? (
        // ── Swap picker ────────────────────────────────────────────
        <>
          {header('Swap exercise', () => setView('logging'))}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <p className="text-xs text-gray-500">
              Swaps apply to this session only — your programme template is unchanged.
            </p>
            <input
              type="text"
              value={pickerSearch}
              onChange={e => setPickerSearch(e.target.value)}
              placeholder="Search exercises…"
              autoFocus
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-400"
            />
            {pickerGroups.length === 0 ? (
              <p className="text-xs text-gray-600">No exercises match.</p>
            ) : pickerGroups.map(group => (
              <div key={group}>
                <p className="text-xs tracking-widest uppercase text-gray-500 mb-2">{group}</p>
                <div className="space-y-px">
                  {pickerGrouped[group].map(ex => (
                    <button
                      key={ex.id}
                      onClick={() => swapExercise(ex)}
                      className="w-full text-left py-3 px-3 rounded text-sm text-white hover:bg-gray-800 transition-colors"
                    >
                      {ex.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : view === 'add' ? (
        // ── Add-exercise picker (search library + create new) ──────
        <>
          {header('Add exercise', backToOverview)}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <input
              type="text"
              value={pickerSearch}
              onChange={e => setPickerSearch(e.target.value)}
              placeholder="Search exercises…"
              autoFocus
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-400"
            />

            {/* Create new exercise */}
            {creating ? (
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 space-y-2">
                <p className="text-xs tracking-widest uppercase text-gray-500">New exercise</p>
                <input
                  type="text"
                  value={newExName}
                  onChange={e => setNewExName(e.target.value)}
                  placeholder="Exercise name"
                  autoFocus
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-400"
                />
                <input
                  type="text"
                  list="adhoc-muscle-groups"
                  value={newExGroup}
                  onChange={e => setNewExGroup(e.target.value)}
                  placeholder="Muscle group"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-400"
                />
                <datalist id="adhoc-muscle-groups">
                  {muscleOptions.map(g => <option key={g} value={g} />)}
                </datalist>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={createExercise}
                    disabled={!newExName.trim() || savingNewEx}
                    className="px-3 py-2 bg-emerald-400 text-gray-950 text-xs font-bold tracking-widest uppercase rounded hover:bg-emerald-300 transition-colors disabled:opacity-50"
                  >
                    {savingNewEx ? 'Saving…' : 'Create & add'}
                  </button>
                  <button onClick={() => setCreating(false)} className="text-xs text-gray-500 hover:text-white tracking-widest uppercase transition-colors">Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setCreating(true); setNewExName(pickerSearch.trim()); setNewExGroup('') }}
                className="w-full py-2.5 border border-dashed border-gray-700 rounded-lg text-xs tracking-widest uppercase text-gray-500 hover:text-emerald-400 hover:border-gray-600 transition-colors"
              >
                + New exercise (add to library)
              </button>
            )}

            {pickerGroups.length === 0 ? (
              <p className="text-xs text-gray-600">No exercises match. Use “New exercise” to add one.</p>
            ) : pickerGroups.map(group => (
              <div key={group}>
                <p className="text-xs tracking-widest uppercase text-gray-500 mb-2">{group}</p>
                <div className="space-y-px">
                  {pickerGrouped[group].map(ex => (
                    <button
                      key={ex.id}
                      onClick={() => addExerciseToSession(ex)}
                      className="w-full text-left py-3 px-3 rounded text-sm text-white hover:bg-gray-800 transition-colors"
                    >
                      {ex.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        // ── Finish ─────────────────────────────────────────────────
        <>
          {header('Finish session', backToOverview)}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <p className="text-xs text-gray-500">
              {loggedCount} of {exercises.length} {exercises.length === 1 ? 'exercise' : 'exercises'} logged.
            </p>

            <RatingRow label="Session rating" value={sessionRating} onChange={setSessionRating} />
            <RatingRow label="Energy" value={energyRating} onChange={setEnergyRating} />

            <div>
              <p className="text-xs tracking-widest uppercase text-gray-500 mb-2">Session notes (optional)</p>
              <textarea
                value={sessionNote}
                onChange={e => setSessionNote(e.target.value)}
                rows={4}
                placeholder="How did the whole session feel?"
                className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-400 resize-none"
              />
            </div>
          </div>
          <div className="p-4 border-t border-gray-800 shrink-0">
            <button
              onClick={saveSession}
              disabled={saving}
              className="w-full py-3 bg-emerald-400 text-gray-950 text-sm font-bold tracking-widest uppercase rounded-lg hover:bg-emerald-300 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save session'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function RatingRow({ label, value, onChange }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs tracking-widest uppercase text-gray-500">{label}</p>
        <span className="text-sm text-white font-bold">{value != null ? `${value}/10` : '—'}</span>
      </div>
      <div className="grid grid-cols-10 gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
          <button
            key={n}
            onClick={() => onChange(value === n ? null : n)}
            className={`h-9 rounded text-xs font-bold transition-colors ${value != null && n <= value ? 'bg-emerald-400 text-gray-950' : 'bg-gray-800 text-gray-500 hover:text-white'}`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}
