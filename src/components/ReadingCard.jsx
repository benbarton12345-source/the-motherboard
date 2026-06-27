import { useState } from 'react'
import { useReading } from '../useReading'
import { GENRE_PRESETS, HEAT_RAMP, READING_PURPLE, unitInfo } from '../utils/readingHelpers'

// Home-tab compact "Reading" glance card. Shares state with the Productivity
// panel via useReading() (persisted to Supabase).
export default function ReadingCard() {
  const r = useReading()
  const [genreOpen, setGenreOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalDraft, setGoalDraft] = useState('')
  const [customGenre, setCustomGenre] = useState('')

  const cardStyle = { borderColor: 'rgba(167,139,250,0.18)' }
  const recent = r.heat.weeks.slice(-13)

  function onBarClick(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    r.setProgress((e.clientX - rect.left) / rect.width * 100)
  }
  function startGoalEdit() { setGoalDraft(String(r.goal)); setEditingGoal(true) }
  function commitGoal() { r.commitGoal(goalDraft); setEditingGoal(false) }

  const c = r.current
  const u = unitInfo(c)

  return (
    <div className="relative bg-gray-900 border rounded-lg p-5 overflow-visible" style={cardStyle}>
      {/* purple top accent bar */}
      <div className="absolute left-0 top-0 h-0.5 w-full rounded-t-lg"
        style={{ background: 'linear-gradient(90deg,#a78bfa,transparent)', boxShadow: '0 0 8px #a78bfa' }} />

      <h2 className="text-[11px] tracking-widest uppercase font-semibold mb-3" style={{ color: READING_PURPLE }}>Reading</h2>

      {c ? (
        <>
          {/* Title + meta */}
          <div className="text-base font-bold text-white leading-tight">{c.title}</div>
          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            <span className="text-xs text-gray-500 truncate max-w-[150px]">{c.author}</span>
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
                <GenrePopover
                  current={c.genre}
                  customGenre={customGenre}
                  setCustomGenre={setCustomGenre}
                  onPick={(g) => { r.pickGenre(g); setGenreOpen(false); setCustomGenre('') }}
                  onClose={() => setGenreOpen(false)}
                />
              )}
            </div>
          </div>

          {/* Progress */}
          <div className="mt-3">
            <div className="h-1.5 bg-gray-800 rounded cursor-pointer" onClick={onBarClick}>
              <div className="h-full rounded" style={{ width: `${c.progress}%`, background: READING_PURPLE, boxShadow: '0 0 6px #a78bfa' }} />
            </div>
            <div className="flex justify-between mt-1.5 text-[11px]">
              <span className="text-gray-500">{u.unitText}</span>
              <span style={{ color: READING_PURPLE }}>{c.progress}%</span>
            </div>
          </div>
        </>
      ) : (
        <div className="py-2">
          <div className="text-sm text-gray-400">Nothing currently reading</div>
          {r.queue.length > 0 && (
            <button onClick={() => r.startNow(0)}
              className="mt-2 text-[11px] tracking-widest uppercase rounded px-2 py-1 border"
              style={{ color: READING_PURPLE, borderColor: 'rgba(167,139,250,0.35)' }}>
              Start “{r.queue[0].title}”
            </button>
          )}
        </div>
      )}

      {/* Year count */}
      <div className="flex justify-between items-baseline mt-4 pt-3.5 border-t border-white/5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[22px] font-extrabold text-white tabular-nums">{r.doneCount}</span>
          {editingGoal ? (
            <input autoFocus value={goalDraft}
              onChange={e => setGoalDraft(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={commitGoal}
              onKeyDown={e => { if (e.key === 'Enter') commitGoal(); if (e.key === 'Escape') setEditingGoal(false) }}
              className="w-10 bg-gray-800 border border-gray-700 rounded text-sm text-white text-center focus:outline-none" />
          ) : (
            <button onClick={startGoalEdit} className="text-xs text-gray-500 border-b border-dashed border-gray-600 hover:text-gray-300">
              / {r.goal} books
            </button>
          )}
        </div>
        <span className="text-[10px] font-semibold" style={{ color: r.year.paceColor }}>{r.year.paceText}</span>
      </div>

      {/* Genres read */}
      {r.genres.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] tracking-widest uppercase text-gray-600 mb-2">Genres read</div>
          <div className="flex h-2 rounded overflow-hidden bg-gray-800">
            {r.genres.map(g => (
              <div key={g.name} style={{ width: `${g.pct}%`, background: g.color }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
            {r.genres.map(g => (
              <div key={g.name} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm" style={{ background: g.color }} />
                <span className="text-[10px] text-gray-400">{g.name}</span>
                <span className="text-[10px] text-gray-600">{g.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reading activity (compact heatmap) */}
      <div className="mt-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-[10px] tracking-widest uppercase text-gray-600">Reading activity</span>
          <span className="text-[10px] font-semibold" style={{ color: READING_PURPLE }}>{r.heat.streak}-day streak</span>
        </div>
        <div className="flex gap-[2.5px]">
          {recent.map(w => (
            <div key={w.key} className="flex flex-col gap-[2.5px]">
              {w.cells.map(cell => (
                <div key={cell.key} className="w-2.5 h-2.5 rounded-sm" style={{ background: cell.color }} />
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1 mt-2 text-[9px] text-gray-600">
          <span>Less</span>
          {HEAT_RAMP.map((col, i) => <span key={i} className="w-2.5 h-2.5 rounded-sm" style={{ background: col }} />)}
          <span>More</span>
        </div>
      </div>

      {/* Mark finished */}
      {c && (
        <button onClick={r.finishCurrent}
          className="w-full text-center text-[11px] tracking-widest uppercase font-semibold rounded py-2.5 mt-4 border transition-colors hover:bg-violet-400/10"
          style={{ color: READING_PURPLE, borderColor: 'rgba(167,139,250,0.35)' }}>
          ✓ Mark finished · start next
        </button>
      )}
      {r.canUndo && (
        <button onClick={r.undoLast} className="block w-full text-center text-[10px] text-gray-500 hover:text-gray-300 mt-2.5">
          ↶ Undo — restore “{r.lastFinishedTitle}”
        </button>
      )}

      {/* Up next */}
      <div className="flex justify-between items-center mt-3.5 pt-3 border-t border-white/5">
        <div className="min-w-0">
          <div className="text-[9px] tracking-widest uppercase text-gray-600">Up next</div>
          <div className="text-xs text-gray-400 truncate mt-0.5">
            {r.queue.length ? `${r.queue[0].title} — ${r.queue[0].author}` : 'pick a new book'}
          </div>
        </div>
        <div className="text-[10px] font-semibold whitespace-nowrap pl-2" style={{ color: READING_PURPLE }}>
          {r.queue.length} to read
        </div>
      </div>
    </div>
  )
}

// Genre popover — 7 presets + custom text input, closes on outside click
export function GenrePopover({ current, customGenre, setCustomGenre, onPick, onClose }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute z-50 mt-1 left-0 w-44 bg-gray-900 border border-gray-700 rounded-lg p-1.5 shadow-xl">
        {GENRE_PRESETS.map(g => (
          <button key={g} onClick={() => onPick(g)}
            className={`block w-full text-left text-xs px-2 py-1.5 rounded hover:bg-gray-800 ${g === current ? 'text-violet-400' : 'text-gray-300'}`}>
            {g}
          </button>
        ))}
        <input
          value={customGenre}
          onChange={e => setCustomGenre(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && customGenre.trim()) onPick(customGenre.trim()) }}
          placeholder="Custom…"
          className="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-violet-400"
        />
      </div>
    </>
  )
}
