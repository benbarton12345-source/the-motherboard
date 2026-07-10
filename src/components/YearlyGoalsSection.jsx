import { useState } from 'react'
import { supabase } from '../supabase'
import { yearlyPaceStatus, PACE_META } from '../utils/productivityHelpers'

// Yearly Goals — numeric (Sauna 200x, Read 6 Books) and boolean/milestone
// (Run a Marathon) cards in one grid. Numeric goals get an ON TRACK / BEHIND /
// WAY BEHIND pace badge; boolean goals get a completion toggle and sort to the
// bottom once done. `linked_source`, if set, shows an auto-updating indicator
// and hides the manual update control (no linking behaviour is built yet).
export default function YearlyGoalsSection({ goals, setGoals }) {
  const year = new Date().getFullYear()

  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [updatingId, setUpdatingId] = useState(null)
  const [updateVal, setUpdateVal] = useState('')
  const [adding, setAdding] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', goal_type: 'numeric', target_value: '', unit: '', target_date: '' })

  // Freedom Figure belongs in Long-term Goals — never render it here even if a
  // legacy row exists in yearly_goals (leave the DB row untouched).
  const visible = goals.filter(g => !/freedom figure/i.test(g.name))
  const sorted = [...visible].sort((a, b) => {
    const aDone = a.goal_type === 'boolean' && a.done ? 1 : 0
    const bDone = b.goal_type === 'boolean' && b.done ? 1 : 0
    return aDone - bDone
  })

  async function addGoal() {
    const name = addForm.name.trim()
    if (!name) return
    const payload = {
      name,
      goal_type: addForm.goal_type,
      year,
      target_value: addForm.target_value !== '' ? parseFloat(addForm.target_value) : null,
      unit: addForm.goal_type === 'numeric' ? (addForm.unit.trim() || null) : null,
      target_date: addForm.target_date || null,
      current_value: 0,
      done: false,
    }
    const { data } = await supabase.from('yearly_goals').insert(payload).select().single()
    if (data) setGoals(prev => [...prev, data])
    setAddForm({ name: '', goal_type: 'numeric', target_value: '', unit: '', target_date: '' })
    setAdding(false)
  }

  function startEdit(goal) {
    setEditingId(goal.id)
    setEditForm({
      name: goal.name,
      target_value: goal.target_value ?? '',
      unit: goal.unit ?? '',
      target_date: goal.target_date ?? '',
    })
  }

  async function saveEdit(goal) {
    const name = editForm.name.trim()
    if (!name) { setEditingId(null); return }
    const payload = goal.goal_type === 'numeric'
      ? { name, target_value: editForm.target_value !== '' ? parseFloat(editForm.target_value) : null, unit: editForm.unit.trim() || null }
      : { name, target_date: editForm.target_date || null }
    await supabase.from('yearly_goals').update(payload).eq('id', goal.id)
    setGoals(prev => prev.map(g => (g.id === goal.id ? { ...g, ...payload } : g)))
    setEditingId(null)
  }

  async function deleteGoal(goal) {
    await supabase.from('yearly_goals').delete().eq('id', goal.id)
    setGoals(prev => prev.filter(g => g.id !== goal.id))
    setEditingId(null)
  }

  async function saveValue(goal) {
    const v = parseFloat(updateVal)
    if (isNaN(v)) { setUpdatingId(null); return }
    await supabase.from('yearly_goals').update({ current_value: v }).eq('id', goal.id)
    setGoals(prev => prev.map(g => (g.id === goal.id ? { ...g, current_value: v } : g)))
    setUpdatingId(null)
    setUpdateVal('')
  }

  async function toggleDone(goal) {
    const done = !goal.done
    await supabase.from('yearly_goals').update({ done }).eq('id', goal.id)
    setGoals(prev => prev.map(g => (g.id === goal.id ? { ...g, done } : g)))
  }

  const inputCls = 'bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-400'
  const cardCls = 'bg-gray-800/40 border border-gray-800 rounded-lg p-4'

  function EditForm({ goal }) {
    return (
      <div className="space-y-2">
        <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className={`w-full ${inputCls}`} autoFocus />
        {goal.goal_type === 'numeric' ? (
          <div className="flex items-center gap-2">
            <input type="number" placeholder="Target" value={editForm.target_value} onChange={e => setEditForm(f => ({ ...f, target_value: e.target.value }))} className={`w-24 ${inputCls}`} />
            <input placeholder="Unit" value={editForm.unit} onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))} className={`flex-1 ${inputCls}`} />
          </div>
        ) : (
          <input type="date" value={editForm.target_date} onChange={e => setEditForm(f => ({ ...f, target_date: e.target.value }))} className={`w-full ${inputCls}`} />
        )}
        <div className="flex items-center gap-3">
          <button onClick={() => saveEdit(goal)} className="text-xs text-emerald-400 hover:text-emerald-300 uppercase tracking-widest">Save</button>
          <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 hover:text-white uppercase tracking-widest">Cancel</button>
          <button onClick={() => deleteGoal(goal)} className="text-xs text-gray-600 hover:text-red-400 uppercase tracking-widest ml-auto">Delete</button>
        </div>
      </div>
    )
  }

  function NumericCard({ goal }) {
    const current = Number(goal.current_value) || 0
    const target = Number(goal.target_value) || 0
    const status = yearlyPaceStatus(current, target)
    const meta = PACE_META[status]
    const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0
    return (
      <div className={cardCls}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="text-sm text-white truncate">{goal.name}</span>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[10px] font-bold tracking-widest px-1.5 py-0.5 rounded border ${meta.text} ${meta.border}`}>{meta.label}</span>
            <button onClick={() => startEdit(goal)} className="text-gray-600 hover:text-white transition-colors text-xs" title="Edit goal">✎</button>
          </div>
        </div>
        <div className="flex items-baseline gap-1 mb-2">
          <span className="text-lg font-bold text-white">{current}</span>
          <span className="text-sm text-gray-500">/ {target}{goal.unit ? ` ${goal.unit}` : ''}</span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-1.5 mb-3">
          <div className={`h-1.5 rounded-full transition-all ${meta.bar}`} style={{ width: `${pct}%` }} />
        </div>
        {goal.linked_source ? (
          <div className="text-[11px] text-emerald-400/80">Auto-updating via {goal.linked_source}</div>
        ) : updatingId === goal.id ? (
          <div className="flex items-center gap-2">
            <input
              type="number" value={updateVal}
              onChange={e => setUpdateVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveValue(goal)}
              placeholder={String(current)}
              className={`w-24 ${inputCls}`}
              autoFocus
            />
            <button onClick={() => saveValue(goal)} className="text-xs text-emerald-400 hover:text-emerald-300 uppercase tracking-widest">Save</button>
            <button onClick={() => setUpdatingId(null)} className="text-xs text-gray-500 hover:text-white uppercase tracking-widest">Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => { setUpdatingId(goal.id); setUpdateVal(String(current)) }}
            className="text-xs tracking-widest uppercase px-2.5 py-1 border border-gray-700 text-gray-400 rounded hover:border-emerald-400 hover:text-emerald-400 transition-colors"
          >Update</button>
        )}
      </div>
    )
  }

  function BooleanCard({ goal }) {
    return (
      <div className={cardCls}>
        <div className="flex items-start gap-3">
          <button
            onClick={() => toggleDone(goal)}
            className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
              goal.done ? 'bg-emerald-400 border-emerald-400 text-gray-950' : 'border-gray-600 hover:border-emerald-400'
            }`}
          >
            {goal.done && <span className="text-xs font-bold">✓</span>}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-sm ${goal.done ? 'line-through text-gray-500' : 'text-white'} truncate`}>{goal.name}</span>
              <button onClick={() => startEdit(goal)} className="text-gray-600 hover:text-white transition-colors text-xs shrink-0" title="Edit goal">✎</button>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {goal.done ? 'Completed' : goal.target_date ? `Target: ${goal.target_date}` : 'Milestone'}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm tracking-widest uppercase text-gray-400">Yearly Goals — {year}</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sorted.length === 0 && <div className="text-sm text-gray-600">No yearly goals set</div>}
        {sorted.map(goal => (
          editingId === goal.id
            ? <div key={goal.id} className={cardCls}><EditForm goal={goal} /></div>
            : goal.goal_type === 'numeric'
              ? <NumericCard key={goal.id} goal={goal} />
              : <BooleanCard key={goal.id} goal={goal} />
        ))}
      </div>

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
              <option value="numeric">Numeric target</option>
              <option value="boolean">Boolean milestone</option>
            </select>
            {addForm.goal_type === 'numeric' ? (
              <div className="flex items-center gap-2">
                <input type="number" placeholder="Target value" value={addForm.target_value} onChange={e => setAddForm(f => ({ ...f, target_value: e.target.value }))} className={`w-28 ${inputCls}`} />
                <input placeholder="Unit (e.g. books)" value={addForm.unit} onChange={e => setAddForm(f => ({ ...f, unit: e.target.value }))} className={`flex-1 ${inputCls}`} />
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 shrink-0">Target date (optional)</span>
              <input type="date" value={addForm.target_date} onChange={e => setAddForm(f => ({ ...f, target_date: e.target.value }))} className={inputCls} />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={addGoal} disabled={!addForm.name.trim()} className="text-xs text-emerald-400 hover:text-emerald-300 uppercase tracking-widest disabled:opacity-40">Add</button>
              <button onClick={() => setAdding(false)} className="text-xs text-gray-500 hover:text-white uppercase tracking-widest">Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="text-xs tracking-widest uppercase px-3 py-1.5 border border-emerald-400 text-emerald-400 rounded hover:bg-emerald-400 hover:text-gray-950 transition-colors"
          >+ Add Goal</button>
        )}
      </div>
    </div>
  )
}
