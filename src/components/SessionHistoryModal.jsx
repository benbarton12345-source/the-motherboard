import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import Modal from './Modal'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}
const fmtNum = (v) => (v == null ? '—' : (v % 1 === 0 ? String(v) : v.toFixed(1)))

// Read-only browser of past logged sessions. exerciseMap (id -> {name, muscle_group})
// is passed from TrainingAnalysis so we don't re-fetch the exercise bank.
export default function SessionHistoryModal({ exerciseMap = {}, onClose }) {
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState([])
  const [selected, setSelected] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('performed_sessions')
      .select(`
        id, performed_date, session_rating, energy_rating, session_note,
        session:sessions ( name ),
        performed_exercises (
          exercise_id, sort_order, exercise_note,
          performed_sets ( set_number, target_reps, actual_reps, actual_weight )
        )
      `)
      .order('performed_date', { ascending: false })
      .order('created_at', { ascending: false })

    const rows = (data || []).map(s => {
      const exercises = [...(s.performed_exercises || [])]
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map(pe => ({
          name: exerciseMap[pe.exercise_id]?.name || 'Exercise',
          muscle: exerciseMap[pe.exercise_id]?.muscle_group || '',
          note: pe.exercise_note,
          sets: [...(pe.performed_sets || [])].sort((a, b) => a.set_number - b.set_number),
        }))
      return {
        id: s.id,
        date: s.performed_date,
        name: s.session?.name || 'Ad hoc',
        rating: s.session_rating,
        energy: s.energy_rating,
        note: s.session_note,
        exercises,
        setCount: exercises.reduce((a, e) => a + e.sets.length, 0),
      }
    })
    setSessions(rows)
    setLoading(false)
  }

  return (
    <Modal
      title={selected ? selected.name : 'Session History'}
      onClose={onClose}
      hideSave
      cancelLabel="Close"
      maxWidth="max-w-2xl"
      headerAction={selected && (
        <button onClick={() => setSelected(null)}
          className="text-xs tracking-widest uppercase text-gray-500 hover:text-white transition-colors">
          ← Back
        </button>
      )}
    >
      {loading ? (
        <p className="text-sm text-gray-600">Loading…</p>
      ) : selected ? (
        <SessionDetail session={selected} />
      ) : sessions.length === 0 ? (
        <p className="text-sm text-gray-600">No sessions logged yet.</p>
      ) : (
        <div className="space-y-1">
          {sessions.map(s => (
            <button key={s.id} onClick={() => setSelected(s)}
              className="w-full flex items-center justify-between gap-3 py-3 px-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors text-left">
              <div className="min-w-0">
                <div className="text-sm text-white truncate">{s.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{fmtDate(s.date)}</div>
              </div>
              <span className="text-xs text-gray-500 shrink-0">
                {s.exercises.length} {s.exercises.length === 1 ? 'exercise' : 'exercises'}
              </span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}

function SessionDetail({ session }) {
  return (
    <div className="space-y-5">
      {/* Date + ratings */}
      <div>
        <div className="text-xs text-gray-500">{fmtDate(session.date)}</div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3">
          <div>
            <div className="text-xs tracking-widest uppercase text-gray-500">Session rating</div>
            <div className="text-sm font-bold text-white mt-0.5">{session.rating != null ? `${session.rating}/10` : '—'}</div>
          </div>
          <div>
            <div className="text-xs tracking-widest uppercase text-gray-500">Energy</div>
            <div className="text-sm font-bold text-white mt-0.5">{session.energy != null ? `${session.energy}/10` : '—'}</div>
          </div>
        </div>
        {session.note && (
          <div className="mt-3">
            <div className="text-xs tracking-widest uppercase text-gray-500 mb-1">Session notes</div>
            <p className="text-sm text-gray-300 whitespace-pre-wrap">{session.note}</p>
          </div>
        )}
      </div>

      {/* Exercises */}
      {session.exercises.length === 0 ? (
        <p className="text-sm text-gray-600">No exercises logged for this session.</p>
      ) : (
        <div className="space-y-3">
          {session.exercises.map((ex, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-bold text-white truncate">{ex.name}</span>
                {ex.muscle && <span className="text-[10px] tracking-widest uppercase text-gray-500 shrink-0">{ex.muscle}</span>}
              </div>
              <div className="mt-2.5 space-y-1">
                {ex.sets.map((s, j) => (
                  <div key={j} className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Set {s.set_number}</span>
                    <span className="text-white">
                      {fmtNum(s.actual_weight)} kg × {s.actual_reps ?? '—'}
                      {s.target_reps != null && <span className="text-gray-600"> · target {s.target_reps}</span>}
                    </span>
                  </div>
                ))}
              </div>
              {ex.note && (
                <p className="text-xs text-gray-400 mt-2.5 pt-2.5 border-t border-gray-800 whitespace-pre-wrap">{ex.note}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
