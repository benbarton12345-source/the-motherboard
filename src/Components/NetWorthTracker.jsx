import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const CATEGORIES = ['cash', 'investments', 'property', 'crypto', 'other']

export default function NetWorthTracker() {
  const [snapshots, setSnapshots] = useState([])
  const [form, setForm] = useState({
    cash: '', investments: '', property: '', crypto: '', other: ''
  })
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
    const total = CATEGORIES.reduce((sum, cat) => sum + (parseFloat(form[cat]) || 0), 0)
    const { error } = await supabase.from('net_worth_snapshots').insert([{
      date: new Date().toISOString().split('T')[0],
      cash: parseFloat(form.cash) || 0,
      investments: parseFloat(form.investments) || 0,
      property: parseFloat(form.property) || 0,
      crypto: parseFloat(form.crypto) || 0,
      other: parseFloat(form.other) || 0,
      total,
    }])
    if (!error) {
      setForm({ cash: '', investments: '', property: '', crypto: '', other: '' })
      setShowForm(false)
      fetchSnapshots()
    }
    setLoading(false)
  }

  const latest = snapshots[0]

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
        <div className="text-4xl font-bold text-white">
          £{latest ? latest.total.toLocaleString('en-GB', { minimumFractionDigits: 0 }) : '0'}
        </div>
        {latest && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {CATEGORIES.map(cat => (
              <div key={cat} className="bg-gray-800 rounded p-3">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{cat}</div>
                <div className="text-sm text-white font-medium">
                  £{latest[cat].toLocaleString('en-GB')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Freedom figure progress */}
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5 mb-6">
            {CATEGORIES.map(cat => (
              <div key={cat}>
                <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">{cat}</label>
                <input
                  type="number"
                  value={form[cat]}
                  onChange={e => setForm({ ...form, [cat]: e.target.value })}
                  placeholder="0"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400"
                />
              </div>
            ))}
          </div>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2 bg-emerald-400 text-gray-950 text-sm font-bold tracking-widest uppercase rounded hover:bg-emerald-300 transition-colors disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Snapshot'}
          </button>
        </div>
      )}

      {/* Snapshot history */}
      {snapshots.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h3 className="text-sm tracking-widest uppercase text-gray-400 mb-4">History</h3>
          <div className="space-y-2">
            {snapshots.map(s => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                <span className="text-sm text-gray-400">{new Date(s.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <span className="text-sm font-medium text-white">£{s.total.toLocaleString('en-GB')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}