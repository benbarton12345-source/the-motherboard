import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import ExerciseBankModal from './ExerciseBankModal'
import ProgrammeBuilderModal from './ProgrammeBuilderModal'
import TrainingSession from './TrainingSession'
import TrainingAnalysis from './TrainingAnalysis'

export default function TrainingPage() {
  const [showExerciseBank, setShowExerciseBank] = useState(false)
  const [showProgrammeBuilder, setShowProgrammeBuilder] = useState(false)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [sessions, setSessions] = useState([])
  const [programmeId, setProgrammeId] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [activeSession, setActiveSession] = useState(null)
  const [adHocActive, setAdHocActive] = useState(false)
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
    setProgrammeId(prog.id)

    const { data } = await supabase
      .from('sessions')
      .select('id, name, session_exercises(count)')
      .eq('programme_id', prog.id)
      .order('sort_order')

    setSessions(data || [])
    setLoading(false)
  }

  function closeProgrammeBuilder() {
    setShowProgrammeBuilder(false)
    setSelectedId(null)
    fetchSessions()
  }

  return (
    <div className="space-y-6">

      <div className="flex justify-end">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAnalysis(true)}
            className="px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-xs tracking-widest uppercase text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
          >
            Analysis
          </button>
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
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs tracking-widest uppercase text-gray-500">Sessions</p>
          <button
            onClick={() => setAdHocActive(true)}
            className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs tracking-widest uppercase text-gray-300 hover:text-white hover:border-gray-600 transition-colors"
          >
            + Ad hoc session
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-gray-600">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-gray-600">No sessions yet. Use Manage programme to build your programme.</p>
        ) : (
          <div className="space-y-1">
            {sessions.map(session => {
              const exerciseCount = session.session_exercises?.[0]?.count ?? 0
              const selected = selectedId === session.id
              return (
                <div key={session.id}>
                  <button
                    onClick={() => setSelectedId(selected ? null : session.id)}
                    className={`w-full flex items-center justify-between py-2 px-3 rounded transition-colors ${selected ? 'bg-gray-800' : 'bg-gray-800/50 hover:bg-gray-800'}`}
                  >
                    <span className="text-sm text-white">{session.name}</span>
                    <span className="text-xs text-gray-500">{exerciseCount} {exerciseCount === 1 ? 'exercise' : 'exercises'}</span>
                  </button>
                  {selected && (
                    <button
                      onClick={() => setActiveSession(session)}
                      disabled={exerciseCount === 0}
                      className="w-full mt-1 mb-2 py-2.5 bg-emerald-400 text-gray-950 text-xs font-bold tracking-widest uppercase rounded hover:bg-emerald-300 transition-colors disabled:opacity-50"
                    >
                      {exerciseCount === 0 ? 'No exercises in this session' : 'Start session'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showExerciseBank && (
        <ExerciseBankModal onClose={() => setShowExerciseBank(false)} />
      )}
      {showProgrammeBuilder && (
        <ProgrammeBuilderModal onClose={closeProgrammeBuilder} />
      )}
      {activeSession && (
        <TrainingSession
          session={activeSession}
          programmeId={programmeId}
          onClose={() => setActiveSession(null)}
          onSaved={fetchSessions}
        />
      )}
      {adHocActive && (
        <TrainingSession
          session={null}
          programmeId={programmeId}
          adHoc
          onClose={() => setAdHocActive(false)}
          onSaved={fetchSessions}
        />
      )}
      {showAnalysis && (
        <TrainingAnalysis onClose={() => setShowAnalysis(false)} />
      )}

    </div>
  )
}
