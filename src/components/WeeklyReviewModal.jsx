import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import Modal from './Modal'
import { isoMonday, isoWeekNumber, weekRangeLabel } from '../utils/productivityHelpers'

// Weekly Review modal — six reflection fields for one ISO week, keyed by
// `week_start` (Monday) in weekly_reviews. Autosaves a draft on blur; "Seal
// Week" locks the row (sealed = true, sealed_at = now) after which it is
// read-only. A week navigator allows retrospective entry of past weeks, and a
// history view lists prior reviews. `week_start` is the table's unique key
// (NOT week_start_date — that column belongs to weekly_goal_completions).
const FIELDS = [
  { key: 'went_well', label: 'What went well this week?' },
  { key: 'challenge_overcome', label: 'One challenge I overcame' },
  { key: 'improve_next_week', label: 'One thing I can improve next week' },
  { key: 'proud_of', label: 'One thing I am proud of' },
]

// Identity Check section — 4 free-text fields appended below the core 6.
const IDENTITY_FIELDS = [
  { key: 'fewest_votes_domain', label: 'Which domain got the fewest votes this week, and why?' },
  { key: 'against_trigger', label: 'Where did I vote against the person I’m becoming — what triggered it?' },
  { key: 'trading_lesson', label: 'One trading observation or lesson this week' },
  { key: 'identity_match_vs_last_week', label: 'Did this week’s version of me match the future version I described, more or less than last week?' },
]

const EMPTY = {
  went_well: '', challenge_overcome: '', improve_next_week: '', proud_of: '', consistency_score: '', anything_else: '',
  fewest_votes_domain: '', against_trigger: '', trading_lesson: '', identity_match_vs_last_week: '',
}

function weekOfLabel(monday) {
  const [y, m, d] = monday.split('-').map(Number)
  return `Week of ${new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

function fmtSealed(ts) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function WeeklyReviewModal({ initialOffset = 0, startInHistory = false, onClose, onSealed }) {
  const [offset, setOffset] = useState(initialOffset)
  const [form, setForm] = useState(EMPTY)
  const [sealedAt, setSealedAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState('idle') // idle | saving | saved
  const [showHistory, setShowHistory] = useState(startInHistory)
  const [history, setHistory] = useState([])
  const [warn, setWarn] = useState('')

  const monday = isoMonday(offset)
  const sealed = !!sealedAt
  const saveTimer = useRef(null)

  // Load the selected week's row whenever the week changes. All state updates
  // happen inside the async callback (no synchronous setState in the effect body).
  useEffect(() => {
    let cancelled = false
    supabase.from('weekly_reviews').select('*').eq('week_start', monday).maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setWarn('')
        if (data) {
          setForm({
            went_well: data.went_well || '',
            challenge_overcome: data.challenge_overcome || '',
            improve_next_week: data.improve_next_week || '',
            proud_of: data.proud_of || '',
            consistency_score: data.consistency_score ?? '',
            anything_else: data.anything_else || '',
            fewest_votes_domain: data.fewest_votes_domain || '',
            against_trigger: data.against_trigger || '',
            trading_lesson: data.trading_lesson || '',
            identity_match_vs_last_week: data.identity_match_vs_last_week || '',
          })
          setSealedAt(data.sealed_at || null)
        } else {
          setForm(EMPTY)
          setSealedAt(null)
        }
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [monday])

  // Load history once (and refresh after a seal).
  const loadHistory = () => {
    supabase.from('weekly_reviews').select('*').order('week_start', { ascending: false })
      .then(({ data }) => { if (data) setHistory(data) })
  }
  useEffect(() => { loadHistory() }, [])

  function setField(key, value) {
    setForm(f => ({ ...f, [key]: value }))
  }

  // Autosave draft on blur (skipped once sealed).
  async function persist(next = form) {
    if (sealed) return
    setSaveStatus('saving')
    await supabase.from('weekly_reviews').upsert({
      week_start: monday,
      went_well: next.went_well,
      challenge_overcome: next.challenge_overcome,
      improve_next_week: next.improve_next_week,
      proud_of: next.proud_of,
      anything_else: next.anything_else,
      consistency_score: next.consistency_score !== '' ? parseInt(next.consistency_score, 10) : null,
      fewest_votes_domain: next.fewest_votes_domain,
      against_trigger: next.against_trigger,
      trading_lesson: next.trading_lesson,
      identity_match_vs_last_week: next.identity_match_vs_last_week,
    }, { onConflict: 'week_start' })
    setSaveStatus('saved')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setSaveStatus('idle'), 1500)
  }

  async function sealWeek() {
    const score = parseInt(form.consistency_score, 10)
    if (isNaN(score) || score < 1 || score > 10) {
      setWarn('Consistency score (1–10) is required to seal the week.')
      return
    }
    const allBlank = FIELDS.every(f => !form[f.key].trim()) && !form.anything_else.trim()
    if (allBlank) {
      setWarn('All reflection fields are blank — write at least one before sealing.')
      return
    }
    setWarn('')
    const now = new Date().toISOString()
    await supabase.from('weekly_reviews').upsert({
      week_start: monday,
      went_well: form.went_well,
      challenge_overcome: form.challenge_overcome,
      improve_next_week: form.improve_next_week,
      proud_of: form.proud_of,
      anything_else: form.anything_else,
      consistency_score: score,
      fewest_votes_domain: form.fewest_votes_domain,
      against_trigger: form.against_trigger,
      trading_lesson: form.trading_lesson,
      identity_match_vs_last_week: form.identity_match_vs_last_week,
      sealed: true,
      sealed_at: now,
    }, { onConflict: 'week_start' })
    setSealedAt(now)
    loadHistory()
    onSealed?.()
  }

  const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400 disabled:opacity-60'

  const headerAction = (
    <button
      onClick={() => setShowHistory(h => !h)}
      className="text-[11px] text-gray-500 hover:text-white uppercase tracking-widest transition-colors"
    >{showHistory ? 'Back' : 'History'}</button>
  )

  return (
    <Modal
      title="Weekly Review"
      onClose={onClose}
      onSave={sealWeek}
      saveLabel="Seal Week"
      hideSave={sealed || showHistory || loading}
      cancelLabel="Close"
      maxWidth="max-w-lg"
      headerAction={headerAction}
    >
      {showHistory ? (
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-3">Past reviews</div>
          {history.length === 0 ? (
            <div className="text-sm text-gray-600">No reviews yet.</div>
          ) : (
            <div className="space-y-1">
              {history.map(r => {
                const isSealed = !!r.sealed_at
                const firstLine = (r.went_well || '').split('\n')[0].slice(0, 60)
                // Offset of this row's week relative to the current ISO week.
                const rowOffset = Math.round((new Date(r.week_start) - new Date(isoMonday(0))) / (7 * 86400000))
                return (
                  <button
                    key={r.week_start}
                    onClick={() => { setOffset(rowOffset); setShowHistory(false) }}
                    className="w-full text-left flex items-center gap-3 py-2.5 px-2 rounded hover:bg-gray-800/60 transition-colors border-b border-gray-800 last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white">Week {isoWeekNumber(r.week_start)} · {weekRangeLabel(r.week_start)}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {isSealed ? (firstLine || 'Sealed') : 'Not completed'}
                      </div>
                    </div>
                    {isSealed ? (
                      <span className="text-xs text-emerald-400 shrink-0">{r.consistency_score ?? '—'}/10</span>
                    ) : (
                      <span className="text-[10px] text-amber-400 uppercase tracking-widest shrink-0">Fill in</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Week selector */}
          <div className="flex items-center justify-between pb-3 border-b border-gray-800">
            <button onClick={() => setOffset(o => o - 1)} className="text-gray-500 hover:text-white text-xl leading-none">‹</button>
            <div className="text-center">
              <div className="text-sm text-white font-medium">{weekOfLabel(monday)}</div>
              <div className="text-[11px] text-gray-500">
                Week {isoWeekNumber(monday)}
                {sealed && <span className="text-emerald-400"> · Sealed {fmtSealed(sealedAt)}</span>}
              </div>
            </div>
            <button
              onClick={() => setOffset(o => Math.min(0, o + 1))}
              disabled={offset === 0}
              className="text-gray-500 hover:text-white text-xl leading-none disabled:opacity-30 disabled:cursor-default"
            >›</button>
          </div>

          {loading ? (
            <div className="text-sm text-gray-600 py-4">Loading…</div>
          ) : (
            <>
              {FIELDS.map(f => (
                <div key={f.key}>
                  <label className="block text-[11px] text-gray-500 uppercase tracking-widest mb-1.5">{f.label}</label>
                  <textarea
                    value={form[f.key]}
                    disabled={sealed}
                    onChange={e => setField(f.key, e.target.value)}
                    onBlur={() => persist()}
                    rows={2}
                    className={`${inputCls} resize-none`}
                  />
                </div>
              ))}

              <div>
                <label className="block text-[11px] text-gray-500 uppercase tracking-widest mb-1.5">Consistency score (1–10)</label>
                <input
                  type="number" min="1" max="10" step="1"
                  value={form.consistency_score}
                  disabled={sealed}
                  onChange={e => setField('consistency_score', e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                  onBlur={() => persist()}
                  className={`${inputCls} w-24`}
                />
              </div>

              <div>
                <label className="block text-[11px] text-gray-500 uppercase tracking-widest mb-1.5">Anything else?</label>
                <textarea
                  value={form.anything_else}
                  disabled={sealed}
                  onChange={e => setField('anything_else', e.target.value)}
                  onBlur={() => persist()}
                  rows={2}
                  className={`${inputCls} resize-none`}
                />
              </div>

              {/* Identity Check section */}
              <div className="flex items-center gap-3 pt-2">
                <div className="h-px flex-1 bg-gray-800" />
                <span className="text-[11px] font-bold tracking-[0.08em] uppercase text-blue-400">Identity Check</span>
                <div className="h-px flex-1 bg-gray-800" />
              </div>

              {IDENTITY_FIELDS.map(f => (
                <div key={f.key}>
                  <label className="block text-[11px] text-gray-500 uppercase tracking-widest mb-1.5">{f.label}</label>
                  <textarea
                    value={form[f.key]}
                    disabled={sealed}
                    onChange={e => setField(f.key, e.target.value)}
                    onBlur={() => persist()}
                    rows={2}
                    className={`${inputCls} resize-none`}
                  />
                </div>
              ))}

              {warn && <div className="text-xs text-amber-400">{warn}</div>}

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-gray-600">
                  {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Draft saved' : ''}
                </span>
                {sealed && (
                  <span className="text-[11px] text-emerald-400 uppercase tracking-widest">✓ Sealed — read only</span>
                )}
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  )
}
