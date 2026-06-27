import { useState } from 'react'
import { useReading } from '../useReading'
import { GENRE_PRESETS, HEAT_RAMP, READING_PURPLE, unitInfo, fmtFinishedDate } from '../utils/readingHelpers'
import { GenrePopover } from './ReadingCard'

// Productivity-tab full-width "Reading · <year> Goal" panel. Shares state with
// the Home card via useReading() (persisted to Supabase).
export default function ReadingPanel() {
  const r = useReading()
  const year = new Date().getFullYear()

  const [genreOpen, setGenreOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalDraft, setGoalDraft] = useState('')
  const [customGenre, setCustomGenre] = useState('')
  const [newBook, setNewBook] = useState({ title: '', author: '', format: 'book', genre: 'Non-fiction' })

  const c = r.current
  const u = unitInfo(c)
  const label = 'text-[11px] tracking-widest uppercase font-semibold text-gray-600'
  const subLabel = 'text-[10px] tracking-widest uppercase text-gray-600'

  function onBarClick(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    r.setProgress((e.clientX - rect.left) / rect.width * 100)
  }
  function startGoalEdit() { setGoalDraft(String(r.goal)); setEditingGoal(true) }
  function commitGoal() { r.commitGoal(goalDraft); setEditingGoal(false) }
  function submitAdd() {
    if (!newBook.title.trim()) return
    r.addToList(newBook)
    setNewBook(nb => ({ title: '', author: '', format: nb.format, genre: nb.genre }))
  }

  if (r.loading) {
    return <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-xs text-gray-600">Loading reading…</div>
  }

  return (
    <div className="relative bg-gray-900 border rounded-lg p-6 overflow-visible" style={{ borderColor: 'rgba(167,139,250,0.22)' }}>
      {/* purple vertical accent bar */}
      <div className="absolute left-0 top-0 h-full w-0.5 rounded-l-lg"
        style={{ background: 'linear-gradient(180deg,#a78bfa,transparent)', boxShadow: '0 0 8px #a78bfa' }} />

      <h2 className="text-[11px] tracking-widest uppercase font-semibold mb-5" style={{ color: READING_PURPLE }}>
        Reading · {year} Goal
      </h2>

      {/* ── Top 3-column section ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr_1.15fr] gap-6">

        {/* Column A — Currently Reading */}
        <div>
          <div className={subLabel + ' mb-3'}>Currently reading</div>
          {c ? (
            <>
              <div className="text-xl font-extrabold text-white leading-tight">{c.title}</div>
              <div className="flex items-center gap-2 flex-wrap mt-2">
                <span className="text-xs text-gray-500 truncate max-w-[180px]">{c.author}</span>
                <button onClick={r.toggleFormat}
                  className="text-[9px] tracking-widest uppercase rounded px-1.5 py-0.5 border"
                  style={{ color: READING_PURPLE, borderColor: 'rgba(167,139,250,0.4)' }}>
                  {c.format === 'audio' ? 'Audio' : 'Book'}
                </button>
                <div className="relative">
                  <button onClick={() => setGenreOpen(o => !o)}
                    className="text-[9px] text-gray-400 rounded px-1.5 py-0.5 border border-white/10 bg-white/5 hover:text-white">
                    {c.genre || 'Genre'} ▾
                  </button>
                  {genreOpen && (
                    <GenrePopover current={c.genre} customGenre={customGenre} setCustomGenre={setCustomGenre}
                      onPick={(g) => { r.pickGenre(g); setGenreOpen(false); setCustomGenre('') }}
                      onClose={() => setGenreOpen(false)} />
                  )}
                </div>
              </div>

              <div className="mt-3">
                <div className="h-2 bg-gray-800 rounded cursor-pointer" onClick={onBarClick}>
                  <div className="h-full rounded" style={{ width: `${c.progress}%`, background: READING_PURPLE, boxShadow: '0 0 6px #a78bfa' }} />
                </div>
                <div className="flex justify-between mt-2 text-xs">
                  <span className="text-gray-500">{u.unitText} · {u.remainingText}</span>
                  <span style={{ color: READING_PURPLE }}>{c.progress}%</span>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3">
                <button onClick={r.bumpDown} className="px-3 py-2 text-sm text-gray-300 border border-gray-700 rounded hover:border-gray-600">−</button>
                <button onClick={r.bumpUp} className="px-3 py-2 text-xs tracking-wider text-gray-300 border border-gray-700 rounded hover:border-gray-600">+5%</button>
                <button onClick={r.finishCurrent}
                  className="flex-1 text-center text-[11px] tracking-widest uppercase font-semibold rounded py-2 border transition-colors hover:bg-violet-400/10"
                  style={{ color: READING_PURPLE, borderColor: 'rgba(167,139,250,0.4)' }}>
                  ✓ Mark finished
                </button>
              </div>
              {r.canUndo && (
                <button onClick={r.undoLast} className="text-[11px] text-gray-500 hover:text-gray-300 mt-2.5">
                  ↶ Undo — restore “{r.lastFinishedTitle}” to currently reading
                </button>
              )}
              <div className="text-xs text-gray-600 mt-3">
                Next up: <span className="text-gray-400">{r.queue.length ? r.queue[0].title : 'pick a new book'}</span>
              </div>
            </>
          ) : (
            <div className="py-2">
              <div className="text-sm text-gray-400">Nothing currently reading</div>
              {r.queue.length > 0 && (
                <button onClick={() => r.startNow(0)}
                  className="mt-3 text-[11px] tracking-widest uppercase rounded px-3 py-2 border"
                  style={{ color: READING_PURPLE, borderColor: 'rgba(167,139,250,0.4)' }}>
                  Start “{r.queue[0].title}”
                </button>
              )}
            </div>
          )}
        </div>

        {/* Column B — Year Progress */}
        <div className="lg:border-l lg:border-white/5 lg:pl-6">
          <div className={subLabel + ' mb-3'}>{year} progress</div>
          <div className="flex items-baseline gap-2">
            <span className="text-[40px] leading-none font-extrabold text-white tabular-nums">{r.doneCount}</span>
            <div className="text-xs text-gray-500">
              of{' '}
              {editingGoal ? (
                <input autoFocus value={goalDraft}
                  onChange={e => setGoalDraft(e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={commitGoal}
                  onKeyDown={e => { if (e.key === 'Enter') commitGoal(); if (e.key === 'Escape') setEditingGoal(false) }}
                  className="w-12 bg-gray-800 border border-gray-700 rounded text-sm text-white text-center focus:outline-none" />
              ) : (
                <button onClick={startGoalEdit} className="text-gray-300 border-b border-dashed border-gray-600 hover:text-white">{r.goal}</button>
              )}{' '}read
            </div>
          </div>

          {/* segmented year bar */}
          <div className="flex flex-wrap gap-[3px] mt-4">
            {Array.from({ length: r.goal }, (_, i) => (
              <div key={i} className="h-3 flex-1 min-w-[6px] rounded-sm"
                style={{ background: i < r.doneCount ? READING_PURPLE : '#1a2127' }} />
            ))}
          </div>

          <div className="flex justify-between mt-2.5">
            <span className="text-xs font-bold" style={{ color: r.year.paceColor }}>{r.year.paceText}</span>
            <span className="text-xs text-gray-500">{r.year.percent}% of goal</span>
          </div>

          <div className="mt-4 pt-4 border-t border-white/5 space-y-2.5">
            <div className="flex justify-between">
              <span className="text-xs text-gray-500">On pace for</span>
              <span className="text-xs font-bold text-white">{r.year.projected} books</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-gray-500">To hit goal</span>
              <span className="text-xs font-bold text-white">{r.year.remaining} more · {r.year.perMonth}/mo</span>
            </div>
          </div>
        </div>

        {/* Column C — Finished This Year */}
        <div className="lg:border-l lg:border-white/5 lg:pl-6">
          <div className={subLabel + ' mb-3'}>Finished this year</div>
          {r.finished.length === 0 ? (
            <div className="text-xs text-gray-600">No finishes logged yet.</div>
          ) : (
            <div className="max-h-[210px] overflow-y-auto pr-1">
              {r.finished.map((b, i) => (
                <div key={i} className="flex justify-between items-center gap-2 py-2 border-b border-white/5 group">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-gray-200 truncate">{b.title}</div>
                    <div className="text-xs text-gray-600 truncate">{b.author} · {b.genre}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[9px] tracking-widest uppercase rounded px-1.5 py-0.5 border"
                      style={{ color: READING_PURPLE, borderColor: 'rgba(167,139,250,0.4)' }}>
                      {b.format === 'audio' ? 'Audio' : 'Book'}
                    </span>
                    <span className="text-[10px] text-gray-600 w-12 text-right">{fmtFinishedDate(b.date)}</span>
                    <button onClick={() => r.removeFinished(i)}
                      className="text-gray-700 hover:text-red-400 text-base leading-none opacity-0 group-hover:opacity-100">×</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Reading List ─────────────────────────────────────────── */}
      <div className="mt-6 pt-5 border-t border-white/5">
        <div className="flex items-center gap-3 mb-3">
          <span className={label}>Reading List · Books I Intend To Read</span>
          <span className="text-[11px] font-semibold" style={{ color: READING_PURPLE }}>{r.queue.length} queued</span>
        </div>

        {/* Add form */}
        <div className="flex flex-wrap gap-2 mb-4">
          <input value={newBook.title}
            onChange={e => setNewBook(nb => ({ ...nb, title: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') submitAdd() }}
            placeholder="Title"
            className="flex-[2] min-w-[160px] bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-400" />
          <input value={newBook.author}
            onChange={e => setNewBook(nb => ({ ...nb, author: e.target.value }))}
            placeholder="Author"
            className="flex-1 min-w-[120px] bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-400" />
          <div className="flex border border-gray-700 rounded overflow-hidden">
            {['book', 'audio'].map(f => (
              <button key={f} onClick={() => setNewBook(nb => ({ ...nb, format: f }))}
                className="px-3 py-2 text-[10px] tracking-widest uppercase"
                style={newBook.format === f
                  ? { color: READING_PURPLE, background: 'rgba(167,139,250,0.12)' }
                  : { color: '#5f6e73' }}>
                {f}
              </button>
            ))}
          </div>
          <select value={newBook.genre}
            onChange={e => setNewBook(nb => ({ ...nb, genre: e.target.value }))}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-violet-400">
            {GENRE_PRESETS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <button onClick={submitAdd}
            className="px-4 py-2 text-[11px] tracking-widest uppercase font-semibold rounded border transition-colors hover:bg-violet-400/10"
            style={{ color: READING_PURPLE, borderColor: 'rgba(167,139,250,0.4)' }}>
            + Add
          </button>
        </div>

        {/* Queue list */}
        {r.queue.length === 0 ? (
          <div className="text-xs text-gray-600">Reading list empty — add a book above.</div>
        ) : (
          <div className="space-y-1">
            {r.queue.map((b, i) => (
              <div key={i} className="flex items-center gap-3 py-2 px-2 rounded hover:bg-gray-800/50 group">
                <span className="text-xs text-gray-600 w-4 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0 truncate">
                  <span className="text-[13px] font-semibold text-gray-200">{b.title}</span>
                  <span className="text-xs text-gray-600"> — {b.author}</span>
                </div>
                <span className="text-[9px] tracking-widest uppercase rounded px-1.5 py-0.5 border shrink-0"
                  style={{ color: READING_PURPLE, borderColor: 'rgba(167,139,250,0.4)' }}>
                  {b.format === 'audio' ? 'Audio' : 'Book'}
                </span>
                <span className="text-[11px] text-gray-600 w-28 truncate shrink-0">{b.genre}</span>
                <button onClick={() => r.startNow(i)}
                  className="text-[10px] tracking-widest uppercase rounded px-2 py-1 border shrink-0 text-emerald-400 border-emerald-400/40 hover:bg-emerald-400/10">
                  Start
                </button>
                <button onClick={() => r.removeFromList(i)}
                  className="text-gray-700 hover:text-red-400 text-base leading-none shrink-0 opacity-0 group-hover:opacity-100">×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Genres + Heatmap band ────────────────────────────────── */}
      <div className="mt-6 pt-5 border-t border-white/5 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-10">
        {/* Genres Read */}
        <div>
          <div className={subLabel + ' mb-3'}>Genres Read · {year}</div>
          {r.genres.length === 0 ? (
            <div className="text-xs text-gray-600">No genres yet.</div>
          ) : (
            <>
              <div className="flex h-3 rounded overflow-hidden bg-gray-800">
                {r.genres.map(g => <div key={g.name} style={{ width: `${g.pct}%`, background: g.color }} />)}
              </div>
              <div className="flex flex-col gap-2 mt-4">
                {r.genres.map(g => (
                  <div key={g.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: g.color }} />
                      <span className="text-xs text-gray-300">{g.name}</span>
                    </div>
                    <span className="text-xs text-gray-500">{g.count} · {g.pctLabel}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Daily Reading Activity */}
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-3">
            <span className={subLabel}>Daily Reading Activity · {year}</span>
            <span className="text-[11px] font-semibold" style={{ color: READING_PURPLE }}>{r.heat.streak}-day streak</span>
            <span className="text-[11px] text-gray-600">{r.heat.activeDays} active days</span>
          </div>
          <div className="overflow-x-auto">
            {/* month labels */}
            <div className="flex gap-[3px] mb-1">
              {r.heat.weeks.map(w => (
                <div key={w.key} className="w-3.5 text-[9px] text-gray-600 whitespace-nowrap overflow-visible">{w.label}</div>
              ))}
            </div>
            <div className="flex gap-[3px]">
              {r.heat.weeks.map(w => (
                <div key={w.key} className="flex flex-col gap-[3px]">
                  {w.cells.map(cell => (
                    <div key={cell.key} className="w-3.5 h-3.5 rounded-sm" style={{ background: cell.color }} />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1 mt-2 text-[11px] text-gray-600">
            <span>Less</span>
            {HEAT_RAMP.map((col, i) => <span key={i} className="w-3 h-3 rounded-sm" style={{ background: col }} />)}
            <span>More</span>
          </div>
        </div>
      </div>
    </div>
  )
}
