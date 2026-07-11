import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from './supabase'
import { buildHeat, computeYear, genreView, defaultUnit, todayISO } from './utils/readingHelpers'

// Map a DB book row -> the camelCase shape the UI consumes.
function mapBook(row) {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    format: row.format,
    genre: row.genre,
    progress: row.progress ?? 0,
    unitTotal: row.unit_total,
    unitLabel: row.unit_label,
  }
}

// Shared reading-tracker state, backed by relational rows (books + reading_settings)
// plus the reading_activity log. Both the Home card and Productivity panel use this
// hook; only one is mounted at a time and every mutation persists to Supabase, so the
// two placements stay in sync across tab switches.
//
// doneCount and genreCounts are DERIVED from finished book rows — never stored.
export function useReading() {
  const [loading, setLoading] = useState(true)
  const [goal, setGoal] = useState(24)
  const [books, setBooks] = useState([])         // all book rows (DB shape)
  const [activity, setActivity] = useState({})   // 'YYYY-MM-DD' -> intensity
  const [history, setHistory] = useState([])     // in-memory undo stack of prior row snapshots
  const [readingLog, setReadingLog] = useState(null) // last "Log 10 min" action, for undo

  useEffect(() => { load() }, [])

  async function load() {
    let { data: settings } = await supabase.from('reading_settings').select('*').eq('id', 1).maybeSingle()
    if (!settings) {
      const ins = await supabase.from('reading_settings').insert({ id: 1 }).select().single()
      settings = ins.data
    }
    setGoal(settings?.goal ?? 24)

    const { data: bookRows } = await supabase.from('books').select('*')
    setBooks(bookRows || [])

    const { data: acts } = await supabase.from('reading_activity').select('activity_date, intensity')
    const map = {}
    for (const a of acts || []) map[a.activity_date] = a.intensity
    setActivity(map)

    setLoading(false)
  }

  // ── Local-row mutators ────────────────────────────────────────────
  const patchLocal = (id, patch) => setBooks(prev => prev.map(b => (b.id === id ? { ...b, ...patch } : b)))
  const removeLocal = (id) => setBooks(prev => prev.filter(b => b.id !== id))

  const updateRow = (id, patch) => supabase.from('books').update(patch).eq('id', id).then(() => {})
  const deleteRow = (id) => supabase.from('books').delete().eq('id', id).then(() => {})

  // Real reading-activity log: each event today bumps intensity by 1 (cap 4)
  const bumpActivityToday = useCallback(() => {
    const iso = todayISO()
    setActivity(prev => {
      const next = Math.min(4, (prev[iso] || 0) + 1)
      supabase.from('reading_activity')
        .upsert({ activity_date: iso, intensity: next, updated_at: new Date().toISOString() }, { onConflict: 'activity_date' })
        .then(() => {})
      return { ...prev, [iso]: next }
    })
  }, [])

  // ── Raw row views (status-partitioned) ────────────────────────────
  const currentRaw = useMemo(() => books.find(b => b.status === 'current') || null, [books])
  const queuedRaw = useMemo(
    () => books.filter(b => b.status === 'queued').sort((a, b) => (a.queue_order ?? 0) - (b.queue_order ?? 0)),
    [books],
  )
  const finishedRaw = useMemo(
    () => books.filter(b => b.status === 'finished').sort(
      (a, b) => (b.finished_at || '').localeCompare(a.finished_at || '') || (b.created_at || '').localeCompare(a.created_at || ''),
    ),
    [books],
  )

  // ── Current book ──────────────────────────────────────────────────
  function setProgress(pct) {
    if (!currentRaw) return
    const clamped = Math.max(0, Math.min(100, Math.round(pct)))
    patchLocal(currentRaw.id, { progress: clamped })
    updateRow(currentRaw.id, { progress: clamped })
    bumpActivityToday()
  }
  const bumpUp = () => setProgress((currentRaw?.progress || 0) + 5)
  const bumpDown = () => setProgress((currentRaw?.progress || 0) - 5)

  function toggleFormat() {
    if (!currentRaw) return
    const isAudio = currentRaw.format === 'audio'
    const patch = { format: isAudio ? 'book' : 'audio', unit_label: isAudio ? 'ch' : 'hr' }
    patchLocal(currentRaw.id, patch)
    updateRow(currentRaw.id, patch)
  }

  function pickGenre(g) {
    if (!currentRaw || !g) return
    patchLocal(currentRaw.id, { genre: g })
    updateRow(currentRaw.id, { genre: g })
  }

  function commitGoal(value) {
    const next = Math.max(1, Math.min(200, parseInt(value, 10) || goal))
    setGoal(next)
    supabase.from('reading_settings').update({ goal: next }).eq('id', 1).then(() => {})
  }

  // ── Finish / undo ─────────────────────────────────────────────────
  // Rows are updated, not destroyed, so undo is a true revert of row states.
  function finishCurrent() {
    if (!currentRaw) return
    const pick = queuedRaw[0] || null
    const snap = [{ ...currentRaw }, ...(pick ? [{ ...pick }] : [])] // prior states for undo

    const finishPatch = { status: 'finished', finished_at: todayISO() }
    patchLocal(currentRaw.id, finishPatch)
    updateRow(currentRaw.id, finishPatch)

    if (pick) {
      const promotePatch = { status: 'current', started_at: new Date().toISOString(), queue_order: null }
      patchLocal(pick.id, promotePatch)
      updateRow(pick.id, promotePatch)
    }

    setHistory(h => [...h, snap])
    bumpActivityToday()
  }

  function undoLast() {
    if (!history.length) return
    const h = [...history]
    const snap = h.pop()
    setHistory(h)
    for (const row of snap) {
      const patch = {
        status: row.status, finished_at: row.finished_at, started_at: row.started_at,
        queue_order: row.queue_order, progress: row.progress, genre: row.genre,
        format: row.format, unit_label: row.unit_label,
      }
      patchLocal(row.id, patch)
      updateRow(row.id, patch)
    }
  }

  function removeFinished(i) {
    const row = finishedRaw[i]
    if (!row) return
    removeLocal(row.id)
    deleteRow(row.id)
  }

  // ── Queue / reading list ──────────────────────────────────────────
  async function addToList(nb) {
    if (!nb.title.trim()) return
    const { unitTotal, unitLabel } = defaultUnit(nb.format)
    const maxOrder = queuedRaw.length ? Math.max(...queuedRaw.map(b => b.queue_order ?? 0)) : -1
    const row = {
      title: nb.title.trim(), author: nb.author.trim() || 'Unknown',
      format: nb.format, genre: nb.genre, status: 'queued', progress: 0,
      unit_total: unitTotal, unit_label: unitLabel, queue_order: maxOrder + 1,
    }
    const { data } = await supabase.from('books').insert(row).select().single()
    if (data) setBooks(prev => [...prev, data])
  }

  function removeFromList(i) {
    const row = queuedRaw[i]
    if (!row) return
    removeLocal(row.id)
    deleteRow(row.id)
  }

  // Edit a queued book's metadata (title/author/genre/format) in place.
  const updateBook = (id, patch) => { patchLocal(id, patch); updateRow(id, patch) }

  // Promote a queued book to current; demote the previous current book back to the
  // front of the queue with its progress preserved.
  function startNow(i) {
    const pick = queuedRaw[i]
    if (!pick) return
    const promotePatch = { status: 'current', started_at: new Date().toISOString(), queue_order: null }
    patchLocal(pick.id, promotePatch)
    updateRow(pick.id, promotePatch)

    if (currentRaw) {
      const remaining = queuedRaw.filter(b => b.id !== pick.id)
      const minOrder = remaining.length ? Math.min(...remaining.map(b => b.queue_order ?? 0)) : 0
      const demotePatch = { status: 'queued', queue_order: minOrder - 1, started_at: null }
      patchLocal(currentRaw.id, demotePatch)
      updateRow(currentRaw.id, demotePatch)
    }
  }

  // ── Log 10 min reading (cross-metric link: Reading → Habit) ───────
  // Bumps today's reading activity + the current book's progress, and marks the
  // "Read 10 mins" habit done for today if such a habit exists. This is the one
  // hard-wired cross-metric link (the general linked_source engine is a future
  // build). Undo (shown ~5s in the UI) reverts all three effects.
  async function logReading() {
    const iso = todayISO()
    const { data: habitRows } = await supabase.from('habits').select('id, name')
    const habit = (habitRows || []).find(h => /read/i.test(h.name) && /min/i.test(h.name)) || null

    let addedHabit = false
    if (habit) {
      const { data: existing } = await supabase.from('habit_completions')
        .select('id').eq('habit_id', habit.id).eq('completed_date', iso).maybeSingle()
      if (!existing) {
        await supabase.from('habit_completions')
          .upsert({ habit_id: habit.id, completed_date: iso }, { onConflict: 'habit_id,completed_date', ignoreDuplicates: true })
        addedHabit = true
      }
    }

    const snap = {
      iso,
      bookId: currentRaw?.id || null,
      prevProgress: currentRaw?.progress ?? null,
      prevIntensity: activity[iso] || 0,
      habitId: habit?.id || null,
      addedHabit,
    }

    if (currentRaw) setProgress((currentRaw.progress || 0) + 5) // setProgress also bumps activity
    else bumpActivityToday()

    setReadingLog(snap)
  }

  async function undoReadingLog() {
    const s = readingLog
    if (!s) return
    if (s.bookId != null && s.prevProgress != null) {
      patchLocal(s.bookId, { progress: s.prevProgress })
      updateRow(s.bookId, { progress: s.prevProgress })
    }
    setActivity(prev => ({ ...prev, [s.iso]: s.prevIntensity }))
    supabase.from('reading_activity')
      .upsert({ activity_date: s.iso, intensity: s.prevIntensity, updated_at: new Date().toISOString() }, { onConflict: 'activity_date' })
      .then(() => {})
    if (s.addedHabit && s.habitId) {
      await supabase.from('habit_completions').delete().eq('habit_id', s.habitId).eq('completed_date', s.iso)
    }
    setReadingLog(null)
  }

  // ── Derived (UI shape) ────────────────────────────────────────────
  const current = useMemo(() => (currentRaw ? mapBook(currentRaw) : null), [currentRaw])
  const queue = useMemo(() => queuedRaw.map(mapBook), [queuedRaw])
  const finished = useMemo(() => finishedRaw.map(r => ({ ...mapBook(r), date: r.finished_at })), [finishedRaw])
  const doneCount = finishedRaw.length
  const genreCounts = useMemo(() => {
    const m = {}
    for (const r of finishedRaw) { const g = r.genre || 'Non-fiction'; m[g] = (m[g] || 0) + 1 }
    return m
  }, [finishedRaw])

  const heat = useMemo(() => buildHeat(activity), [activity])
  const year = useMemo(() => computeYear(goal, doneCount), [goal, doneCount])
  const genres = useMemo(() => genreView(genreCounts), [genreCounts])

  return {
    loading,
    goal, doneCount, current, queue, finished, genreCounts,
    heat, year, genres,
    canUndo: history.length > 0,
    lastFinishedTitle: finished[0]?.title || '',
    setProgress, bumpUp, bumpDown, toggleFormat, pickGenre, commitGoal,
    finishCurrent, undoLast, removeFinished,
    addToList, removeFromList, startNow, updateBook,
    logReading, undoReadingLog, canUndoReadingLog: !!readingLog,
  }
}
