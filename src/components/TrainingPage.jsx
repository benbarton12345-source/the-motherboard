import { useState } from 'react'
import ExerciseBankModal from './ExerciseBankModal'

export default function TrainingPage() {
  const [showExerciseBank, setShowExerciseBank] = useState(false)

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between">
        <p className="text-xs tracking-widest uppercase text-gray-500">01 // TRAINING</p>
        <button
          onClick={() => setShowExerciseBank(true)}
          className="px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-xs tracking-widest uppercase text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
        >
          Manage exercises
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <p className="text-xs tracking-widest uppercase text-gray-500 mb-3">Sessions</p>
        <p className="text-sm text-gray-600">Programme sessions will appear here once the programme builder is complete.</p>
      </div>

      {showExerciseBank && (
        <ExerciseBankModal onClose={() => setShowExerciseBank(false)} />
      )}

    </div>
  )
}
