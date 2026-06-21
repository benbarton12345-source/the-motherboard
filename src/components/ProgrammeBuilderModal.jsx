import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function ProgrammeBuilderModal({ onClose }) {
  const [loading, setLoading] = useState(true)
  const [programme, setProgramme] = useState(null)
  const [sessions, setSessions] = useState([])

  // Navigation
  const [view, setView] = useState('programme') // 'programme' | 'session' | 'picker'
  const [activeSession, setActiveSession] = useState(null)

  // Session detail
  const [sessionExercises, setSessionExercises] = useState([])
  const [loadingExercises, setLoadingExercises] = useState(false)

  // Exercise picker
  const [allExercises, setAllExercises] = useState([])
  const [exerciseSearch, setExerciseSearch] = useState('')

  // Add session inline form
  const [addingSession, setAddingSession] = useState(false)
  const [newSessionName, setNewSessionName] = useState('')
  const [savingSession, setSavingSession] = useState(false)

  // Rename session
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => { init() }, [])

  async function init() {
    let { data: progs } = await supabase
      .from('programmes')
      .select('*')
      .eq('is_active', true)
      .limit(1)

    let prog = progs?.[0]
    if (!prog) {
      const { data } = await supabase
        .from('programmes')
        .insert({ name: 'My Programme', is_active: true })
        .select()
        .single()
      prog = data
    }

    setProgramme(prog)
    await fetchSessions(prog.id)

    const { data: exs } = await supabase
      .from('exercises')
      .select('id, name, muscle_group')
      .order('muscle_group')
      .order('name')
    setAllExercises(exs || [])

    setLoading(false)
  }

  async function fetchSessions(programmeId) {
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .eq('programme_id', programmeId)
      .order('sort_order')
    setSessions(data || [])
  }

  async function fetchSessionExercises(sessionId) {
    setLoadingExercises(true)
    const { data } = await supabase
      .from('session_exercises')
      .select(`
        id, sort_order,
        exercise:exercises(id, name, muscle_group),
        sets:session_sets(id, set_number, target_reps)
      `)
      .eq('session_id', sessionId)
      .order('sort_order')
    const normalized = (data || []).map(se => ({
      ...se,
      sets: [...(se.sets || [])].sort((a, b) => a.set_number - b.set_number),
    }))
    setSessionExercises(normalized)
    setLoadingExercises(false)
  }

  // ── Navigation ──────────────────────────────────────────────────

  function openSession(session) {
    setActiveSession(session)
    fetchSessionExercises(session.id)
    setView('session')
  }

  function backToProgramme() {
    setView('programme')
    setActiveSession(null)
    setSessionExercises([])
    setExerciseSearch('')
  }

  function openPicker() {
    setExerciseSearch('')
    setView('picker')
  }

  function backToSession() {
    setView('session')
    setExerciseSearch('')
  }

  // ── Sessions CRUD ────────────────────────────────────────────────

  async function addSession() {
    if (!newSessionName.trim() || savingSession) return
    setSavingSession(true)
    const { data } = await supabase
      .from('sessions')
      .insert({ programme_id: programme.id, name: newSessionName.trim(), sort_order: sessions.length })
      .select()
      .single()
    setSessions(prev => [...prev, data])
    setNewSessionName('')
    setAddingSession(false)
    setSavingSession(false)
  }

  async function deleteSession(id) {
    await supabase.from('sessions').delete().eq('id', id)
    setSessions(prev => prev.filter(s => s.id !== id))
  }

  async function saveRename(id) {
    if (!renameValue.trim()) { setRenamingId(null); return }
    await supabase.from('sessions').update({ name: renameValue.trim() }).eq('id', id)
    setSessions(prev => prev.map(s => s.id === id ? { ...s, name: renameValue.trim() } : s))
    setRenamingId(null)
  }

  async function moveSession(index, dir) {
    const target = index + dir
    if (target < 0 || target >= sessions.length) return
    const next = [...sessions]
    ;[next[index], next[target]] = [next[target], next[index]]
    const reordered = next.map((s, i) => ({ ...s, sort_order: i }))
    setSessions(reordered)
    await Promise.all(reordered.map(s =>
      supabase.from('sessions').update({ sort_order: s.sort_order }).eq('id', s.id)
    ))
  }

  // ── Session exercises CRUD ────────────────────────────────────────

  async function addExercise(exercise) {
    const { data: se } = await supabase
      .from('session_exercises')
      .insert({ session_id: activeSession.id, exercise_id: exercise.id, sort_order: sessionExercises.length })
      .select()
      .single()
    const { data: sets } = await supabase
      .from('session_sets')
      .insert([
        { session_exercise_id: se.id, set_number: 1, target_reps: null },
        { session_exercise_id: se.id, set_number: 2, target_reps: null },
      ])
      .select()
    setSessionExercises(prev => [...prev, {
      ...se,
      exercise,
      sets: (sets || []).sort((a, b) => a.set_number - b.set_number),
    }])
    backToSession()
  }

  async function removeExercise(seId) {
    await supabase.from('session_exercises').delete().eq('id', seId)
    setSessionExercises(prev => prev.filter(se => se.id !== seId))
  }

  async function moveExercise(index, dir) {
    const target = index + dir
    if (target < 0 || target >= sessionExercises.length) return
    const next = [...sessionExercises]
    ;[next[index], next[target]] = [next[target], next[index]]
    const reordered = next.map((se, i) => ({ ...se, sort_order: i }))
    setSessionExercises(reordered)
    await Promise.all(reordered.map(se =>
      supabase.from('session_exercises').update({ sort_order: se.sort_order }).eq('id', se.id)
    ))
  }

  // ── Sets CRUD ────────────────────────────────────────────────────

  async function addSet(seIndex) {
    const se = sessionExercises[seIndex]
    const nextNum = se.sets.length > 0 ? Math.max(...se.sets.map(s => s.set_number)) + 1 : 1
    const { data: newSet } = await supabase
      .from('session_sets')
      .insert({ session_exercise_id: se.id, set_number: nextNum, target_reps: null })
      .select()
      .single()
    setSessionExercises(prev => prev.map((item, i) =>
      i === seIndex ? { ...item, sets: [...item.sets, newSet] } : item
    ))
  }

  async function removeSet(seIndex, setId) {
    if (sessionExercises[seIndex].sets.length <= 1) return
    await supabase.from('session_sets').delete().eq('id', setId)
    setSessionExercises(prev => prev.map((item, i) =>
      i === seIndex ? { ...item, sets: item.sets.filter(s => s.id !== setId) } : item
    ))
  }

  function updateRepLocal(seIndex, setId, value) {
    setSessionExercises(prev => prev.map((item, i) =>
      i === seIndex
        ? { ...item, sets: item.sets.map(s => s.id === setId ? { ...s, target_reps: value } : s) }
        : item
    ))
  }

  async function saveRep(setId, value) {
    const rep = value === '' ? null : parseInt(value, 10)
    await supabase.from('session_sets')
      .update({ target_reps: value === '' || isNaN(rep) ? null : rep })
      .eq('id', setId)
  }

  // ── Picker filtering ─────────────────────────────────────────────

  const filtered = allExercises.filter(ex =>
    ex.name.toLowerCase().includes(exerciseSearch.toLowerCase()) ||
    ex.muscle_group.toLowerCase().includes(exerciseSearch.toLowerCase())
  )
  const pickerGrouped = filtered.reduce((acc, ex) => {
    if (!acc[ex.muscle_group]) acc[ex.muscle_group] = []
    acc[ex.muscle_group].push(ex)
    return acc
  }, {})
  const pickerGroups = Object.keys(pickerGrouped).sort()
  const inSessionIds = new Set(sessionExercises.map(se => se.exercise.id))

  // ── Header title ─────────────────────────────────────────────────

  const title = view === 'programme' ? 'Programme Builder'
    : view === 'session' ? activeSession?.name ?? ''
    : 'Add Exercise'

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-2xl bg-gray-900 border border-gray-800 rounded-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {view !== 'programme' && (
              <button
                onClick={view === 'session' ? backToProgramme : backToSession}
                className="text-gray-500 hover:text-white transition-colors shrink-0"
              >
                ←
              </button>
            )}
            <h2 className="text-sm tracking-widest uppercase text-gray-400 truncate">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-white transition-colors text-xl leading-none shrink-0 ml-3"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-5 flex-1">
          {loading ? (
            <p className="text-xs text-gray-600">Loading…</p>

          ) : view === 'programme' ? (
            // ── Programme view ─────────────────────────────────────
            <div>
              {sessions.length === 0 && !addingSession && (
                <p className="text-xs text-gray-600 mb-4">No sessions yet. Add your first one below.</p>
              )}

              <div className="space-y-1">
                {sessions.map((session, index) => (
                  <div
                    key={session.id}
                    className="flex items-center gap-2 py-2 px-3 rounded bg-gray-800/50 group"
                  >
                    {renamingId === session.id ? (
                      <input
                        type="text"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveRename(session.id)
                          if (e.key === 'Escape') setRenamingId(null)
                        }}
                        onBlur={() => saveRename(session.id)}
                        autoFocus
                        className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-emerald-400"
                      />
                    ) : (
                      <button
                        onClick={() => openSession(session)}
                        className="flex-1 text-left text-sm text-white hover:text-emerald-400 transition-colors truncate"
                      >
                        {session.name}
                      </button>
                    )}

                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {renamingId !== session.id && (
                        <button
                          onClick={() => { setRenamingId(session.id); setRenameValue(session.name) }}
                          className="text-xs tracking-widest uppercase text-gray-400 hover:text-emerald-400 transition-colors"
                        >
                          Rename
                        </button>
                      )}
                      <button
                        onClick={() => moveSession(index, -1)}
                        disabled={index === 0}
                        className="text-gray-500 hover:text-white transition-colors disabled:opacity-25 text-sm w-4"
                      >↑</button>
                      <button
                        onClick={() => moveSession(index, 1)}
                        disabled={index === sessions.length - 1}
                        className="text-gray-500 hover:text-white transition-colors disabled:opacity-25 text-sm w-4"
                      >↓</button>
                      <button
                        onClick={() => deleteSession(session.id)}
                        className="text-xs tracking-widest uppercase text-gray-400 hover:text-red-400 transition-colors"
                      >
                        Del
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {addingSession && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="text"
                    value={newSessionName}
                    onChange={e => setNewSessionName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') addSession()
                      if (e.key === 'Escape') { setAddingSession(false); setNewSessionName('') }
                    }}
                    placeholder="e.g. Upper 1"
                    autoFocus
                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-400"
                  />
                  <button
                    onClick={addSession}
                    disabled={savingSession || !newSessionName.trim()}
                    className="px-3 py-2 bg-emerald-400 text-gray-950 text-xs font-bold tracking-widest uppercase rounded hover:bg-emerald-300 transition-colors disabled:opacity-50"
                  >
                    {savingSession ? '…' : 'Add'}
                  </button>
                  <button
                    onClick={() => { setAddingSession(false); setNewSessionName('') }}
                    className="text-xs text-gray-500 hover:text-white tracking-widest uppercase transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

          ) : view === 'session' ? (
            // ── Session view ───────────────────────────────────────
            loadingExercises ? (
              <p className="text-xs text-gray-600">Loading…</p>
            ) : sessionExercises.length === 0 ? (
              <p className="text-xs text-gray-600">No exercises yet. Use the button below to add one.</p>
            ) : (
              <div className="space-y-2">
                {sessionExercises.map((se, seIndex) => (
                  <div key={se.id} className="bg-gray-800/50 rounded p-3 space-y-2">
                    {/* Line 1: name + reorder/remove */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm text-white truncate">{se.exercise.name}</span>
                        <span className="text-xs text-gray-500 uppercase tracking-wider shrink-0">
                          {se.exercise.muscle_group}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => moveExercise(seIndex, -1)}
                          disabled={seIndex === 0}
                          className="text-gray-500 hover:text-white transition-colors disabled:opacity-25 text-sm w-5 text-center"
                        >↑</button>
                        <button
                          onClick={() => moveExercise(seIndex, 1)}
                          disabled={seIndex === sessionExercises.length - 1}
                          className="text-gray-500 hover:text-white transition-colors disabled:opacity-25 text-sm w-5 text-center"
                        >↓</button>
                        <button
                          onClick={() => removeExercise(se.id)}
                          className="text-gray-500 hover:text-red-400 transition-colors text-base w-5 text-center"
                        >×</button>
                      </div>
                    </div>

                    {/* Line 2: sets */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {se.sets.map(set => (
                        <div key={set.id} className="flex items-center gap-1">
                          <span className="text-xs text-gray-500">S{set.set_number}</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={set.target_reps ?? ''}
                            onChange={e => updateRepLocal(seIndex, set.id, e.target.value)}
                            onBlur={e => saveRep(set.id, e.target.value)}
                            placeholder="—"
                            className="w-11 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white text-center placeholder-gray-500 focus:outline-none focus:border-emerald-400"
                          />
                          <button
                            onClick={() => removeSet(seIndex, set.id)}
                            disabled={se.sets.length <= 1}
                            className="text-gray-600 hover:text-red-400 transition-colors disabled:opacity-25 text-sm leading-none"
                          >×</button>
                        </div>
                      ))}
                      <button
                        onClick={() => addSet(seIndex)}
                        className="text-xs text-gray-500 hover:text-emerald-400 transition-colors tracking-widest uppercase ml-1"
                      >
                        + set
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )

          ) : (
            // ── Exercise picker ────────────────────────────────────
            <div className="space-y-4">
              <input
                type="text"
                value={exerciseSearch}
                onChange={e => setExerciseSearch(e.target.value)}
                placeholder="Search exercises…"
                autoFocus
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-400"
              />
              {pickerGroups.length === 0 ? (
                <p className="text-xs text-gray-600">No exercises match.</p>
              ) : (
                <div className="space-y-4">
                  {pickerGroups.map(group => (
                    <div key={group}>
                      <p className="text-xs tracking-widest uppercase text-gray-500 mb-2">{group}</p>
                      <div className="space-y-px">
                        {pickerGrouped[group].map(ex => {
                          const inSession = inSessionIds.has(ex.id)
                          return (
                            <button
                              key={ex.id}
                              onClick={() => addExercise(ex)}
                              className="w-full text-left py-2 px-3 rounded text-sm text-white hover:bg-gray-700 transition-colors flex items-center justify-between"
                            >
                              <span className={inSession ? 'text-gray-400' : ''}>{ex.name}</span>
                              {inSession && (
                                <span className="text-xs text-gray-600 tracking-widest uppercase shrink-0 ml-2">in session</span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 p-5 border-t border-gray-800 shrink-0">
          {view === 'programme' ? (
            <>
              {!addingSession && (
                <button
                  onClick={() => setAddingSession(true)}
                  className="px-4 py-2 bg-emerald-400 text-gray-950 text-xs font-bold tracking-widest uppercase rounded hover:bg-emerald-300 transition-colors"
                >
                  + Add Session
                </button>
              )}
              <button
                onClick={onClose}
                className="text-xs text-gray-500 hover:text-white tracking-widest uppercase transition-colors"
              >
                Close
              </button>
            </>
          ) : view === 'session' ? (
            <>
              <button
                onClick={openPicker}
                className="px-4 py-2 bg-emerald-400 text-gray-950 text-xs font-bold tracking-widest uppercase rounded hover:bg-emerald-300 transition-colors"
              >
                + Add Exercise
              </button>
              <button
                onClick={backToProgramme}
                className="text-xs text-gray-500 hover:text-white tracking-widest uppercase transition-colors"
              >
                ← Back
              </button>
            </>
          ) : (
            <button
              onClick={backToSession}
              className="text-xs text-gray-500 hover:text-white tracking-widest uppercase transition-colors"
            >
              Cancel
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
