import { useState } from 'react'
import { supabase } from '../supabase'
import Modal from './Modal'
import { localDate } from '../utils/taskHelpers'

// Bulk "New Snapshot" — one unrestricted date, then the balance for every account
// in a single pass. Each input is prefilled with the account's latest known
// balance (native currency) so an unchanged account carries forward. Writes one
// account_snapshots row per account for the chosen date.
export default function NewSnapshotModal({ accounts, latestByAccount, onClose, onSaved }) {
  const [date, setDate] = useState(localDate())
  const [values, setValues] = useState(() =>
    Object.fromEntries(accounts.map(a => {
      const v = latestByAccount[a.id]
      return [a.id, v != null ? String(v) : '']
    })))
  const [saving, setSaving] = useState(false)

  function setVal(id, v) { setValues(prev => ({ ...prev, [id]: v })) }

  async function save() {
    if (!date) return
    setSaving(true)
    const rows = accounts
      .filter(a => values[a.id] !== '' && !isNaN(parseFloat(values[a.id])))
      .map(a => ({ account_id: a.id, snapshot_date: date, balance: parseFloat(values[a.id]) }))
    if (rows.length) {
      await supabase.from('account_snapshots').upsert(rows, { onConflict: 'account_id,snapshot_date' })
    }
    setSaving(false)
    onSaved?.()
    onClose()
  }

  const inputCls = 'bg-gray-950 border border-gray-800 rounded px-2.5 py-1.5 text-white text-sm text-right focus:outline-none focus:border-emerald-400/60'

  return (
    <Modal
      title="New Snapshot"
      onClose={onClose}
      onSave={save}
      saveLabel="Save Snapshot"
      saving={saving}
      cancelLabel="Cancel"
      maxWidth="max-w-lg"
    >
      <div className="text-[12px] text-gray-500 -mt-1">One entry updates every account's balance for this date at once.</div>

      <div>
        <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Snapshot date</label>
        <input type="date" value={date} max={localDate()} onChange={e => setDate(e.target.value)} className="bg-gray-950 border border-gray-800 rounded px-2.5 py-2 text-white text-sm focus:outline-none focus:border-emerald-400/60 w-48" />
      </div>

      <div className="border-t border-gray-800 pt-1">
        {accounts.map(a => (
          <div key={a.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
            <div className="text-sm text-white font-medium">
              {a.name} <span className="text-gray-600 font-normal">({a.country})</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-500">{a.currency === 'GBP' ? '£' : 'A$'}</span>
              <input
                type="number" inputMode="decimal"
                value={values[a.id]}
                onChange={e => setVal(a.id, e.target.value)}
                className={`w-28 ${inputCls}`}
              />
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
