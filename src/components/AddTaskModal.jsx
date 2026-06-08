import { useState } from 'react'
import Modal from './Modal'

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function AddTaskModal({ title = 'Add Task', onClose, onSave, initial = {}, saving = false, lockRecurring = false }) {
  const [form, setForm] = useState({
    text: '',
    date: localDate(),
    time: '',
    priority: 'MEDIUM',
    is_recurring: false,
    recurrence_frequency: 'daily',
    recurrence_day_of_week: 0,
    recurrence_day_of_month: 1,
    add_to_cal: false,
    ...initial,
  })

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const inputCls = 'bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm w-full focus:outline-none focus:border-emerald-400'
  const labelCls = 'block text-xs text-gray-500 uppercase tracking-widest mb-1.5'
  const freqBtnCls = active => `px-3 py-1.5 text-xs tracking-widest uppercase rounded border transition-colors ${
    active ? 'border-emerald-400 text-emerald-400' : 'border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
  }`
  const dayBtnCls = active => `w-9 h-9 text-xs rounded border transition-colors ${
    active ? 'border-emerald-400 text-emerald-400' : 'border-gray-700 text-gray-500 hover:border-gray-500'
  }`

  return (
    <Modal
      title={title}
      onClose={onClose}
      onSave={() => onSave(form)}
      saveDisabled={!form.text.trim() || (!form.is_recurring && !form.date)}
      saving={saving}
    >
      <div>
        <label className={labelCls}>Task name</label>
        <input
          value={form.text}
          onChange={e => set('text', e.target.value)}
          onKeyDown={e => e.key === 'Enter' && form.text.trim() && onSave(form)}
          placeholder="What needs to be done?"
          className={inputCls}
          autoFocus
        />
      </div>

      {!form.is_recurring && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Date</label>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Time (optional)</label>
            <input
              type="time"
              value={form.time}
              onChange={e => {
                set('time', e.target.value)
                if (e.target.value) set('add_to_cal', true)
              }}
              className={inputCls}
            />
          </div>
        </div>
      )}

      <div>
        <label className={labelCls}>Priority</label>
        <select value={form.priority} onChange={e => set('priority', e.target.value)} className={inputCls}>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
      </div>

      {!lockRecurring && (
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div
            onClick={() => set('is_recurring', !form.is_recurring)}
            className={`w-9 h-5 rounded-full transition-colors relative shrink-0 cursor-pointer ${form.is_recurring ? 'bg-emerald-400' : 'bg-gray-700'}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.is_recurring ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-sm text-gray-400">Recurring task</span>
        </label>
      )}

      {form.is_recurring && (
        <div className="space-y-3 pl-3 border-l border-gray-700">
          <div>
            <label className={labelCls}>Frequency</label>
            <div className="flex gap-2">
              {['daily', 'weekly', 'monthly'].map(f => (
                <button key={f} onClick={() => set('recurrence_frequency', f)} className={freqBtnCls(form.recurrence_frequency === f)}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {form.recurrence_frequency === 'weekly' && (
            <div>
              <label className={labelCls}>Day of week</label>
              <div className="flex flex-wrap gap-1.5">
                {DAY_LABELS.map((day, i) => (
                  <button key={i} onClick={() => set('recurrence_day_of_week', i)} className={dayBtnCls(form.recurrence_day_of_week === i)}>
                    {day}
                  </button>
                ))}
              </div>
            </div>
          )}

          {form.recurrence_frequency === 'monthly' && (
            <div>
              <label className={labelCls}>Day of month</label>
              <select value={form.recurrence_day_of_month} onChange={e => set('recurrence_day_of_month', Number(e.target.value))} className={inputCls}>
                {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className={labelCls}>Time (optional — places on calendar)</label>
            <input
              type="time"
              value={form.time}
              onChange={e => set('time', e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
      )}

      {!form.is_recurring && (
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.add_to_cal}
            onChange={e => set('add_to_cal', e.target.checked)}
            className="accent-emerald-400"
          />
          Add to calendar
        </label>
      )}
    </Modal>
  )
}
