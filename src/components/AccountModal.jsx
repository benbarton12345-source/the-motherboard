import { useState } from 'react'
import { supabase } from '../supabase'
import { useCurrency } from '../CurrencyContext'
import { localDate } from '../utils/taskHelpers'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

// Account detail modal — current balance, full trend chart, an unrestricted-date
// "Add Entry" form, and reverse-chronological entry history. Balances are stored
// in the account's NATIVE currency; the chart/current balance/history render in
// the active display currency, while the Add Entry input is in native currency
// (labelled) since that's what's persisted.
export default function AccountModal({ account, history, onClose, onSaved }) {
  const { convert, format } = useCurrency()
  const [date, setDate] = useState(localDate())
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  const nativeSym = account.currency === 'GBP' ? '£' : 'A$'
  const disp = native => format(convert(Number(native) || 0, account.currency))

  const asc = history || []
  const current = asc.length ? Number(asc[asc.length - 1].balance) : 0
  const first = asc.length ? Number(asc[0].balance) : 0
  const growthPct = asc.length > 1 && first !== 0 ? ((current - first) / Math.abs(first)) * 100 : null
  const chartData = asc.map(r => ({
    date: r.snapshot_date.slice(5), // MM-DD
    value: Math.round(convert(Number(r.balance) || 0, account.currency)),
  }))
  // History newest-first, each row carrying its change vs the previous entry.
  const rows = asc
    .map((r, i) => {
      const bal = Number(r.balance)
      const prev = i > 0 ? Number(asc[i - 1].balance) : null
      const deltaPct = prev != null && prev !== 0 ? ((bal - prev) / Math.abs(prev)) * 100 : null
      return { ...r, deltaPct }
    })
    .reverse()

  async function addEntry() {
    const bal = parseFloat(amount)
    if (isNaN(bal) || !date) return
    setBusy(true)
    await supabase.from('account_snapshots').upsert(
      { account_id: account.id, snapshot_date: date, balance: bal },
      { onConflict: 'account_id,snapshot_date' })
    setAmount('')
    setBusy(false)
    onSaved?.()
  }

  async function deleteEntry(id) {
    await supabase.from('account_snapshots').delete().eq('id', id)
    onSaved?.()
  }

  const inputCls = 'bg-gray-950 border border-gray-800 rounded px-2.5 py-2 text-white text-sm focus:outline-none focus:border-emerald-400/60'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="w-full max-w-xl bg-gray-900 border border-gray-800 rounded-lg flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-800 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white">{account.name}</h2>
              <span className="text-[9.5px] font-bold tracking-wider text-gray-400 border border-gray-700 rounded px-1.5 py-0.5">{account.country}</span>
            </div>
            <div className="flex items-baseline gap-2.5 mt-2">
              <span className="text-2xl font-extrabold text-white">{disp(current)}</span>
              {growthPct !== null && (
                <span className={`text-[12.5px] font-bold ${growthPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {growthPct >= 0 ? '▲' : '▼'} {Math.abs(growthPct).toFixed(1)}%
                </span>
              )}
            </div>
            {growthPct !== null && (
              <div className="text-[11px] text-gray-500 mt-0.5">all-time · {asc.length} entries</div>
            )}
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-white text-xl leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto p-5 flex-1 space-y-5">
          {/* Trend chart */}
          {chartData.length > 1 ? (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="acctArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis hide domain={['dataMin', 'dataMax']} />
                  <Tooltip
                    contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#9ca3af' }}
                    formatter={v => [format(v), 'Balance']}
                  />
                  <Area type="monotone" dataKey="value" stroke="#34d399" strokeWidth={2.5} fill="url(#acctArea)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-sm text-gray-600">Not enough history to chart yet — add a second entry.</div>
          )}

          {/* Add entry */}
          <div className="border-t border-gray-800 pt-4">
            <div className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2.5">Add Entry</div>
            <div className="flex items-center gap-2">
              <input type="date" value={date} max={localDate()} onChange={e => setDate(e.target.value)} className={`flex-1 ${inputCls}`} />
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">{nativeSym}</span>
                <input
                  type="number" inputMode="decimal" value={amount} placeholder="balance"
                  onChange={e => setAmount(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addEntry()}
                  className={`w-32 ${inputCls}`}
                />
              </div>
              <button
                onClick={addEntry} disabled={busy || amount === ''}
                className="px-4 py-2 bg-emerald-400 text-gray-950 text-xs font-bold tracking-widest uppercase rounded hover:bg-emerald-300 transition-colors disabled:opacity-50"
              >{busy ? '…' : 'Add'}</button>
            </div>
            <div className="text-[11px] text-gray-600 mt-1.5">Entered in {account.currency} (this account's native currency). Any date allowed.</div>
          </div>

          {/* History */}
          <div className="border-t border-gray-800 pt-4">
            <div className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-1">History</div>
            {asc.length === 0 ? (
              <div className="text-sm text-gray-600">No entries yet.</div>
            ) : (
              <div>
                {rows.map(r => (
                  <div key={r.id} className="group flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                    <span className="text-sm text-gray-400">{r.snapshot_date}</span>
                    <div className="flex items-center gap-3">
                      {r.deltaPct !== null && (
                        <span className={`text-[11px] font-semibold tabular-nums ${r.deltaPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {r.deltaPct >= 0 ? '+' : ''}{r.deltaPct.toFixed(1)}%
                        </span>
                      )}
                      <span className="text-sm text-white font-medium w-24 text-right">{disp(r.balance)}</span>
                      <button onClick={() => deleteEntry(r.id)} className="text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 text-lg leading-none transition-colors" title="Delete entry">×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-5 border-t border-gray-800 shrink-0">
          <button onClick={onClose} className="text-xs text-gray-500 hover:text-white tracking-widest uppercase transition-colors">Close</button>
        </div>
      </div>
    </div>
  )
}
