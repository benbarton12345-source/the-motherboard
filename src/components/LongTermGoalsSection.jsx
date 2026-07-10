import { useState } from 'react'
import { supabase } from '../supabase'
import { localDate } from '../utils/taskHelpers'

const PHASES = [
  { id: 'not_started', label: 'Not Started' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
]

// Long-term Goals — the aspirational bucket list. No deadline pressure, so no
// on-track/behind language even for numeric goals (e.g. Freedom Figure).
// Cards expand to a journal panel (phase pills + optional value update + a
// running dated diary from long_term_goal_journal). Done goals collapse into an
// "Achieved" section at the bottom.
export default function LongTermGoalsSection({ goals, setGoals, journal, setJournal }) {
  const [expandedId, setExpandedId] = useState(null)
  const [showAchieved, setShowAchieved] = useState(false)
  const [draft, setDraft] = useState('')            // journal textarea (per open card)
  const [valDraft, setValDraft] = useState('')       // numeric value input
  const [editingVal, setEditingVal] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', goal_type: 'boolean', target_value: '', unit: '' })

  const active = goals.filter(g => g.status !== 'done')
  const achieved = goals.filter(g => g.status === 'done')

  function toggleExpand(goal) {
    if (expandedId === goal.id) { setExpandedId(null); return }
    setExpandedId(goal.id)
    setDraft('')
    setEditingVal(false)
    setValDraft(goal.current_value != null ? String(goal.current_value) : '')
  }

  async function setStatus(goal, status) {
    await supabase.from('long_term_goals').update({ status }).eq('id', goal.id)
    setGoals(prev => prev.map(g => (g.id === goal.id ? { ...g, status } : g)))
  }

  async function saveValue(goal) {
    const v = parseFloat(valDraft)
    if (isNaN(v)) { setEditingVal(false); return }
    await supabase.from('long_term_goals').update({ current_value: v }).eq('id', goal.id)
    setGoals(prev => prev.map(g => (g.id === goal.id ? { ...g, current_value: v } : g)))
    setEditingVal(false)
  }

  async function addEntry(goal) {
    const text = draft.trim()
    if (!text) return
    const { data } = await supabase.from('long_term_goal_journal')
      .insert({ long_term_goal_id: goal.id, entry_date: localDate(), entry_text: text })
      .select().single()
    if (data) setJournal(prev => [data, ...prev])
    setDraft('')
  }

  async function addGoal() {
    const name = addForm.name.trim()
    if (!name) return
    const payload = {
      name,
      goal_type: addForm.goal_type,
      status: 'not_started',
      target_value: addForm.goal_type === 'numeric' && addForm.target_value !== '' ? parseFloat(addForm.target_value) : null,
      current_value: addForm.goal_type === 'numeric' ? 0 : null,
      unit: addForm.goal_type === 'numeric' ? (addForm.unit.trim() || null) : null,
    }
    const { data } = await supabase.from('long_term_goals').insert(payload).select().single()
    if (data) setGoals(prev => [...prev, data])
    setAddForm({ name: '', goal_type: 'boolean', target_value: '', unit: '' })
    setAdding(false)
  }

  async function deleteGoal(goal) {
    await supabase.from('long_term_goals').delete().eq('id', goal.id)
    setGoals(prev => prev.filter(g => g.id !== goal.id))
    setJournal(prev => prev.filter(j => j.long_term_goal_id !== goal.id))
    setExpandedId(null)
  }

  const inputCls = 'bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-400'

  function GoalCard({ goal }) {
    const expanded = expandedId === goal.id
    const entries = journal.filter(j => j.long_term_goal_id === goal.id)
    const isNumeric = goal.goal_type === 'numeric'
    const current = Number(goal.current_value) || 0
    const target = Number(goal.target_value) || 0
    const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0
    const phase = PHASES.find(p => p.id === goal.status)

    return (
      <div className="bg-gray-800/40 border border-gray-800 rounded-lg overflow-hidden">
        <button onClick={() => toggleExpand(goal)} className="w-full text-left p-4 hover:bg-gray-800/60 transition-colors">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-white truncate">{goal.name}</span>
            <span className="text-[10px] text-gray-500 uppercase tracking-widest shrink-0">{phase?.label}</span>
          </div>
          {isNumeric && (
            <div className="mt-2">
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-base font-bold text-white">{current.toLocaleString()}</span>
                <span className="text-xs text-gray-500">/ {target.toLocaleString()}{goal.unit ? ` ${goal.unit}` : ''}</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-1.5">
                <div className="h-1.5 rounded-full bg-emerald-400 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
        </button>

        {expanded && (
          <div className="px-4 pb-4 space-y-3 border-t border-gray-800 pt-3">
            {/* Phase selector */}
            <div className="flex items-center gap-1.5">
              {PHASES.map(p => (
                <button
                  key={p.id}
                  onClick={e => { e.stopPropagation(); setStatus(goal, p.id) }}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                    goal.status === p.id
                      ? 'bg-emerald-400 border-emerald-400 text-gray-950 font-medium'
                      : 'border-gray-700 text-gray-400 hover:border-emerald-400 hover:text-emerald-400'
                  }`}
                >{p.label}</button>
              ))}
            </div>

            {/* Numeric value update */}
            {isNumeric && (
              editingVal ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number" value={valDraft}
                    onChange={e => setValDraft(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveValue(goal)}
                    className={`w-32 ${inputCls}`}
                    autoFocus
                  />
                  <button onClick={() => saveValue(goal)} className="text-xs text-emerald-400 hover:text-emerald-300 uppercase tracking-widest">Save</button>
                  <button onClick={() => setEditingVal(false)} className="text-xs text-gray-500 hover:text-white uppercase tracking-widest">Cancel</button>
                </div>
              ) : (
                <button onClick={() => { setEditingVal(true); setValDraft(String(current)) }} className="text-xs tracking-widest uppercase px-2.5 py-1 border border-gray-700 text-gray-400 rounded hover:border-emerald-400 hover:text-emerald-400 transition-colors">
                  Update current value
                </button>
              )
            )}

            {/* Journal */}
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Journal</div>
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="Add a note…"
                rows={2}
                className={`w-full ${inputCls} resize-none`}
              />
              <div className="flex items-center gap-3 mt-2">
                <button onClick={() => addEntry(goal)} disabled={!draft.trim()} className="text-xs text-emerald-400 hover:text-emerald-300 uppercase tracking-widest disabled:opacity-40">Add Entry</button>
                <button onClick={() => deleteGoal(goal)} className="text-xs text-gray-600 hover:text-red-400 uppercase tracking-widest ml-auto">Delete goal</button>
              </div>
              {entries.length > 0 && (
                <div className="mt-3 space-y-2">
                  {entries.map(e => (
                    <div key={e.id} className="text-xs text-gray-300 leading-snug">
                      <span className="text-gray-500 mr-2">{e.entry_date}</span>
                      {e.entry_text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm tracking-widest uppercase text-gray-400">Long-term Goals</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {active.length === 0 && achieved.length === 0 && <div className="text-sm text-gray-600">No long-term goals set</div>}
        {active.map(goal => <GoalCard key={goal.id} goal={goal} />)}
      </div>

      {achieved.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowAchieved(s => !s)}
            className="text-xs text-gray-500 hover:text-white uppercase tracking-widest transition-colors"
          >Achieved ({achieved.length}) {showAchieved ? '▲' : '▼'}</button>
          {showAchieved && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              {achieved.map(goal => <GoalCard key={goal.id} goal={goal} />)}
            </div>
          )}
        </div>
      )}

      <div className="mt-4">
        {adding ? (
          <div className="p-3 bg-gray-800/60 rounded-lg space-y-2 max-w-md">
            <input
              value={addForm.name}
              onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Goal name"
              className={`w-full ${inputCls}`}
              autoFocus
            />
            <select value={addForm.goal_type} onChange={e => setAddForm(f => ({ ...f, goal_type: e.target.value }))} className={`w-full ${inputCls} appearance-none`}>
              <option value="boolean">Boolean milestone</option>
              <option value="numeric">Numeric target</option>
            </select>
            {addForm.goal_type === 'numeric' && (
              <div className="flex items-center gap-2">
                <input type="number" placeholder="Target value" value={addForm.target_value} onChange={e => setAddForm(f => ({ ...f, target_value: e.target.value }))} className={`w-32 ${inputCls}`} />
                <input placeholder="Unit (e.g. £)" value={addForm.unit} onChange={e => setAddForm(f => ({ ...f, unit: e.target.value }))} className={`flex-1 ${inputCls}`} />
              </div>
            )}
            <div className="flex items-center gap-3">
              <button onClick={addGoal} disabled={!addForm.name.trim()} className="text-xs text-emerald-400 hover:text-emerald-300 uppercase tracking-widest disabled:opacity-40">Add</button>
              <button onClick={() => setAdding(false)} className="text-xs text-gray-500 hover:text-white uppercase tracking-widest">Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="text-xs tracking-widest uppercase px-3 py-1.5 border border-emerald-400 text-emerald-400 rounded hover:bg-emerald-400 hover:text-gray-950 transition-colors"
          >+ Add Long-term Goal</button>
        )}
      </div>
    </div>
  )
}
