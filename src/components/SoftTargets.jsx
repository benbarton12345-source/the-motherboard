import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { CATEGORIES, EXCLUDED_CATEGORY } from '../utils/categoryRules'

// Soft budget targets — advisory per-category monthly targets (AUD). Progress bar
// per category vs this month's actual spend; turns amber when over. Purely
// informational — never blocks. Targets persist to budget_targets (one row per
// category). Actuals are the month's expense budget_entries by category.
const fmtAud = v => `A$${Math.round(Number(v) || 0).toLocaleString('en-GB')}`
const TARGET_CATEGORIES = CATEGORIES.filter(c => c !== 'Miscellaneous')

export default function SoftTargets({ entries = [], selectedMonth, includeShared = true }) {
  const [targets, setTargets] = useState({}) // category -> amount
  const [draft, setDraft] = useState({})     // category -> in-progress input string
  const [txns, setTxns] = useState(null)     // this month's transactions (null until loaded)

  useEffect(() => {
    supabase.from('budget_targets').select('category,target_amount')
      .then(({ data }) => {
        if (data) setTargets(Object.fromEntries(data.map(t => [t.category, Number(t.target_amount)])))
      })
  }, [])

  useEffect(() => {
    let cancelled = false
    supabase.from('transactions').select('category,amount,tag').eq('month', selectedMonth)
      .then(({ data }) => { if (!cancelled) setTxns(data || []) })
    return () => { cancelled = true }
  }, [selectedMonth])

  // Actual spend per category this month — prefer per-transaction rows where they
  // exist, else fall back to the month's variable-expense budget_entries aggregates.
  const actualByCat = {}
  if (txns && txns.length > 0) {
    for (const t of txns) {
      if (t.category === EXCLUDED_CATEGORY) continue
      if (!includeShared && t.tag === 'shared') continue
      actualByCat[t.category] = (actualByCat[t.category] || 0) + (Number(t.amount) || 0)
    }
  } else {
    for (const e of entries) {
      if (e.type === 'expense' && e.category && e.category !== 'Recurring') {
        actualByCat[e.category] = (actualByCat[e.category] || 0) + (Number(e.amount) || 0)
      }
    }
  }

  async function saveTarget(category, raw) {
    const val = parseFloat(raw)
    setDraft(d => { const n = { ...d }; delete n[category]; return n })
    if (isNaN(val) || val <= 0) {
      // Clearing a target removes the row.
      setTargets(t => { const n = { ...t }; delete n[category]; return n })
      await supabase.from('budget_targets').delete().eq('category', category)
      return
    }
    setTargets(t => ({ ...t, [category]: val }))
    await supabase.from('budget_targets').upsert({ category, target_amount: val }, { onConflict: 'category' })
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm tracking-widest uppercase text-gray-400">Soft Budget Targets</h2>
        <span className="text-[10px] text-gray-600 uppercase tracking-widest">Advisory · amber when over</span>
      </div>
      <div className="text-[11px] text-gray-600 mb-4">Set a monthly target per category — it never blocks, just flags overspend.</div>

      <div className="space-y-3">
        {TARGET_CATEGORIES.map(cat => {
          const target = targets[cat]
          const actual = actualByCat[cat] || 0
          const pct = target > 0 ? Math.min(100, (actual / target) * 100) : 0
          const over = target > 0 && actual > target
          return (
            <div key={cat} className="flex items-center gap-4">
              <div className="w-36 shrink-0 text-sm text-white truncate">{cat}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-gray-500">{fmtAud(actual)}{target > 0 && <span className="text-gray-600"> / {fmtAud(target)}</span>}</span>
                  {over && <span className="text-amber-400 font-semibold">over by {fmtAud(actual - target)}</span>}
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-800 overflow-hidden">
                  {target > 0 && <div className={`h-1.5 rounded-full ${over ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${pct}%` }} />}
                </div>
              </div>
              <div className="w-24 shrink-0 flex items-center gap-1">
                <span className="text-xs text-gray-500">A$</span>
                <input
                  type="number" inputMode="decimal"
                  value={draft[cat] ?? (target ?? '')}
                  placeholder="—"
                  onChange={e => setDraft(d => ({ ...d, [cat]: e.target.value }))}
                  onBlur={e => saveTarget(cat, e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                  className="w-full bg-gray-950 border border-gray-800 rounded px-2 py-1 text-sm text-white text-right focus:outline-none focus:border-emerald-400/60"
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
