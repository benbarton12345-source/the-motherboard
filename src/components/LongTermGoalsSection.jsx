import { useState } from 'react'
import { supabase } from '../supabase'
import { localDate } from '../utils/taskHelpers'

const PHASES = [
  { id: 'not_started', label: 'Not Started' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
]

// Status badge colours — not_started muted, in_progress amber, done emerald.
const STATUS_META = {
  not_started: { label: 'Not Started', cls: 'text-gray-500' },
  in_progress: { label: 'In Progress', cls: 'text-amber-400' },
  done: { label: 'Done', cls: 'text-emerald-400' },
}

// Active-pill colour per phase, so the selected pill matches the status colour.
const ACTIVE_PILL = {
  not_started: 'bg-gray-600 border-gray-600 text-white font-medium',
  in_progress: 'bg-amber-400 border-amber-400 text-gray-950 font-medium',
  done: 'bg-emerald-400 border-emerald-400 text-gray-950 font-medium',
}

const inputCls = 'bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-400'

// Stable top-level card. Kept out of the parent's render body so its journal
// textarea and inline edit inputs don't remount (and lose focus) on every
// keystroke — all drafts live in this card's own local state and only write to
// the parent / Supabase on an explicit action (Add Entry, Save, Confirm).
function LongTermGoalCard({ goal, entries, expanded, year, onToggleExpand, onSetStatus, onSaveValue, onAddEntry, onDelete, onSaveEdit, onPromote }) {
  const isNumeric = goal.goal_type === 'numeric'
  const isPromoted = goal.status === 'promoted'
  const current = Number(goal.current_value) || 0
  const target = Number(goal.target_value) || 0
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0
  const meta = STATUS_META[goal.status] || STATUS_META.not_started

  const [draft, setDraft] = useState('')
  const [editingVal, setEditingVal] = useState(false)
  const [valDraft, setValDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', timeframe: '', target_value: '', unit: '' })
  const [promoting, setPromoting] = useState(false)
  const [promoteForm, setPromoteForm] = useState({ target_date: '', target_value: '' })

  function startEdit(e) {
    e.stopPropagation()
    setEditForm({
      name: goal.name,
      timeframe: goal.timeframe ?? '',
      target_value: goal.target_value ?? '',
      unit: goal.unit ?? '',
    })
    setEditing(true)
  }
  function saveEdit() {
    const name = editForm.name.trim()
    if (!name) { setEditing(false); return }
    // Goal type stays fixed after creation — switching numeric<->boolean would
    // orphan existing progress data.
    const payload = { name, timeframe: editForm.timeframe.trim() || null }
    if (isNumeric) {
      payload.target_value = editForm.target_value !== '' ? parseFloat(editForm.target_value) : null
      payload.unit = editForm.unit.trim() || null
    }
    onSaveEdit(goal, payload)
    setEditing(false)
  }
  function commitValue() {
    const v = parseFloat(valDraft)
    if (!isNaN(v)) onSaveValue(goal, v)
    setEditingVal(false)
  }
  function submitEntry() {
    const text = draft.trim()
    if (!text) return
    onAddEntry(goal, text)
    setDraft('')
  }
  function confirmPromote() {
    onPromote(goal, { target_date: promoteForm.target_date, target_value: promoteForm.target_value })
    setPromoting(false)
  }

  return (
    <div className="bg-gray-800/40 border border-gray-800 rounded-lg overflow-hidden">
      <button onClick={() => onToggleExpand(goal)} className="w-full text-left p-4 hover:bg-gray-800/60 transition-colors">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-white truncate">{goal.name}</span>
          {isPromoted ? (
            <span className="text-[10px] uppercase tracking-widest shrink-0 text-emerald-400">Promoted to {year} goals</span>
          ) : (
            <span className={`text-[10px] uppercase tracking-widest shrink-0 ${meta.cls}`}>
              {goal.status === 'done' && '✓ '}{meta.label}
            </span>
          )}
        </div>
        {goal.timeframe && <div className="text-[11px] text-gray-500 mt-1">{goal.timeframe}</div>}
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
          {editing ? (
            <div className="space-y-2">
              <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="Name" className={`w-full ${inputCls}`} autoFocus />
              <input value={editForm.timeframe} onChange={e => setEditForm(f => ({ ...f, timeframe: e.target.value }))} placeholder="Timeframe (e.g. 2–3 years)" className={`w-full ${inputCls}`} />
              {isNumeric && (
                <div className="flex items-center gap-2">
                  <input type="number" placeholder="Target" value={editForm.target_value} onChange={e => setEditForm(f => ({ ...f, target_value: e.target.value }))} className={`w-28 ${inputCls}`} />
                  <input placeholder="Unit" value={editForm.unit} onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))} className={`flex-1 ${inputCls}`} />
                </div>
              )}
              <div className="flex items-center gap-3">
                <button onClick={saveEdit} className="text-xs text-emerald-400 hover:text-emerald-300 uppercase tracking-widest">Save</button>
                <button onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:text-white uppercase tracking-widest">Cancel</button>
              </div>
            </div>
          ) : (
            <>
              {/* Phase selector + edit */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {PHASES.map(p => (
                  <button
                    key={p.id}
                    onClick={e => { e.stopPropagation(); onSetStatus(goal, p.id) }}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                      goal.status === p.id
                        ? ACTIVE_PILL[p.id]
                        : 'border-gray-700 text-gray-400 hover:border-emerald-400 hover:text-emerald-400'
                    }`}
                  >{p.label}</button>
                ))}
                <button onClick={startEdit} className="ml-auto text-gray-600 hover:text-white transition-colors text-xs" title="Edit goal">✎ Edit</button>
              </div>

              {/* Numeric value update */}
              {isNumeric && (
                editingVal ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number" value={valDraft}
                      onChange={e => setValDraft(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && commitValue()}
                      className={`w-32 ${inputCls}`}
                      autoFocus
                    />
                    <button onClick={commitValue} className="text-xs text-emerald-400 hover:text-emerald-300 uppercase tracking-widest">Save</button>
                    <button onClick={() => setEditingVal(false)} className="text-xs text-gray-500 hover:text-white uppercase tracking-widest">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => { setEditingVal(true); setValDraft(String(current)) }} className="text-xs tracking-widest uppercase px-2.5 py-1 border border-gray-700 text-gray-400 rounded hover:border-emerald-400 hover:text-emerald-400 transition-colors">
                    Update current value
                  </button>
                )
              )}

              {/* Move to Yearly Goals */}
              {isPromoted ? (
                <div className="text-[11px] text-emerald-400/80">Promoted to {year} yearly goals — journal history kept below.</div>
              ) : promoting ? (
                <div className="p-3 bg-gray-800/60 rounded-lg space-y-2">
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest">Move to Yearly Goals</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 shrink-0 w-24">Target date</span>
                    <input type="date" value={promoteForm.target_date} onChange={e => setPromoteForm(f => ({ ...f, target_date: e.target.value }))} className={inputCls} />
                  </div>
                  {isNumeric && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 shrink-0 w-24">Target value</span>
                      <input type="number" value={promoteForm.target_value} onChange={e => setPromoteForm(f => ({ ...f, target_value: e.target.value }))} placeholder={target ? String(target) : ''} className={`w-32 ${inputCls}`} />
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <button onClick={confirmPromote} className="text-xs text-emerald-400 hover:text-emerald-300 uppercase tracking-widest">Confirm</button>
                    <button onClick={() => setPromoting(false)} className="text-xs text-gray-500 hover:text-white uppercase tracking-widest">Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setPromoteForm({ target_date: '', target_value: isNumeric && target ? String(target) : '' }); setPromoting(true) }}
                  className="text-xs tracking-widest uppercase px-2.5 py-1 border border-gray-700 text-gray-400 rounded hover:border-emerald-400 hover:text-emerald-400 transition-colors"
                >Move to Yearly Goals</button>
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
                  <button onClick={submitEntry} disabled={!draft.trim()} className="text-xs text-emerald-400 hover:text-emerald-300 uppercase tracking-widest disabled:opacity-40">Add Entry</button>
                  <button onClick={() => onDelete(goal)} className="text-xs text-gray-600 hover:text-red-400 uppercase tracking-widest ml-auto">Delete goal</button>
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
            </>
          )}
        </div>
      )}
    </div>
  )
}

// Long-term Goals — the aspirational bucket list. No deadline pressure, so no
// on-track/behind language even for numeric goals (e.g. Freedom Figure). Cards
// expand to a journal panel (phase pills + optional value update + a running
// dated diary). Done goals collapse into an "Achieved" section. "Move to Yearly
// Goals" promotes a goal into yearly_goals (status → 'promoted', journal kept).
export default function LongTermGoalsSection({ goals, setGoals, journal, setJournal, onPromoteToYearly }) {
  const year = new Date().getFullYear()
  const [expandedId, setExpandedId] = useState(null)
  const [showAchieved, setShowAchieved] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', goal_type: 'boolean', target_value: '', unit: '' })

  const active = goals.filter(g => g.status !== 'done')
  const achieved = goals.filter(g => g.status === 'done')

  function toggleExpand(goal) {
    setExpandedId(prev => (prev === goal.id ? null : goal.id))
  }

  async function setStatus(goal, status) {
    await supabase.from('long_term_goals').update({ status }).eq('id', goal.id)
    setGoals(prev => prev.map(g => (g.id === goal.id ? { ...g, status } : g)))
  }
  async function saveValue(goal, v) {
    await supabase.from('long_term_goals').update({ current_value: v }).eq('id', goal.id)
    setGoals(prev => prev.map(g => (g.id === goal.id ? { ...g, current_value: v } : g)))
  }
  async function addEntry(goal, text) {
    const { data } = await supabase.from('long_term_goal_journal')
      .insert({ long_term_goal_id: goal.id, entry_date: localDate(), entry_text: text })
      .select().single()
    if (data) setJournal(prev => [data, ...prev])
  }
  async function saveEdit(goal, payload) {
    await supabase.from('long_term_goals').update(payload).eq('id', goal.id)
    setGoals(prev => prev.map(g => (g.id === goal.id ? { ...g, ...payload } : g)))
  }
  async function deleteGoal(goal) {
    await supabase.from('long_term_goals').delete().eq('id', goal.id)
    setGoals(prev => prev.filter(g => g.id !== goal.id))
    setJournal(prev => prev.filter(j => j.long_term_goal_id !== goal.id))
    setExpandedId(null)
  }

  // Create a matching yearly_goals row and mark the long-term goal 'promoted'
  // (do NOT delete it — journal history is preserved, no cascade).
  async function promote(goal, { target_date, target_value }) {
    const payload = {
      name: goal.name,
      goal_type: goal.goal_type,
      target_value: goal.goal_type === 'numeric'
        ? (target_value !== '' ? parseFloat(target_value) : (goal.target_value ?? null))
        : null,
      unit: goal.goal_type === 'numeric' ? (goal.unit ?? null) : null,
      year,
      current_value: 0,
      done: false,
      target_date: target_date || null,
    }
    const { data } = await supabase.from('yearly_goals').insert(payload).select().single()
    if (data && onPromoteToYearly) onPromoteToYearly(data)
    await supabase.from('long_term_goals').update({ status: 'promoted' }).eq('id', goal.id)
    setGoals(prev => prev.map(g => (g.id === goal.id ? { ...g, status: 'promoted' } : g)))
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

  const cardProps = goal => ({
    goal,
    entries: journal.filter(j => j.long_term_goal_id === goal.id),
    expanded: expandedId === goal.id,
    year,
    onToggleExpand: toggleExpand,
    onSetStatus: setStatus,
    onSaveValue: saveValue,
    onAddEntry: addEntry,
    onDelete: deleteGoal,
    onSaveEdit: saveEdit,
    onPromote: promote,
  })

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm tracking-widest uppercase text-gray-400">Long-term Goals</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {active.length === 0 && achieved.length === 0 && <div className="text-sm text-gray-600">No long-term goals set</div>}
        {active.map(goal => <LongTermGoalCard key={goal.id} {...cardProps(goal)} />)}
      </div>

      {achieved.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowAchieved(s => !s)}
            className="text-xs text-gray-500 hover:text-white uppercase tracking-widest transition-colors"
          >Achieved ({achieved.length}) {showAchieved ? '▲' : '▼'}</button>
          {showAchieved && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              {achieved.map(goal => <LongTermGoalCard key={goal.id} {...cardProps(goal)} />)}
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
