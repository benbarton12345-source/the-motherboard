import { useState } from 'react'
import ExerciseBankModal from './ExerciseBankModal'
import ProgrammeBuilderModal from './ProgrammeBuilderModal'

export default function TrainingPage() {
  const [showExerciseBank, setShowExerciseBank] = useState(false)
  const [showProgrammeBuilder, setShowProgrammeBuilder] = useState(false)

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between">
        <p className="text-xs tracking-widest uppercase text-gray-500">01 // TRAINING</p>
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
        <p className="text-xs tracking-widest uppercase text-gray-500 mb-3">Sessions</p>
        <p className="text-sm text-gray-600">Programme sessions will appear here once the phone logging screen is complete.</p>
      </div>

      {showExerciseBank && (
        <ExerciseBankModal onClose={() => setShowExerciseBank(false)} />
      )}
      {showProgrammeBuilder && (
        <ProgrammeBuilderModal onClose={() => setShowProgrammeBuilder(false)} />
      )}

    </div>
  )
}
