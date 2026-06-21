import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import ExerciseBankModal from './ExerciseBankModal'
import ProgrammeBuilderModal from './ProgrammeBuilderModal'

export default function TrainingPage() {
  const [showExerciseBank, setShowExerciseBank] = useState(false)
  const [showProgrammeBuilder, setShowProgrammeBuilder] = useState(false)
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchSessions() }, [])

  async function fetchSessions() {
    setLoading(true)
    const { data: prog } = await supabase
      .from('programmes')
      .select('id')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (!prog) { setLoading(false); return }

    const { data } = await supabase
      .from('sessions')
      .select('id, name')
      .eq('programme_id', prog.id)
      .order('sort_order')

    setSessions(data || [])
    setLoading(false)
  }

  function closeProgrammeBuilder() {
    setShowProgrammeBuilder(false)
    fetchSessions()
  }

  return (
    <div className="space-y-6">

      <div className="flex justify-end">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowProgrammeBuilder(true)}
            className="px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-xs tracking-widest uppercase text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
          >
            Manage programme
          </button>
          <button
            onClick={() => setShowExerciseBank(true)}
            className="px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-xs tracking-widest uppercase text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
          >
            Manage exercises
          </button>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <p className="text-xs tracking-widest uppercase text-gray-500 mb-4">Sessions</p>
        {loading ? (
          <p className="text-sm text-gray-600">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-gray-600">No sessions yet. Use Manage programme to build your programme.</p>
        ) : (
          <div className="space-y-1">
            {sessions.map(session => (
              <div key={session.id} className="py-2 px-3 rounded bg-gray-800/50">
                <span className="text-sm text-white">{session.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showExerciseBank && (
        <ExerciseBankModal onClose={() => setShowExerciseBank(false)} />
      )}
      {showProgrammeBuilder && (
        <ProgrammeBuilderModal onClose={closeProgrammeBuilder} />
      )}

    </div>
  )
}
