import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { CATEGORIES } from '../utils/categoryRules'

// Bulk-edit transactions — a plain table of the month's imported transactions for
// quick recategorisation and shared/individual tagging after the fact. Separate
// from the 5-step import modal. AUD-only. Inline: change category (dropdown) or
// flip the shared/individual tag (single click, no modal). Calls onChanged so the
// insight views recompute. Collapsed by default to stay out of the way.
const fmtAud = v => `A$${(Number(v) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function BulkEditTransactions({ selectedMonth, onChanged }) {
  const monthDate = selectedMonth // already a first-of-month date (YYYY-MM-01)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase.from('transactions').select('*').eq('month', monthDate).order('tx_date', { ascending: false })
      .then(({ data }) => { if (!cancelled) { setRows(data || []); setLoading(false) } })
    return () => { cancelled = true }
  }, [monthDate])

  async function setCategory(id, category) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, category } : r))
    await supabase.from('transactions').update({ category }).eq('id', id)
    onChanged?.()
  }

  async function toggleTag(id) {
    const row = rows.find(r => r.id === id)
    const tag = row.tag === 'shared' ? 'individual' : 'shared'
    setRows(prev => prev.map(r => r.id === id ? { ...r, tag } : r))
    await supabase.from('transactions').update({ tag }).eq('id', id)
    onChanged?.()
  }

  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const sharedCount = rows.filter(r => r.tag === 'shared').length

  const cardCls = 'bg-gray-900 border border-gray-800 rounded-lg p-6'
  const cellInput = 'bg-gray-950 border border-gray-800 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-emerald-400/60'

  return (
    <div className={cardCls}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm tracking-widest uppercase text-gray-400">Transactions</h2>
          <span className="text-[11px] text-gray-600">{rows.length} this month · {sharedCount} shared</span>
        </div>
        <span className="text-xs text-gray-500">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        loading ? (
          <div className="text-sm text-gray-600 mt-4">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-gray-600 mt-4">No transactions for this month yet. They appear here after a statement import.</div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-[70px_1fr_150px_100px_110px] gap-3 pb-2 border-b border-gray-800 text-[10px] text-gray-500 uppercase tracking-widest">
                <div>Date</div><div>Merchant</div><div>Category</div><div className="text-right">Amount</div><div className="text-center">Tag</div>
              </div>
              {rows.map(r => (
                <div key={r.id} className="grid grid-cols-[70px_1fr_150px_100px_110px] gap-3 py-2 border-b border-gray-800/70 last:border-0 items-center">
                  <div className="text-xs text-gray-500 tabular-nums">{r.tx_date.slice(5)}</div>
                  <div className="text-sm text-white truncate" title={r.merchant}>{r.merchant}</div>
                  <select value={r.category} onChange={e => setCategory(r.id, e.target.value)} className={`${cellInput} w-full`}>
                    {!CATEGORIES.includes(r.category) && <option value={r.category}>{r.category}</option>}
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <div className="text-sm text-white text-right tabular-nums">{fmtAud(r.amount)}</div>
                  <div className="flex justify-center">
                    <button
                      onClick={() => toggleTag(r.id)}
                      className={`px-2.5 py-1 rounded-md text-[10.5px] font-bold tracking-wide border transition-colors ${
                        r.tag === 'shared'
                          ? 'bg-blue-400/10 text-blue-400 border-blue-400/40'
                          : 'bg-transparent text-gray-500 border-white/10 hover:border-white/25'
                      }`}
                      title="Toggle shared / individual"
                    >{r.tag === 'shared' ? 'SHARED' : 'INDIVIDUAL'}</button>
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-[70px_1fr_150px_100px_110px] gap-3 pt-3 text-sm font-semibold">
                <div /><div /><div className="text-gray-500 text-right uppercase tracking-widest text-[10px] self-center">Total</div>
                <div className="text-white text-right tabular-nums">{fmtAud(total)}</div><div />
              </div>
            </div>
          </div>
        )
      )}
    </div>
  )
}
