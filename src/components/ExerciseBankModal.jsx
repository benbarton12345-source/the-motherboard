import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const MUSCLE_GROUPS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core']

export default function ExerciseBankModal({ onClose }) {
  const [exercises, setExercises] = useState([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('list') // 'list' | 'add' | 'edit'
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ name: '', muscle_group: '' })
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => { fetchExercises() }, [])

  async function fetchExercises() {
    const { data } = await supabase
      .from('exercises')
      .select('*')
      .order('muscle_group')
      .order('name')
    setExercises(data || [])
    setLoading(false)
  }

  function openAdd() {
    setForm({ name: '', muscle_group: '' })
    setEditingId(null)
    setMode('add')
  }

  function openEdit(ex) {
    setForm({ name: ex.name, muscle_group: ex.muscle_group })
    setEditingId(ex.id)
    setMode('edit')
  }

  function backToList() {
    setMode('list')
    setEditingId(null)
    setForm({ name: '', muscle_group: '' })
  }

  async function handleSave() {
    if (!form.name.trim() || !form.muscle_group.trim()) return
    setSaving(true)
    if (mode === 'add') {
      await supabase.from('exercises').insert({
        name: form.name.trim(),
        muscle_group: form.muscle_group.trim(),
      })
    } else {
      await supabase.from('exercises').update({
        name: form.name.trim(),
        muscle_group: form.muscle_group.trim(),
      }).eq('id', editingId)
    }
    await fetchExercises()
    setSaving(false)
    backToList()
  }

  async function handleDelete(id) {
    setDeletingId(id)
    await supabase.from('exercises').delete().eq('id', id)
    setExercises(prev => prev.filter(e => e.id !== id))
    setDeletingId(null)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') mode === 'list' ? onClose() : backToList()
  }

  const grouped = exercises.reduce((acc, ex) => {
    const key = ex.muscle_group
    if (!acc[key]) acc[key] = []
    acc[key].push(ex)
    return acc
  }, {})
  const sortedGroups = Object.keys(grouped).sort()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-lg bg-gray-900 border border-gray-800 rounded-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800 shrink-0">
          <h2 className="text-sm tracking-widest uppercase text-gray-400">
            {mode === 'list' ? 'Exercise Bank' : mode === 'add' ? 'Add Exercise' : 'Edit Exercise'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-white transition-colors text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-5 flex-1">
          {mode === 'list' ? (
            loading ? (
              <p className="text-xs text-gray-600">Loading…</p>
            ) : exercises.length === 0 ? (
              <p className="text-xs text-gray-600">No exercises yet. Add your first one below.</p>
            ) : (
              <div className="space-y-5">
                {sortedGroups.map(group => (
                  <div key={group}>
                    <p className="text-xs tracking-widest uppercase text-gray-500 mb-2">{group}</p>
                    <div className="space-y-1">
                      {grouped[group].map(ex => (
                        <div
                          key={ex.id}
                          className="flex items-center justify-between py-2 px-3 rounded bg-gray-800/50 group"
                        >
                          <span className="text-sm text-white">{ex.name}</span>
                          <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEdit(ex)}
                              className="text-xs tracking-widest uppercase text-gray-400 hover:text-emerald-400 transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(ex.id)}
                              disabled={deletingId === ex.id}
                              className="text-xs tracking-widest uppercase text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50"
                            >
                              {deletingId === ex.id ? '…' : 'Del'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="space-y-4" onKeyDown={handleKeyDown}>
              <div>
                <label className="block text-xs tracking-widest uppercase text-gray-400 mb-1">
                  Exercise name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Bench Press"
                  autoFocus
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-400"
                />
              </div>
              <div>
                <label className="block text-xs tracking-widest uppercase text-gray-400 mb-1">
                  Muscle group
                </label>
                <input
                  type="text"
                  list="muscle-group-options"
                  value={form.muscle_group}
                  onChange={e => setForm(f => ({ ...f, muscle_group: e.target.value }))}
                  placeholder="e.g. Chest"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-400"
                />
                <datalist id="muscle-group-options">
                  {MUSCLE_GROUPS.map(g => <option key={g} value={g} />)}
                </datalist>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 p-5 border-t border-gray-800 shrink-0">
          {mode === 'list' ? (
            <>
              <button
                onClick={openAdd}
                className="px-4 py-2 bg-emerald-400 text-gray-950 text-xs font-bold tracking-widest uppercase rounded hover:bg-emerald-300 transition-colors"
              >
                + Add exercise
              </button>
              <button
                onClick={onClose}
                className="text-xs text-gray-500 hover:text-white tracking-widest uppercase transition-colors"
              >
                Close
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim() || !form.muscle_group.trim()}
                className="px-4 py-2 bg-emerald-400 text-gray-950 text-xs font-bold tracking-widest uppercase rounded hover:bg-emerald-300 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save exercise'}
              </button>
              <button
                onClick={backToList}
                className="text-xs text-gray-500 hover:text-white tracking-widest uppercase transition-colors"
              >
                Cancel
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
