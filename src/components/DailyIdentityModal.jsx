import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import Modal from './Modal'
import { localDate } from '../utils/taskHelpers'
import { IDENTITY_DOMAINS, VOTE_STYLES, VOTE_ORDER, tallyLabel } from '../utils/identityDomains'

// Daily Identity Check-In — one FOR/NEUTRAL/AGAINST vote per domain per day,
// plus an optional per-domain note. Fast to use: votes autosave instantly on tap
// (no confirm step), notes save on blur. The header tally and progress bar
// recompute live from the current votes. Domain descriptors are fixed standing
// copy from identityDomains.js — read-only here. `onChange` lets the parent
// refresh its Overview stat/widget/banner after any write.
export default function DailyIdentityModal({ onClose, onChange }) {
  const today = localDate()
  // votes: { [domain]: { vote: 'for'|'neutral'|'against'|null, note: string } }
  const [votes, setVotes] = useState(() =>
    Object.fromEntries(IDENTITY_DOMAINS.map(d => [d.name, { vote: null, note: '' }])))
  const [expanded, setExpanded] = useState({})   // domain -> descriptor expanded
  const [noteOpen, setNoteOpen] = useState({})   // domain -> note input revealed
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase.from('identity_votes').select('domain, vote, note').eq('vote_date', today)
      .then(({ data }) => {
        if (cancelled) return
        if (data) {
          setVotes(prev => {
            const next = { ...prev }
            for (const row of data) {
              if (next[row.domain]) next[row.domain] = { vote: row.vote, note: row.note || '' }
            }
            return next
          })
          setNoteOpen(Object.fromEntries(data.filter(r => r.note).map(r => [r.domain, true])))
        }
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [today])

  // Tally across all domains for the live header + progress bar.
  const counts = { for: 0, neutral: 0, against: 0 }
  for (const d of IDENTITY_DOMAINS) {
    const v = votes[d.name]?.vote
    if (v) counts[v]++
  }
  const cast = counts.for + counts.neutral + counts.against
  const tally = { forCount: counts.for, neutral: counts.neutral, against: counts.against }

  async function persist(domain, next) {
    await supabase.from('identity_votes').upsert(
      { vote_date: today, domain, vote: next.vote, note: next.note || null },
      { onConflict: 'vote_date,domain' })
    onChange?.()
  }

  function castVote(domain, vote) {
    setVotes(prev => {
      const current = prev[domain]
      // Tap the active option again to clear it (single-select per row).
      const nextVote = current.vote === vote ? null : vote
      const next = { ...current, vote: nextVote }
      persist(domain, next)
      return { ...prev, [domain]: next }
    })
  }

  function setNote(domain, note) {
    setVotes(prev => ({ ...prev, [domain]: { ...prev[domain], note } }))
  }

  function saveNote(domain) {
    persist(domain, votes[domain])
  }

  const headerTally = (
    <span className="text-[11px] text-gray-500 tracking-wide whitespace-nowrap">
      {cast === 0 ? 'no votes yet' : tallyLabel(tally)}
    </span>
  )

  return (
    <Modal
      title="Identity Check-In"
      onClose={onClose}
      hideSave
      cancelLabel="Done"
      maxWidth="max-w-2xl"
      headerAction={headerTally}
    >
      {/* Live 3-segment progress bar (todays votes, out of 8 domains). */}
      <div className="flex h-1 w-full overflow-hidden rounded-full bg-gray-800">
        <div className="bg-emerald-400" style={{ width: `${(counts.for / IDENTITY_DOMAINS.length) * 100}%` }} />
        <div className="bg-amber-400" style={{ width: `${(counts.neutral / IDENTITY_DOMAINS.length) * 100}%` }} />
        <div className="bg-red-400" style={{ width: `${(counts.against / IDENTITY_DOMAINS.length) * 100}%` }} />
      </div>

      {loading ? (
        <div className="text-sm text-gray-600 py-4">Loading…</div>
      ) : (
        <div className="-mt-1">
          {IDENTITY_DOMAINS.map(d => {
            const { vote, note } = votes[d.name]
            const isExpanded = !!expanded[d.name]
            const showNote = !!noteOpen[d.name]
            return (
              <div key={d.name} className="py-3.5 border-t border-white/5 first:border-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-100">{d.name}</div>
                    <p
                      onClick={() => setExpanded(e => ({ ...e, [d.name]: !e[d.name] }))}
                      className={`mt-1 cursor-pointer text-[12.5px] leading-relaxed text-gray-400 ${isExpanded ? '' : 'line-clamp-2'}`}
                    >
                      {d.descriptor}
                    </p>
                    <button
                      onClick={() => setExpanded(e => ({ ...e, [d.name]: !e[d.name] }))}
                      className="mt-0.5 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      {isExpanded ? 'show less' : 'show more'}
                    </button>
                  </div>

                  {/* Vote control — single-select, tap-active-to-clear. */}
                  <div className="flex shrink-0 gap-1.5">
                    {VOTE_ORDER.map(opt => {
                      const active = vote === opt
                      const s = VOTE_STYLES[opt]
                      return (
                        <button
                          key={opt}
                          onClick={() => castVote(d.name, opt)}
                          className={`min-w-[52px] rounded-lg border px-2.5 py-2 text-[10.5px] font-bold tracking-wide transition-colors ${
                            active ? s.active : 'border-white/10 text-gray-500 hover:border-white/25 hover:text-gray-300'
                          }`}
                        >
                          {s.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Optional note — collapsed by default. */}
                <div className="mt-2">
                  {showNote ? (
                    <input
                      value={note}
                      onChange={e => setNote(d.name, e.target.value)}
                      onBlur={() => saveNote(d.name)}
                      placeholder="Add a note…"
                      autoFocus={!note}
                      className="w-full rounded-md bg-gray-950 border border-gray-800 px-2.5 py-2 text-[12.5px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-400/50"
                    />
                  ) : (
                    <button
                      onClick={() => setNoteOpen(n => ({ ...n, [d.name]: true }))}
                      className="text-[11px] text-gray-600 hover:text-gray-400 transition-colors"
                    >
                      + note
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
