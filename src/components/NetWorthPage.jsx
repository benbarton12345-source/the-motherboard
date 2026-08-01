import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useCurrency } from '../CurrencyContext'
import { ASSET_GROUPS, classLabel } from '../utils/financeTaxonomy'
import { latestBalance, sparkPath, groupSnapshots } from '../utils/netWorthHelpers'
import AccountModal from './AccountModal'
import NewSnapshotModal from './NewSnapshotModal'

// UK/AU split as a ring donut with the dominant share in the centre. Amber full
// ring underneath, emerald arc on top for the UK portion.
function SplitDonut({ ukPct }) {
  const size = 132, sw = 15, r = (size - sw) / 2, c = size / 2
  const circ = 2 * Math.PI * r
  const ukLen = (circ * ukPct) / 100
  const dominant = ukPct >= 50 ? { label: 'UK', pct: ukPct } : { label: 'AUS', pct: 100 - ukPct }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <g transform={`rotate(-90 ${c} ${c})`}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#34d399" strokeWidth={sw}
          strokeDasharray={`${ukLen} ${circ - ukLen}`} />
        <circle cx={c} cy={c} r={r} fill="none" stroke="#f59e0b" strokeWidth={sw}
          strokeDasharray={`${circ - ukLen} ${ukLen}`} strokeDashoffset={-ukLen} />
      </g>
      <text x={c} y={c - 3} textAnchor="middle" style={{ fill: '#f1f3f5', fontSize: 23, fontWeight: 800 }}>{dominant.pct.toFixed(0)}%</text>
      <text x={c} y={c + 15} textAnchor="middle" style={{ fill: '#6b7280', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em' }}>{dominant.label}</text>
    </svg>
  )
}

// Net Worth — per-account snapshot model. Two-tier grouped list (Cash vs Invested
// Assets → Investments/Pension/Property/Other) with subtotals, per-account
// sparklines, a UK/AU split donut, a bulk "New Snapshot" flow, and a per-account
// detail modal. Whole page respects the app-wide GBP/AUD toggle: balances are
// stored native and converted on read.
export default function NetWorthPage() {
  const { convert, format } = useCurrency()
  const [accounts, setAccounts] = useState([])
  const [snaps, setSnaps] = useState({}) // account_id -> asc history
  const [expanded, setExpanded] = useState(
    Object.fromEntries(ASSET_GROUPS.map(g => [g.key, g.defaultExpanded])))
  const [openAccountId, setOpenAccountId] = useState(null)
  const [showSnapshot, setShowSnapshot] = useState(false)
  const [loading, setLoading] = useState(true)

  function refresh() {
    Promise.all([
      supabase.from('accounts').select('*').eq('active', true).order('created_at'),
      supabase.from('account_snapshots').select('*'),
    ]).then(([a, s]) => {
      if (a.data) setAccounts(a.data)
      if (s.data) setSnaps(groupSnapshots(s.data))
      setLoading(false)
    })
  }
  useEffect(() => { refresh() }, [])

  // ── Derived ─────────────────────────────────────────────────────────────────
  const nativeOf = a => latestBalance(snaps[a.id])
  const dispOf = a => convert(nativeOf(a), a.currency)
  const accountsOfClass = cls => accounts.filter(a => a.asset_class === cls)
  const total = accounts.reduce((sum, a) => sum + dispOf(a), 0)

  const ukTotal = accounts.filter(a => a.country === 'UK').reduce((s, a) => s + dispOf(a), 0)
  const auTotal = accounts.filter(a => a.country === 'AU').reduce((s, a) => s + dispOf(a), 0)
  const splitBase = ukTotal + auTotal
  const ukPct = splitBase > 0 ? (ukTotal / splitBase) * 100 : 0
  const auPct = 100 - ukPct

  const latestByAccount = Object.fromEntries(accounts.map(a => [a.id, nativeOf(a)]))
  const openAccount = accounts.find(a => a.id === openAccountId) || null

  // ── Account row (reused under Cash and each Invested sub-class) ──────────────
  function AccountRow({ a }) {
    const history = (snaps[a.id] || []).map(r => Number(r.balance))
    const up = history.length < 2 || history[history.length - 1] >= history[0]
    return (
      <button
        onClick={() => setOpenAccountId(a.id)}
        className="w-full flex items-center justify-between pl-9 pr-4 py-3 border-b border-gray-800/70 last:border-0 hover:bg-white/[0.02] transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-medium text-white truncate">{a.name}</span>
          <span className="text-[9.5px] font-bold tracking-wider text-gray-400 border border-gray-700 rounded px-1.5 py-0.5 shrink-0">{a.country}</span>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {history.length > 0 && (
            <svg viewBox="0 0 100 28" className="hidden sm:block w-[70px] h-[22px]">
              <path d={sparkPath(history)} fill="none" stroke={up ? '#34d399' : '#e35d4f'} strokeWidth="2" />
            </svg>
          )}
          <span className="text-[13px] font-semibold text-white w-20 sm:w-24 text-right">{format(dispOf(a))}</span>
        </div>
      </button>
    )
  }

  const cardCls = 'bg-gray-900 border border-gray-800 rounded-lg'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] font-bold tracking-widest uppercase text-gray-500">Total Net Worth</div>
          <div className="text-3xl font-extrabold text-white mt-1">{format(total)}</div>
        </div>
        <button
          onClick={() => setShowSnapshot(true)}
          disabled={accounts.length === 0}
          className="px-4 py-2.5 bg-emerald-400 text-gray-950 text-xs font-bold tracking-widest uppercase rounded-lg hover:bg-emerald-300 transition-colors disabled:opacity-50"
        >+ New Snapshot</button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-600">Loading…</div>
      ) : accounts.length === 0 ? (
        <div className={`${cardCls} p-6 text-sm text-gray-600`}>No accounts yet.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
          {/* Grouped list */}
          <div className="min-w-0 lg:col-span-3 space-y-3">
            {ASSET_GROUPS.map(g => {
              const groupAccounts = g.classes.flatMap(accountsOfClass)
              const subtotal = groupAccounts.reduce((s, a) => s + dispOf(a), 0)
              const isOpen = expanded[g.key]
              return (
                <div key={g.key} className={`${cardCls} overflow-hidden`}>
                  <button
                    onClick={() => setExpanded(e => ({ ...e, [g.key]: !e[g.key] }))}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-gray-500 text-xs w-3">{isOpen ? '▾' : '▸'}</span>
                      <span className="text-[13.5px] font-bold text-white">{g.label}</span>
                    </div>
                    <span className="text-[15px] font-extrabold text-white">{format(subtotal)}</span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-800">
                      {g.key === 'cash' ? (
                        accountsOfClass('cash').map(a => <AccountRow key={a.id} a={a} />)
                      ) : (
                        g.classes.map(cls => {
                          const accts = accountsOfClass(cls)
                          if (accts.length === 0) return null
                          const clsSubtotal = accts.reduce((s, a) => s + dispOf(a), 0)
                          return (
                            <div key={cls}>
                              <div className="flex items-center justify-between pl-5 pr-4 py-2 bg-white/[0.015] border-b border-gray-800/70">
                                <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">{classLabel(cls)}</span>
                                <span className="text-[12px] font-semibold text-gray-400">{format(clsSubtotal)}</span>
                              </div>
                              {accts.map(a => <AccountRow key={a.id} a={a} />)}
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Right column: UK/AU split + info */}
          <div className="min-w-0 lg:col-span-2 space-y-4">
            <div className={`${cardCls} p-5`}>
              <div className="text-[12px] font-bold uppercase tracking-widest text-gray-500 mb-4">UK / Australia split</div>
              <div className="flex items-center gap-6">
                <SplitDonut ukPct={ukPct} />
                <div className="flex-1 min-w-0 space-y-3">
                  {[
                    { label: 'UK', pct: ukPct, value: ukTotal, color: '#34d399' },
                    { label: 'Australia', pct: auPct, value: auTotal, color: '#f59e0b' },
                  ].map(row => (
                    <div key={row.label} className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: row.color }} />
                      <span className="text-[13px] font-medium text-gray-200 flex-1">{row.label}</span>
                      <span className="text-[13px] font-semibold text-white tabular-nums">{row.pct.toFixed(1)}%</span>
                      <span className="text-[11.5px] text-gray-500 tabular-nums w-16 text-right">{format(row.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={`${cardCls} p-5`}>
              <div className="text-[12px] font-bold uppercase tracking-widest text-gray-500 mb-2.5">Snapshot history</div>
              <p className="text-[12.5px] text-gray-400 leading-relaxed">
                Manual entry, on whatever date suits — every account keeps a full snapshot history, not just a running balance, so the trend lines stay accurate however often you update.
              </p>
            </div>
          </div>
        </div>
      )}

      {openAccount && (
        <AccountModal
          account={openAccount}
          history={snaps[openAccount.id] || []}
          onClose={() => setOpenAccountId(null)}
          onSaved={refresh}
        />
      )}
      {showSnapshot && (
        <NewSnapshotModal
          accounts={accounts}
          latestByAccount={latestByAccount}
          onClose={() => setShowSnapshot(false)}
          onSaved={refresh}
        />
      )}
    </div>
  )
}
