import { useState } from 'react'
import { supabase } from '../supabase'
import { CATEGORIES } from '../utils/categoryRules'
import { parseCommbankCSV, parseAmexCSV, buildReview } from '../utils/statementParser'

// Statement Import & Reconciliation — 5-step modal (Upload → Processing → Review
// → Confirm → Success). Design tokens mapped to the app's existing Tailwind
// classes (gray-900 surfaces, gray-800 nested, violet = the import/recurring
// accent, blue/amber/emerald/red for the section + status accents).

// ── Month options (current + previous 3), local-date built ──────────
function monthOptions() {
  const now = new Date()
  const opts = []
  for (let i = 0; i < 4; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    opts.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    })
  }
  return opts
}

const fmtSize = (bytes) => bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// Frequency → monthly (mirrors FinancePage's toMonthly)
function toMonthly(amount, frequency) {
  const a = Number(amount) || 0
  switch (frequency) {
    case 'fortnightly': return a * 26 / 12
    case 'weekly': return a * 52 / 12
    case 'quarterly': return a / 3
    case 'annual': return a / 12
    default: return a // monthly
  }
}

function processingLabel(pct) {
  if (pct < 20) return 'Parsing CSV files…'
  if (pct < 40) return 'Matching recurring transactions…'
  if (pct < 60) return 'Applying keyword rules…'
  if (pct < 80) return 'Running AI categorisation…'
  return 'Finalising…'
}

export default function StatementImportModal({ onClose, onImported }) {
  const MONTHS = monthOptions()
  const [step, setStep] = useState('upload') // upload | processing | review | confirm | success
  const [month, setMonth] = useState(MONTHS[0])
  const [commbank, setCommbank] = useState(null) // { file, name, size }
  const [amex, setAmex] = useState(null)

  const [progress, setProgress] = useState(0)
  const [procLabel, setProcLabel] = useState('Parsing CSV files…')
  const [review, setReview] = useState(null)
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedSummary, setSavedSummary] = useState(null)

  const fileCount = (commbank ? 1 : 0) + (amex ? 1 : 0)

  // ── Review mutations ───────────────────────────────────────────────
  const h = {
    setRecurringStatus: (id, status) => setReview(r => ({ ...r, recurringItems: r.recurringItems.map(x => x.id === id ? { ...x, status } : x) })),
    toggleExpanded: (id) => setReview(r => ({ ...r, categories: r.categories.map(c => c.id === id ? { ...c, expanded: !c.expanded } : c) })),
    toggleExcluded: (id) => setReview(r => ({ ...r, categories: r.categories.map(c => c.id === id ? { ...c, excluded: !c.excluded } : c) })),
    toggleTxOneOff: (catId, i) => setReview(r => ({ ...r, categories: r.categories.map(c => c.id === catId ? { ...c, transactions: c.transactions.map((t, j) => j === i ? { ...t, oneOff: !t.oneOff } : t) } : c) })),
    startEdit: (cat) => { setEditingCategoryId(cat.id); setEditValue(String(cat.amount)) },
    cancelEdit: () => setEditingCategoryId(null),
    commitEdit: (id) => {
      const v = parseFloat(editValue)
      if (!isNaN(v) && v >= 0) setReview(r => ({ ...r, categories: r.categories.map(c => c.id === id ? { ...c, amount: v } : c) }))
      setEditingCategoryId(null)
    },
    setNRCategory: (id, cat) => setReview(r => ({ ...r, needsReviewItems: r.needsReviewItems.map(x => x.id === id ? { ...x, selectedCategory: cat } : x) })),
    setNRStatus: (id, status) => setReview(r => ({ ...r, needsReviewItems: r.needsReviewItems.map(x => x.id === id ? { ...x, status } : x) })),
    toggleNROneOff: (id) => setReview(r => ({ ...r, needsReviewItems: r.needsReviewItems.map(x => x.id === id ? { ...x, oneOff: !x.oneOff } : x) })),
  }

  function pickFile(setter) {
    return (e) => {
      const file = e.target.files?.[0]
      if (file) setter({ file, name: file.name, size: file.size })
      e.target.value = '' // allow re-selecting the same file
    }
  }

  // ── Run the full pipeline, driven alongside the progress animation ──
  async function runProcessing() {
    setStep('processing')
    setProgress(0)

    const work = (async () => {
      const txns = []
      if (commbank) txns.push(...parseCommbankCSV(await commbank.file.text()))
      if (amex) txns.push(...parseAmexCSV(await amex.file.text()))
      const built = buildReview(txns)

      // Layer 3 — AI fallback for keyword-unmatched transactions (single batched call)
      if (built.unmatchedForAI.length) {
        try {
          const resp = await fetch('/api/categorise-transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ merchants: built.unmatchedForAI.map(n => n.merchant), categories: CATEGORIES }),
          })
          const out = resp.ok ? await resp.json() : { categories: [] }
          built.unmatchedForAI.forEach((n, i) => { n.aiSuggested = out.categories?.[i] || 'Uncategorised' })
        } catch {
          built.unmatchedForAI.forEach(n => { n.aiSuggested = 'Uncategorised' })
        }
      }

      // Section A needs the recurring items' forecast amounts
      const { data: recItems } = await supabase.from('recurring_items').select('*')
      return buildReviewState(built, recItems || [], txns.length)
    })()

    // Progress animation (~2.4s) with the label sequence
    const started = Date.now()
    const DURATION = 2400
    await new Promise(resolve => {
      const iv = setInterval(() => {
        const pct = Math.min(100, Math.round((Date.now() - started) / DURATION * 100))
        setProgress(pct)
        setProcLabel(processingLabel(pct))
        if (pct >= 100) { clearInterval(iv); resolve() }
      }, 60)
    })

    const reviewState = await work
    setReview(reviewState)
    await new Promise(r => setTimeout(r, 380))
    setStep('review')
  }

  // ── Commit to database (nothing is written until here) ──────────────
  async function commitImport() {
    if (saving) return
    setSaving(true)
    const monthDate = `${month.value}-01`
    const confirmedRec = review.recurringItems.filter(x => x.status === 'confirmed')
    const included = review.categories.filter(c => !c.excluded)
    const confirmedC = review.needsReviewItems.filter(x => x.status === 'confirmed')

    // 1. Replace this month's variable spend: delete non-recurring expenses (manual +
    //    previously imported) and any prior import-tagged reimbursement income. Rows
    //    populated from recurring_items (recurring_item_id set) are left untouched.
    await supabase.from('budget_entries').delete().eq('month', monthDate).is('recurring_item_id', null).eq('type', 'expense')
    await supabase.from('budget_entries').delete().eq('month', monthDate).is('recurring_item_id', null).eq('type', 'income').like('notes', 'statement-import%')

    // 2. Recurring actuals → override the month's recurring_items budget row (forecast unchanged)
    for (const r of confirmedRec) {
      if (r.recurringItemId) {
        const { data } = await supabase.from('budget_entries')
          .update({ amount: round2(r.actualAmount) })
          .eq('month', monthDate).eq('recurring_item_id', r.recurringItemId).select()
        if (!data || data.length === 0) {
          await supabase.from('budget_entries').insert({
            month: monthDate, category: 'Recurring', type: r.type,
            amount: round2(r.actualAmount), currency: r.currency, notes: r.name, recurring_item_id: r.recurringItemId,
          })
        }
      } else {
        await supabase.from('budget_entries').insert({
          month: monthDate, category: r.type === 'income' ? 'Salary' : 'Rent', type: r.type,
          amount: round2(r.actualAmount), currency: 'AUD', notes: `statement-import: ${r.name}`, recurring_item_id: null,
        })
      }
    }

    // 3. Variable expense rows (aggregate B included + C confirmed by category).
    //    One-off flagged transactions are split into their OWN rows (one_off = true)
    //    so the insights layer can exclude specific transactions from averages.
    const catTotals = {}
    const oneOffRows = []
    for (const cat of included) {
      const oneOffTxns = cat.transactions.filter(t => t.oneOff)
      const oneOffSum = round2(oneOffTxns.reduce((a, t) => a + t.amount, 0))
      const main = round2(cat.amount - oneOffSum)
      if (main > 0) catTotals[cat.name] = round2((catTotals[cat.name] || 0) + main)
      for (const t of oneOffTxns) oneOffRows.push({ category: cat.name, amount: round2(t.amount), merchant: t.merchant })
    }
    let extraReimb = 0
    for (const it of confirmedC) {
      if (it.selectedCategory === 'Reimbursements') { extraReimb = round2(extraReimb + it.amount); continue }
      if (it.oneOff) { oneOffRows.push({ category: it.selectedCategory, amount: round2(it.amount), merchant: it.merchant }); continue }
      catTotals[it.selectedCategory] = round2((catTotals[it.selectedCategory] || 0) + it.amount)
    }
    const reimbTotal = round2(review.reimbursements.total + extraReimb)

    const inserts = []
    for (const [cat, amt] of Object.entries(catTotals)) {
      if (amt > 0) inserts.push({ month: monthDate, category: cat, type: 'expense', amount: amt, currency: 'AUD', notes: 'statement-import', recurring_item_id: null, one_off: false })
    }
    for (const r of oneOffRows) {
      inserts.push({ month: monthDate, category: r.category, type: 'expense', amount: r.amount, currency: 'AUD', notes: `statement-import: ${r.merchant}`, recurring_item_id: null, one_off: true })
    }
    if (reimbTotal > 0) {
      inserts.push({ month: monthDate, category: 'Reimbursements', type: 'income', amount: reimbTotal, currency: 'AUD', notes: 'statement-import', recurring_item_id: null, one_off: false })
    }
    if (inserts.length) await supabase.from('budget_entries').insert(inserts)

    // 3b. Per-transaction rows (going-forward). Every variable-spend transaction is
    //     written to `transactions` (merchant-level) so Insights, the bulk-edit table,
    //     and shared/individual tagging have real rows. Older months keep only their
    //     budget_entries aggregates. Replaces this month's transactions on re-import.
    const txRows = []
    for (const cat of included) {
      for (const t of cat.transactions) {
        txRows.push({
          tx_date: t.date || monthDate, merchant: t.merchant, category: cat.name,
          amount: round2(t.amount), currency: 'AUD', month: monthDate,
          source: t.source || 'statement-import', one_off: !!t.oneOff,
        })
      }
    }
    for (const it of confirmedC) {
      if (it.selectedCategory === 'Reimbursements') continue
      txRows.push({
        tx_date: it.date || monthDate, merchant: it.merchant, category: it.selectedCategory,
        amount: round2(it.amount), currency: 'AUD', month: monthDate,
        source: it.source || 'statement-import', one_off: !!it.oneOff,
      })
    }
    await supabase.from('transactions').delete().eq('month', monthDate)
    if (txRows.length) await supabase.from('transactions').insert(txRows)

    // 4. Audit trail
    await supabase.from('statement_imports').insert({
      statement_month: monthDate,
      commbank_filename: commbank?.name || null,
      amex_filename: amex?.name || null,
      transaction_count: review.txCount,
      category_totals: catTotals,
      reimbursements_total: reimbTotal,
    })

    const variableSpend = round2(Object.values(catTotals).reduce((a, b) => a + b, 0) + oneOffRows.reduce((a, r) => a + r.amount, 0))
    setSavedSummary({ month: month.label, txCount: review.txCount, variableSpend })
    setSaving(false)
    setStep('success')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className={`w-full bg-gray-900 border border-gray-800 rounded-lg flex flex-col max-h-[92vh] ${
          step === 'processing' ? 'max-w-[420px]' :
          step === 'review' ? 'max-w-[840px]' :
          step === 'confirm' ? 'max-w-[540px]' :
          step === 'success' ? 'max-w-[400px]' : 'max-w-[520px]'
        }`}
      >
        {step === 'upload' && (
          <UploadStep
            MONTHS={MONTHS} month={month} setMonth={setMonth}
            commbank={commbank} setCommbank={setCommbank}
            amex={amex} setAmex={setAmex}
            pickFile={pickFile} fileCount={fileCount}
            onCancel={onClose} onProcess={runProcessing}
          />
        )}

        {step === 'processing' && (
          <ProcessingStep progress={progress} label={procLabel} fileCount={fileCount} />
        )}

        {step === 'review' && review && (
          <ReviewStep
            review={review} month={month} h={h}
            editingCategoryId={editingCategoryId} editValue={editValue} setEditValue={setEditValue}
            onDiscard={onClose} onProceed={() => setStep('confirm')}
          />
        )}

        {step === 'confirm' && review && (
          <ConfirmStep review={review} month={month} saving={saving}
            onBack={() => setStep('review')} onClose={onClose} onCommit={commitImport} />
        )}

        {step === 'success' && savedSummary && (
          <SuccessStep summary={savedSummary} onDone={() => { onImported?.(savedSummary); onClose() }} />
        )}
      </div>
    </div>
  )
}

// ── Transform the parser output into interactive review state ────────
function buildReviewState(built, recItems, txCount) {
  const incomeItems = recItems.filter(i => i.type === 'income')
  const salaryItem = incomeItems.find(i => /\b(salary|wage|wages|lifenet)\b/i.test(i.name || '')) || incomeItems[0]
  const rentItem = recItems.find(i => /\brent\b/i.test(i.name || ''))

  const recurringItems = []
  if (built.recurring.salary.total > 0) {
    recurringItems.push({
      id: 'salary', name: salaryItem?.name || 'Salary',
      recurringItemId: salaryItem?.id || null, type: 'income', currency: salaryItem?.currency || 'AUD',
      forecastAmount: round2(toMonthly(salaryItem?.amount, salaryItem?.frequency)),
      actualAmount: built.recurring.salary.total,
      context: built.recurring.salary.count > 1 ? `${built.recurring.salary.count} pay periods this month (LIFENET)` : null,
      status: 'pending',
    })
  }
  if (built.recurring.rent.total > 0) {
    const li = built.recurring.rent.lauraIncoming
    recurringItems.push({
      id: 'rent', name: rentItem?.name || 'Rent',
      recurringItemId: rentItem?.id || null, type: 'expense', currency: rentItem?.currency || 'AUD',
      forecastAmount: round2(toMonthly(rentItem?.amount, rentItem?.frequency)),
      actualAmount: built.recurring.rent.total,
      context: li > 0 ? `DEFT PAYMENTS · $${li.toFixed(2)} incoming from flatmate excluded` : 'DEFT PAYMENTS',
      status: 'pending',
    })
  }

  const categories = Object.entries(built.confident).map(([name, v], i) => ({
    id: `cat-${i}`, name, amount: v.total, txCount: v.txns.length,
    excluded: false, expanded: false,
    transactions: v.txns.map(t => ({ ...t, oneOff: false })),
  })).sort((a, b) => b.amount - a.amount)

  const needsReviewItems = built.needsReview.map(n => ({
    id: n.id, date: n.date, merchant: n.merchant, amount: n.amount,
    aiSuggestedCategory: n.aiSuggested || null,
    selectedCategory: n.aiSuggested && n.aiSuggested !== 'Uncategorised' ? n.aiSuggested : '',
    status: 'pending', oneOff: false,
  }))

  return {
    recurringItems,
    reimbursements: { total: built.reimbursements.total, count: built.reimbursements.items.length },
    categories,
    needsReviewItems,
    excludedCount: built.excluded.length,
    txCount,
  }
}

// ── Step 1 — Upload ─────────────────────────────────────────────────
function UploadStep({ MONTHS, month, setMonth, commbank, setCommbank, amex, setAmex, pickFile, fileCount, onCancel, onProcess }) {
  return (
    <>
      <div className="flex items-center justify-between p-5 border-b border-gray-800 shrink-0">
        <h2 className="text-sm font-semibold text-white">Import Statement</h2>
        <button onClick={onCancel} className="text-gray-600 hover:text-white text-xl leading-none">&times;</button>
      </div>

      <div className="overflow-y-auto p-5 flex-1 space-y-4">
        <div>
          <label className="block text-[10px] tracking-widest uppercase text-gray-600 mb-2">Statement Month</label>
          <select
            value={month.value}
            onChange={e => setMonth(MONTHS.find(m => m.value === e.target.value))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-400"
          >
            {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        <div className="space-y-2.5">
          <UploadArea label="Commonwealth Bank" file={commbank} onPick={pickFile(setCommbank)} onRemove={() => setCommbank(null)} />
          <UploadArea label="American Express" file={amex} onPick={pickFile(setAmex)} onRemove={() => setAmex(null)} />
        </div>
      </div>

      <div className="flex items-center justify-between p-5 border-t border-gray-800 shrink-0">
        <button onClick={onCancel} className="text-xs tracking-widest uppercase text-gray-500 hover:text-white">Cancel</button>
        <button
          onClick={onProcess}
          disabled={fileCount === 0}
          className="px-4 py-2 bg-violet-500 hover:bg-violet-400 text-white text-xs font-bold tracking-widest uppercase rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Process Statements →
        </button>
      </div>
    </>
  )
}

function UploadArea({ label, file, onPick, onRemove }) {
  const loaded = !!file
  return (
    <div className={`flex items-center gap-3 rounded-lg p-4 border border-dashed ${loaded ? 'border-emerald-400/30 bg-emerald-400/5' : 'border-gray-700'}`}>
      <div className="w-9 h-9 rounded bg-white/5 flex items-center justify-center shrink-0 text-gray-400">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-medium text-white">{label}</div>
        <div className={`text-xs mt-0.5 truncate ${loaded ? 'text-emerald-400/70' : 'text-gray-500'}`}>
          {loaded ? `${file.name} · ${fmtSize(file.size)}` : 'CSV export · optional'}
        </div>
      </div>
      {loaded ? (
        <button onClick={onRemove} className="text-gray-600 hover:text-red-400 text-lg leading-none shrink-0 px-1">&times;</button>
      ) : (
        <label className="shrink-0 cursor-pointer text-[11px] tracking-widest uppercase text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 rounded px-2.5 py-1.5">
          Add CSV
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={onPick} />
        </label>
      )}
    </div>
  )
}

// ── Step 2 — Processing ─────────────────────────────────────────────
function ProcessingStep({ progress, label, fileCount }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-12">
      <div className="w-[42px] h-[42px] rounded-full border-[2.5px] border-gray-700 border-t-violet-500 animate-spin mb-6" />
      <div className="text-sm text-gray-200">{label}</div>
      <div className="text-xs text-gray-500 mt-2">{fileCount} file{fileCount === 1 ? '' : 's'} · keyword rules + AI categorisation</div>
      <div className="w-full max-w-[300px] mt-6">
        <div className="h-[3px] rounded bg-white/10 overflow-hidden">
          <div className="h-full rounded bg-gradient-to-r from-violet-500 to-blue-400 transition-[width] duration-150" style={{ width: `${progress}%` }} />
        </div>
        <div className="text-[11px] font-mono text-gray-500 text-right mt-1.5">{progress}%</div>
      </div>
    </div>
  )
}

// ── Formatting helpers ──────────────────────────────────────────────
const money = (n) => '$' + (Number(n) || 0).toFixed(2)
const signedMoney = (n) => (n > 0 ? '+' : n < 0 ? '-' : '') + '$' + Math.abs(Number(n) || 0).toFixed(2)
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtDay = (iso) => { const [, m, d] = (iso || '').split('-').map(Number); return d ? `${String(d).padStart(2, '0')} ${MON[m - 1]}` : '' }

// ── Step 3 — Review (Sections A / B / C) ────────────────────────────
function ReviewStep({ review, month, h, editingCategoryId, editValue, setEditValue, onDiscard, onProceed }) {
  const aTotal = review.recurringItems.length
  const aActioned = review.recurringItems.filter(x => x.status !== 'pending').length
  const included = review.categories.filter(c => !c.excluded)
  const bTotal = included.reduce((a, c) => a + c.amount, 0)
  const cActioned = review.needsReviewItems.filter(x => x.status !== 'pending').length
  const cPending = review.needsReviewItems.filter(x => x.status === 'pending').length
  const confirmedC = review.needsReviewItems.filter(x => x.status === 'confirmed')
  const totalSpend = bTotal + confirmedC.reduce((a, x) => a + x.amount, 0)
  const canProceed = cPending === 0

  return (
    <>
      <div className="flex items-center justify-between p-5 border-b border-gray-800 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-white">Review Import</h2>
          <p className="text-xs text-gray-500 mt-0.5">{month.label} · nothing is saved until you confirm</p>
        </div>
        <button onClick={onDiscard} className="text-gray-600 hover:text-white text-xl leading-none">&times;</button>
      </div>

      <div className="overflow-y-auto flex-1 pb-4">
        <SectionA items={review.recurringItems} reimb={review.reimbursements} actioned={aActioned} total={aTotal} h={h} />
        <SectionDivider label="Variable spending" />
        <SectionB categories={review.categories} included={included} bTotal={bTotal} h={h}
          editingCategoryId={editingCategoryId} editValue={editValue} setEditValue={setEditValue} />
        <SectionDivider label="Needs your review ↓" amber />
        <SectionC items={review.needsReviewItems} actioned={cActioned} pending={cPending} h={h} />
      </div>

      <div className="border-t border-gray-800 shrink-0">
        <div className="flex items-center gap-4 px-5 py-2.5 bg-gray-950/60 text-[11px]">
          <span className="text-gray-500">Transactions: <span className="text-gray-300 font-mono">{review.txCount}</span></span>
          <span className="text-gray-500">Total spend: <span className="text-gray-300 font-mono">{money(totalSpend)}</span></span>
          <div className="flex-1" />
          {cPending > 0 && <span className="text-amber-400">⚠ {cPending} item{cPending === 1 ? '' : 's'} in Needs Review still unactioned</span>}
        </div>
        <div className="flex items-center justify-between p-4">
          <button onClick={onDiscard} className="text-xs tracking-widest uppercase text-gray-500 hover:text-white">Discard</button>
          <button onClick={canProceed ? onProceed : undefined} disabled={!canProceed}
            className="px-4 py-2 bg-violet-500 hover:bg-violet-400 text-white text-xs font-bold tracking-widest uppercase rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            Review Summary →
          </button>
        </div>
      </div>
    </>
  )
}

function SectionDivider({ label, amber }) {
  return (
    <div className="flex items-center gap-3 px-5 my-4">
      <div className={`flex-1 h-px ${amber ? 'bg-amber-400/20' : 'bg-gray-800'}`} />
      <span className={`text-[10px] tracking-widest uppercase ${amber ? 'text-amber-400/70' : 'text-gray-600'}`}>{label}</span>
      <div className={`flex-1 h-px ${amber ? 'bg-amber-400/20' : 'bg-gray-800'}`} />
    </div>
  )
}

// ── Section A — Recurring Updates ───────────────────────────────────
function SectionA({ items, reimb, actioned, total, h }) {
  return (
    <div className="px-5 pt-5">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="w-[3px] h-3.5 rounded bg-violet-400" />
        <span className="text-[10px] tracking-widest uppercase font-bold text-violet-400">Recurring Updates</span>
        <span className="text-[10px] text-gray-500 border border-gray-700 rounded-full px-2 py-0.5">{total}</span>
        <div className="flex-1" />
        <span className="text-[11px] text-gray-500">{actioned} / {total} actioned</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">Confirm records the actual figure for this month — the standing forecast is not changed. Skip excludes this item from the import.</p>
      {items.length === 0 ? <p className="text-xs text-gray-600">No recurring transactions detected.</p> : (
        <div className="space-y-1.5">{items.map(it => <RecurringRow key={it.id} it={it} h={h} />)}</div>
      )}
      {reimb.total > 0 && (
        <div className="flex items-center justify-between mt-2 px-3 py-2.5 rounded-lg bg-emerald-400/5 border border-emerald-400/15">
          <span className="text-[13px] text-emerald-400">Reimbursements <span className="text-emerald-400/50 text-xs">· {reimb.count} incoming</span></span>
          <span className="text-sm font-mono text-emerald-400">{signedMoney(reimb.total)}</span>
        </div>
      )}
    </div>
  )
}

function RecurringRow({ it, h }) {
  const diff = it.actualAmount - it.forecastAmount
  const confirmed = it.status === 'confirmed'
  return (
    <div className={`rounded-lg border p-3 ${confirmed ? 'bg-emerald-400/5 border-emerald-400/20' : 'border-gray-800'}`}>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[120px]">
          <div className="text-sm text-white">{it.name}</div>
          {it.context && <div className="text-[11px] text-amber-400/70 mt-0.5">⚠ {it.context}</div>}
        </div>
        <div className="text-right w-16 shrink-0"><div className="text-[9px] uppercase tracking-wider text-gray-600">Forecast</div><div className="text-xs font-mono text-gray-400">{money(it.forecastAmount)}</div></div>
        <span className="text-gray-700">→</span>
        <div className="text-right w-16 shrink-0"><div className="text-[9px] uppercase tracking-wider text-gray-600">Actual</div><div className="text-xs font-mono text-white">{money(it.actualAmount)}</div></div>
        <div className="text-right w-16 shrink-0"><div className="text-[9px] uppercase tracking-wider text-gray-600">Diff</div>
          <div className={`text-xs font-mono ${diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-gray-600'}`}>{diff === 0 ? '—' : signedMoney(diff)}</div>
        </div>
        <div className="w-[128px] shrink-0 flex items-center justify-end gap-2">
          {it.status === 'pending' ? (
            <>
              <button onClick={() => h.setRecurringStatus(it.id, 'skipped')} className="text-[11px] text-gray-500 hover:text-white">Skip</button>
              <button onClick={() => h.setRecurringStatus(it.id, 'confirmed')} className="text-[11px] font-semibold text-emerald-400 border border-emerald-400/40 rounded px-2 py-1 hover:bg-emerald-400/10">Confirm →</button>
            </>
          ) : (
            <>
              <span className={`text-[11px] ${confirmed ? 'text-emerald-400' : 'text-gray-500'}`}>{confirmed ? '✓ Confirmed' : 'Skipped'}</span>
              <button onClick={() => h.setRecurringStatus(it.id, 'pending')} className="text-[11px] text-gray-500 hover:text-white">Undo</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Section B — Confident Categorisation ────────────────────────────
function SectionB({ categories, included, bTotal, h, editingCategoryId, editValue, setEditValue }) {
  return (
    <div className="px-5">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="w-[3px] h-3.5 rounded bg-blue-400" />
        <span className="text-[10px] tracking-widest uppercase font-bold text-blue-400">Confident Categorisation</span>
        <span className="text-[10px] text-gray-500 border border-gray-700 rounded-full px-2 py-0.5">{included.length} of {categories.length}</span>
        <div className="flex-1" />
        <span className="text-sm font-mono font-bold text-white">{money(bTotal)}</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">Matched by keyword rules with high confidence. Expand any category to inspect transactions.</p>
      {categories.length === 0 ? <p className="text-xs text-gray-600">No keyword-matched categories.</p> : (
        <div className="space-y-1.5">
          {categories.map(c => <CategoryRow key={c.id} c={c} h={h} editing={editingCategoryId === c.id} editValue={editValue} setEditValue={setEditValue} />)}
        </div>
      )}
    </div>
  )
}

// Visible one-off chip, shared by Section B (per-tx) and Section C rows.
// One-offs are split into their own budget_entries row and kept out of averages.
function OneOffToggle({ active, onClick }) {
  return (
    <button onClick={onClick} title="Mark as one-off (kept out of monthly spend averages)"
      className={`text-[9px] font-semibold uppercase tracking-wider rounded px-1.5 py-0.5 border shrink-0 transition-colors ${active ? 'text-amber-400 border-amber-400/50 bg-amber-400/10' : 'text-gray-400 border-gray-600 hover:text-amber-400 hover:border-amber-400/50'}`}>
      {active ? '1× one-off' : '1×'}
    </button>
  )
}

function CategoryRow({ c, h, editing, editValue, setEditValue }) {
  const shown = c.transactions.slice(0, 5)
  const more = c.transactions.length - shown.length
  const oneOffCount = c.transactions.filter(t => t.oneOff).length
  return (
    <div className={`rounded-lg border border-gray-800 ${c.excluded ? 'opacity-40' : ''}`}>
      <div className="flex items-center gap-2 p-3">
        <button onClick={() => !c.excluded && h.toggleExpanded(c.id)} disabled={c.excluded} className="text-gray-600 hover:text-white w-4 shrink-0 text-base leading-none">
          <span className={`inline-block transition-transform ${c.expanded ? 'rotate-90' : ''}`}>›</span>
        </button>
        <button onClick={() => !c.excluded && h.toggleExpanded(c.id)} className={`flex-1 text-left text-sm ${c.excluded ? 'text-gray-500 line-through' : 'text-white'}`}>{c.name}</button>
        {oneOffCount > 0 && !c.excluded && (
          <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-400 border border-amber-400/40 rounded px-1.5 py-0.5 shrink-0">{oneOffCount} one-off</span>
        )}
        {editing ? (
          <div className="flex items-center gap-1 shrink-0">
            <input autoFocus type="number" value={editValue} onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') h.commitEdit(c.id); if (e.key === 'Escape') h.cancelEdit() }}
              className="w-24 bg-gray-800 border border-violet-400/50 rounded px-2 py-1 text-sm text-white text-right font-mono focus:outline-none" />
            <button onClick={() => h.commitEdit(c.id)} className="text-emerald-400 text-sm">✓</button>
            <button onClick={h.cancelEdit} className="text-gray-500 text-sm">✕</button>
          </div>
        ) : (
          <span className="text-sm font-mono text-white w-24 text-right shrink-0">{money(c.amount)}</span>
        )}
        <span className="text-[11px] text-gray-600 w-7 text-right shrink-0">{c.txCount}</span>
        <div className="flex items-center gap-2 shrink-0">
          {!c.excluded && !editing && (
            <button onClick={() => h.startEdit(c)} title="Edit amount" className="text-gray-600 hover:text-white text-xs">✎</button>
          )}
          <button onClick={() => h.toggleExcluded(c.id)} className={`text-xs ${c.excluded ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-red-400'}`}>{c.excluded ? 'Include' : '×'}</button>
        </div>
      </div>
      {c.expanded && !c.excluded && (
        <div className="mx-3 mb-3 rounded bg-white/[0.02] p-2 space-y-0.5">
          {shown.map((t, i) => (
            <div key={i} className="flex items-center gap-3 text-[12.5px] py-0.5">
              <span className="w-11 text-[11px] font-mono text-gray-600 shrink-0">{fmtDay(t.date)}</span>
              <span className="flex-1 text-gray-300 truncate">{t.merchant}</span>
              <OneOffToggle active={t.oneOff} onClick={() => h.toggleTxOneOff(c.id, i)} />
              <span className="font-mono text-gray-400 shrink-0">{money(t.amount)}</span>
            </div>
          ))}
          {more > 0 && <div className="text-[11px] text-gray-600 pt-1">+ {more} more</div>}
        </div>
      )}
    </div>
  )
}

// ── Section C — Needs Review ────────────────────────────────────────
function SectionC({ items, actioned, pending, h }) {
  return (
    <div className="mx-5 px-3 pb-4 rounded-lg bg-amber-400/[0.02]">
      <div className="flex items-center gap-2.5 mb-1 pt-4">
        <span className="w-[3px] h-3.5 rounded bg-amber-400" />
        <span className="text-[10px] tracking-widest uppercase font-bold text-amber-400">Needs Review</span>
        {pending === 0
          ? <span className="text-[10px] text-emerald-400 border border-emerald-400/40 rounded-full px-2 py-0.5">All reviewed</span>
          : <span className="text-[10px] text-amber-400 border border-amber-400/40 rounded-full px-2 py-0.5">{pending} need action</span>}
        <div className="flex-1" />
        <span className="text-[11px] text-gray-500">{actioned} / {items.length} actioned</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">No keyword rule matched these. AI has suggested a category — confirm or override each one. All must be actioned before import.</p>
      {items.length === 0 ? <p className="text-xs text-gray-600">Nothing needs review.</p> : (
        <div className="space-y-1.5">{items.map(it => <NeedsReviewRow key={it.id} it={it} h={h} />)}</div>
      )}
    </div>
  )
}

function NeedsReviewRow({ it, h }) {
  const confirmed = it.status === 'confirmed'
  const excluded = it.status === 'excluded'
  return (
    <div className={`rounded-lg border border-gray-800 p-3 ${confirmed ? 'bg-emerald-400/[0.03]' : excluded ? 'bg-red-400/[0.02]' : 'bg-gray-900'}`}>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="w-11 text-[11px] font-mono text-gray-600 shrink-0">{fmtDay(it.date)}</span>
        <div className="flex-1 min-w-[100px]">
          <div className={`text-sm truncate ${excluded ? 'text-gray-600 line-through' : 'text-white'}`}>{it.merchant}</div>
          {it.status === 'pending' && it.aiSuggestedCategory && <div className="text-[10.5px] text-amber-400/70 mt-0.5">▲ AI: {it.aiSuggestedCategory}</div>}
        </div>
        <span className={`text-sm font-mono shrink-0 ${excluded ? 'text-gray-600' : 'text-white'}`}>{money(it.amount)}</span>
        <div className="shrink-0 flex items-center justify-end gap-2">
          {it.status === 'pending' ? (
            <>
              <OneOffToggle active={it.oneOff} onClick={() => h.toggleNROneOff(it.id)} />
              <select value={it.selectedCategory} onChange={e => h.setNRCategory(it.id, e.target.value)}
                className="bg-gray-800 border border-amber-400/30 rounded px-2 py-1 text-xs text-white focus:outline-none">
                <option value="">Choose…</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="Reimbursements">Reimbursements</option>
              </select>
              <button onClick={() => h.setNRStatus(it.id, 'confirmed')} disabled={!it.selectedCategory}
                className="text-[11px] font-semibold text-amber-400 border border-amber-400/40 rounded px-2 py-1 hover:bg-amber-400/10 disabled:opacity-40 disabled:cursor-not-allowed">Confirm</button>
              <button onClick={() => h.setNRStatus(it.id, 'excluded')} className="text-gray-600 hover:text-red-400 text-base leading-none">×</button>
            </>
          ) : confirmed ? (
            <>
              <span className="text-[11px] text-emerald-400">✓ {it.selectedCategory}{it.oneOff ? <span className="text-amber-400"> · one-off</span> : ''}</span>
              <button onClick={() => h.setNRStatus(it.id, 'pending')} className="text-[11px] text-gray-500 hover:text-white">Undo</button>
            </>
          ) : (
            <>
              <span className="text-[11px] text-red-400">× Excluded</span>
              <button onClick={() => h.setNRStatus(it.id, 'pending')} className="text-[11px] text-gray-500 hover:text-white">Undo</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Step 4 — Confirm ────────────────────────────────────────────────
function ConfirmStep({ review, month, saving, onBack, onClose, onCommit }) {
  const confirmedRec = review.recurringItems.filter(x => x.status === 'confirmed')
  const skippedRec = review.recurringItems.filter(x => x.status === 'skipped')
  const sameAmount = confirmedRec.filter(x => round2(x.actualAmount) === round2(x.forecastAmount)).length
  const included = review.categories.filter(c => !c.excluded)
  const confirmedC = review.needsReviewItems.filter(x => x.status === 'confirmed')

  // Aggregate variable spend by category (B + C) for the breakdown
  const catTotals = {}
  for (const c of included) catTotals[c.name] = round2((catTotals[c.name] || 0) + c.amount)
  let extraReimb = 0
  for (const it of confirmedC) {
    if (it.selectedCategory === 'Reimbursements') { extraReimb = round2(extraReimb + it.amount); continue }
    catTotals[it.selectedCategory] = round2((catTotals[it.selectedCategory] || 0) + it.amount)
  }
  const reimbTotal = round2(review.reimbursements.total + extraReimb)
  const varTotal = round2(Object.values(catTotals).reduce((a, b) => a + b, 0))
  const catList = Object.entries(catTotals).sort((a, b) => b[1] - a[1])

  return (
    <>
      <div className="flex items-center justify-between p-5 border-b border-gray-800 shrink-0">
        <h2 className="text-sm font-semibold text-white">Confirm Import</h2>
        <button onClick={onClose} className="text-gray-600 hover:text-white text-xl leading-none">&times;</button>
      </div>

      <div className="overflow-y-auto p-5 flex-1 space-y-3">
        {/* Recurring */}
        <div className="rounded-lg border border-violet-400/15 bg-violet-400/[0.03] p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="w-[3px] h-3 rounded bg-violet-400" />
            <span className="text-[10px] tracking-widest uppercase font-bold text-violet-400">Recurring — This Month</span>
          </div>
          {confirmedRec.length === 0 ? (
            <p className="text-xs text-gray-500">No recurring updates confirmed.</p>
          ) : (
            <div className="space-y-1.5">
              {confirmedRec.map(r => {
                const diff = r.actualAmount - r.forecastAmount
                return (
                  <div key={r.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-200">{r.name} <span className="text-gray-600 text-xs">forecast {money(r.forecastAmount)}</span></span>
                    <span className={`font-mono ${diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-white'}`}>{money(r.actualAmount)}</span>
                  </div>
                )
              })}
            </div>
          )}
          {sameAmount > 0 && <p className="text-[11px] text-gray-600 mt-2">{sameAmount} confirmed at same amount</p>}
          {skippedRec.length > 0 && <p className="text-[11px] text-gray-600 mt-1">{skippedRec.length} skipped — forecast unchanged</p>}
        </div>

        {/* Variable spending */}
        <div className="rounded-lg border border-blue-400/15 bg-blue-400/[0.03] p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="w-[3px] h-3 rounded bg-blue-400" />
            <span className="text-[10px] tracking-widest uppercase font-bold text-blue-400">Variable Spending</span>
            <div className="flex-1" />
            <span className="text-lg font-mono font-bold text-white">{money(varTotal)}</span>
          </div>
          <div className="space-y-1">
            {catList.map(([cat, amt]) => (
              <div key={cat} className="flex justify-between text-[13px]"><span className="text-gray-300">{cat}</span><span className="font-mono text-gray-400">{money(amt)}</span></div>
            ))}
          </div>
          {confirmedC.length > 0 && <p className="text-[11px] text-amber-400/70 mt-2">{confirmedC.length} manually categorised transaction{confirmedC.length === 1 ? '' : 's'}</p>}
          {reimbTotal > 0 && <p className="text-[11px] text-emerald-400/70 mt-1">+ {money(reimbTotal)} reimbursements recorded as income</p>}
        </div>

        {/* Month / tx note */}
        <div className="rounded-lg bg-gray-800 border border-gray-800 p-4 text-[13px] text-gray-400">
          Recording <span className="text-white font-semibold">{review.txCount} transactions</span> for <span className="text-white font-semibold">{month.label}</span>. This action cannot be undone.
        </div>
      </div>

      <div className="flex items-center justify-between p-5 border-t border-gray-800 shrink-0">
        <button onClick={onBack} disabled={saving} className="text-xs tracking-widest uppercase text-gray-500 hover:text-white disabled:opacity-40">← Back</button>
        <button onClick={onCommit} disabled={saving}
          className="px-4 py-2 bg-emerald-400 hover:bg-emerald-300 text-gray-950 text-xs font-bold tracking-widest uppercase rounded-lg transition-colors disabled:opacity-50">
          {saving ? 'Saving…' : 'Commit to Database'}
        </button>
      </div>
    </>
  )
}

// ── Step 5 — Success ────────────────────────────────────────────────
function SuccessStep({ summary, onDone }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-10">
      <div className="w-[54px] h-[54px] rounded-full bg-emerald-400/10 border border-emerald-400/40 flex items-center justify-center text-emerald-400 text-2xl mb-4">✓</div>
      <h2 className="text-base font-semibold text-white">Import Complete</h2>
      <p className="text-xs text-gray-500 mt-2 max-w-[260px]">Your {summary.month} statement has been recorded. Recurring actuals and variable spending are now in the budget.</p>
      <div className="w-full mt-5 rounded-lg bg-gray-800 border border-gray-800 p-4 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-gray-500">Month</span><span className="text-white">{summary.month}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Transactions recorded</span><span className="text-white font-mono">{summary.txCount}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Variable spending</span><span className="text-emerald-400 font-mono">{money(summary.variableSpend)}</span></div>
      </div>
      <button onClick={onDone} className="mt-5 px-6 py-2 bg-violet-500 hover:bg-violet-400 text-white text-xs font-bold tracking-widest uppercase rounded-lg transition-colors">Done</button>
    </div>
  )
}
