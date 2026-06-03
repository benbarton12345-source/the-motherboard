import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const CATEGORIES = ['Cash', 'Investments', 'Property', 'Crypto', 'Other']

const emptyEntry = { name: '', type: 'Cash', value: '' }

export default function NetWorthTracker() {
  const [snapshots, setSnapshots] = useState([])
  const [entries, setEntries] = useState([{ ...emptyEntry }])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    fetchSnapshots()
  }, [])

  async function fetchSnapshots() {
    const { data, error } = await supabase
      .from('net_worth_snapshots')
      .select('*')
      .order('date', { ascending: false })
    if (!error) setSnapshots(data)
  }

  async function handleSubmit() {
    setLoading(true)
    const validEntries = entries.filter(e => e.name && e.value)
    const total = validEntries.reduce((sum, e) => sum + (parseFloat(e.value) || 0), 0)
    const { error } = await supabase.from('net_worth_snapshots').insert([{
      date: new Date().toISOString().split('T')[0],
      entries: validEntries,
      total,
    }])
    if (!error) {
      setEntries([{ ...emptyEntry }])
      setShowForm(false)
      fetchSnapshots()
    }
    setLoading(false)
  }

  async function handleDelete(id) {
    await supabase.from('net_worth_snapshots').delete().eq('id', id)
    fetchSnapshots()
  }

  function addEntry() {
    setEntries([...entries, { ...emptyEntry }])
  }

  function removeEntry(index) {
    setEntries(entries.filter((_, i) => i !== index))
  }

  function updateEntry(index, field, value) {
    const updated = [...entries]
    updated[index] = { ...updated[index], [field]: value }
    setEntries(updated)
  }

  const latest = snapshots[0]

  const categoryTotals = latest
    ? CATEGORIES.reduce((acc, cat) => {
        acc[cat] = latest.entries
          .filter(e => e.type === cat)
          .reduce((sum, e) => sum + parseFloat(e.value || 0), 0)
        return acc
      }, {})
    : {}

  return (
    <div className="space-y-6">
      {/* Net worth display */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm tracking-widest uppercase text-gray-400">Net Worth</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-xs tracking-widest uppercase px-4 py-2 border border-emerald-400 text-emerald-400 rounded hover:bg-emerald-400 hover:text-gray-950 transition-colors"
          >
            {showForm ? 'Cancel' : 'Update'}
          </button>
        </div>
        <div className="text-4xl font-bold text-white mb-4">
          £{latest ? latest.total.toLocaleString('en-GB', { minimumFractionDigits: 0 }) : '0'}
        </div>
        {latest && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {CATEGORIES.map(cat => (
              <div key={cat} className="bg-gray-800 rounded p-3">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{cat}</div>
                <div className="text-sm text-white font-medium">
                  £{(categoryTotals[cat] || 0).toLocaleString('en-GB')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Freedom figure */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm tracking-widest uppercase text-gray-400">Freedom Figure</h2>
          <span className="text-xs text-gray-500">Target: £1,500,000</span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-2 mb-2">
          <div
            className="bg-emerald-400 h-2 rounded-full transition-all"
            style={{ width: `${Math.min(((latest?.total || 0) / 1500000) * 100, 100)}%` }}
          />
        </div>
        <div className="text-xs text-gray-500">
          {latest ? (((latest.total / 1500000) * 100).toFixed(1)) : '0.0'}% of target
        </div>
      </div>

      {/* Update form */}
      {showForm && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h3 className="text-sm tracking-widest uppercase text-gray-400 mb-4">New Snapshot</h3>
          <div className="space-y-3 mb-4">
            {entries.map((entry, index) => (
              <div key={index} className="grid grid-cols-12 gap-3 items-center">
                <div className="col-span-5">
                  <input
                    type="text"
                    value={entry.name}
                    onChange={e => updateEntry(index, 'name', e.target.value)}
                    placeholder="Account name"
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400"
                  />
                </div>
                <div className="col-span-3">
                  <select
                    value={entry.type}
                    onChange={e => updateEntry(index, 'type', e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-3">
                  <input
                    type="number"
                    value={entry.value}
                    onChange={e => updateEntry(index, 'value', e.target.value)}
                    placeholder="£0"
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400"
                  />
                </div>
                <div className="col-span-1 flex justify-center">
                  {entries.length > 1 && (
                    <button
                      onClick={() => removeEntry(index)}
                      className="text-gray-600 hover:text-red-400 transition-colors text-lg leading-none"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={addEntry}
              className="text-xs tracking-widest uppercase text-gray-400 hover:text-white transition-colors"
            >
              + Add account
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-6 py-2 bg-emerald-400 text-gray-950 text-sm font-bold tracking-widest uppercase rounded hover:bg-emerald-300 transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Snapshot'}
            </button>
          </div>
        </div>
      )}

      {/* Snapshot history */}
      {snapshots.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h3 className="text-sm tracking-widest uppercase text-gray-400 mb-4">History</h3>
          <div className="space-y-2">
            {snapshots.map(s => (
              <div key={s.id} className="border-b border-gray-800 last:border-0 pb-2">
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-400">
                    {new Date(s.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-white">£{s.total.toLocaleString('en-GB')}</span>
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="text-xs text-gray-600 hover:text-red-400 transition-colors tracking-widest uppercase"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                  {s.entries.map((e, i) => (
                    <div key={i} className="text-xs text-gray-500">
                      {e.name} — {e.type} — £{parseFloat(e.value).toLocaleString('en-GB')}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}