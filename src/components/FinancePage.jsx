import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useCurrency } from '../CurrencyContext'
import { LineChart, Line, ResponsiveContainer } from 'recharts'

const CATEGORIES = ['Cash', 'Investments', 'Property', 'Crypto', 'Other']
const INCOME_CATEGORIES = ['Salary', 'Trading', 'Dividends', 'Bonus', 'Other']
const EXPENSE_CATEGORIES = ['Rent', 'Food', 'Transport', 'Subscriptions', 'Entertainment', 'Health', 'Clothing', 'Other']
const FREQ_LABELS = { monthly: 'Monthly', fortnightly: 'Fortnightly', weekly: 'Weekly', quarterly: 'Quarterly', annual: 'Annual' }
const EMPTY_SNAP_ENTRY = { name: '', type: 'Cash', value: '', currency: 'GBP' }

function toMonthly(amount, frequency) {
  switch (frequency) {
    case 'monthly':     return amount
    case 'fortnightly': return amount * 26 / 12
    case 'weekly':      return amount * 52 / 12
    case 'quarterly':   return amount / 3
    case 'annual':      return amount / 12
    default:            return amount
  }
}

function entryToGBP(entry, rate) {
  const val = parseFloat(entry.value || 0)
  if (!rate || (entry.currency || 'GBP') === 'GBP') return val
  return val / rate
}

function recurringToMonthlyGBP(item, rate) {
  const monthly = toMonthly(item.amount, item.frequency)
  if (!rate || (item.currency || 'GBP') === 'GBP') return monthly
  return monthly / rate
}

function getMonthOptions() {
  const months = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    months.push({
      label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      value,
    })
  }
  return months
}

// ─── Recurring card (Subscriptions / Fixed Costs / Income Sources) ───────────

function RecurringCard({ title, type, items, onAdd, onUpdate, onDelete }) {
  const { convert, format } = useCurrency()
  const [form, setForm] = useState({ name: '', amount: '', frequency: 'monthly', currency: 'GBP' })
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', amount: '', frequency: 'monthly', currency: 'GBP' })
  const [saving, setSaving] = useState(false)

  const filtered = items.filter(r => r.type === type)
  const monthlyTotal = filtered.reduce((sum, r) => sum + convert(toMonthly(r.amount, r.frequency), r.currency || 'GBP'), 0)
  const isIncome = type === 'income'
  const accentClass = isIncome ? 'text-emerald-400' : 'text-amber-400'
  const addBtnClass = isIncome
    ? 'text-xs tracking-widest uppercase px-4 py-2 border border-emerald-400 text-emerald-400 rounded hover:bg-emerald-400 hover:text-gray-950 transition-colors disabled:opacity-50'
    : 'text-xs tracking-widest uppercase px-4 py-2 border border-amber-400 text-amber-400 rounded hover:bg-amber-400 hover:text-gray-950 transition-colors disabled:opacity-50'

  async function handleAdd() {
    if (!form.name.trim() || !form.amount) return
    setSaving(true)
    await onAdd({ name: form.name.trim(), type, amount: parseFloat(form.amount), frequency: form.frequency, currency: form.currency, active: true })
    setForm({ name: '', amount: '', frequency: 'monthly', currency: 'GBP' })
    setSaving(false)
  }

  async function handleUpdate() {
    if (!editForm.name.trim() || !editForm.amount) return
    setSaving(true)
    await onUpdate(editingId, { name: editForm.name.trim(), amount: parseFloat(editForm.amount), frequency: editForm.frequency, currency: editForm.currency })
    setEditingId(null)
    setSaving(false)
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 flex flex-col">
      <h2 className="text-sm tracking-widest uppercase text-gray-400 mb-4">{title}</h2>

      <div className="flex-1">
        {filtered.length === 0 ? (
          <div className="text-sm text-gray-600 mb-4">No items yet</div>
        ) : (
          <div className="mb-4">
            {filtered.map(item => (
              editingId === item.id ? (
                <div key={item.id} className="py-3 border-b border-gray-800 space-y-2">
                  <input
                    value={editForm.name}
                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400"
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={editForm.amount}
                      onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="Amount"
                      className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400"
                    />
                    <select
                      value={editForm.currency}
                      onChange={e => setEditForm(f => ({ ...f, currency: e.target.value }))}
                      className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400"
                    >
                      <option value="GBP">GBP</option>
                      <option value="AUD">AUD</option>
                    </select>
                    <select
                      value={editForm.frequency}
                      onChange={e => setEditForm(f => ({ ...f, frequency: e.target.value }))}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400"
                    >
                      {Object.entries(FREQ_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={handleUpdate} disabled={saving} className="px-3 py-1.5 bg-emerald-400 text-gray-950 text-xs font-bold tracking-widest uppercase rounded hover:bg-emerald-300 transition-colors disabled:opacity-50">Save</button>
                    <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 hover:text-white tracking-widest uppercase transition-colors">Cancel</button>
                  </div>
                </div>
              ) : (
                <div key={item.id} className="flex items-center justify-between py-2.5 border-b border-gray-800 last:border-0 group">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-sm text-white truncate">{item.name}</span>
                    <span className="text-xs text-gray-600 border border-gray-700 rounded px-1.5 py-0.5 tracking-wider uppercase shrink-0">{FREQ_LABELS[item.frequency]}</span>
                  </div>
                  <div className="flex items-center gap-3 ml-2 shrink-0">
                    <span className={`text-sm font-medium ${accentClass}`}>
                      {format(convert(toMonthly(item.amount, item.frequency), item.currency || 'GBP'))}/mo
                    </span>
                    <button
                      onClick={() => { setEditingId(item.id); setEditForm({ name: item.name, amount: String(item.amount), frequency: item.frequency, currency: item.currency || 'GBP' }) }}
                      className="text-xs text-gray-600 hover:text-white transition-colors tracking-widest uppercase opacity-0 group-hover:opacity-100"
                    >Edit</button>
                    <button
                      onClick={() => onDelete(item.id)}
                      className="text-xs text-gray-600 hover:text-red-400 transition-colors tracking-widest uppercase opacity-0 group-hover:opacity-100"
                    >Del</button>
                  </div>
                </div>
              )
            ))}
          </div>
        )}
      </div>

      {/* Add form */}
      <div className="space-y-2 pt-4 border-t border-gray-800">
        <div className="flex gap-2">
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="Name"
            className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400"
          />
          <button onClick={handleAdd} disabled={saving || !form.name.trim() || !form.amount} className={addBtnClass}>
            + Add
          </button>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            value={form.amount}
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
            placeholder="Amount"
            className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400"
          />
          <select
            value={form.currency}
            onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-2 text-white text-sm focus:outline-none focus:border-emerald-400"
          >
            <option value="GBP">GBP</option>
            <option value="AUD">AUD</option>
          </select>
          <select
            value={form.frequency}
            onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}
            className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-2 py-2 text-white text-sm focus:outline-none focus:border-emerald-400"
          >
            {Object.entries(FREQ_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      {/* Total */}
      <div className="flex items-center justify-between pt-4 mt-2 border-t border-gray-800">
        <span className="text-xs text-gray-500 uppercase tracking-widest">Total / mo</span>
        <span className={`text-sm font-bold ${accentClass}`}>{format(monthlyTotal)}</span>
      </div>
    </div>
  )
}

// ─── Main Finance Page ────────────────────────────────────────────────────────

export default function FinancePage() {
  const { convert, format, rate } = useCurrency()
  const months = getMonthOptions()

  // ── Data
  const [snapshots, setSnapshots] = useState([])
  const [recurringItems, setRecurringItems] = useState([])
  const [budgetEntries, setBudgetEntries] = useState([])
  const [selectedMonth, setSelectedMonth] = useState(months[0].value)

  // ── Snapshot add form
  const [showSnapForm, setShowSnapForm] = useState(false)
  const [snapFormEntries, setSnapFormEntries] = useState([{ ...EMPTY_SNAP_ENTRY }])
  const [snapFormDate, setSnapFormDate] = useState('')
  const [snapFormLoading, setSnapFormLoading] = useState(false)

  // ── Snapshot inline edit
  const [editingSnapId, setEditingSnapId] = useState(null)
  const [editSnapEntries, setEditSnapEntries] = useState([])
  const [editSnapLoading, setEditSnapLoading] = useState(false)

  // ── Budget forms
  const [showIncomeForm, setShowIncomeForm] = useState(false)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [incomeForm, setIncomeForm] = useState({ category: INCOME_CATEGORIES[0], amount: '', currency: 'GBP', notes: '' })
  const [expenseForm, setExpenseForm] = useState({ category: EXPENSE_CATEGORIES[0], amount: '', currency: 'GBP', notes: '' })
  const [budgetLoading, setBudgetLoading] = useState(false)
  const [editingBudgetId, setEditingBudgetId] = useState(null)
  const [editBudgetForm, setEditBudgetForm] = useState({ amount: '', category: '', notes: '' })

  // ── Fetchers
  function fetchSnapshots() {
    supabase.from('net_worth_snapshots').select('*').order('date', { ascending: false })
      .then(({ data }) => { if (data) setSnapshots(data) })
  }

  function fetchRecurringItems() {
    supabase.from('recurring_items').select('*').order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setRecurringItems(data) })
  }

  async function fetchBudgetEntries() {
    const start = selectedMonth
    const [y, m] = selectedMonth.split('-').map(Number)
    const end = `${m === 12 ? y + 1 : y}-${String(m % 12 + 1).padStart(2, '0')}-01`
    const { data } = await supabase.from('budget_entries').select('*').gte('month', start).lt('month', end).order('created_at', { ascending: false })
    const entries = data || []
    setBudgetEntries(entries)
    return entries
  }

  async function fetchAndSeedBudget() {
    const entries = await fetchBudgetEntries()
    const existingIds = new Set(entries.filter(e => e.recurring_item_id).map(e => e.recurring_item_id))
    const missing = recurringItems.filter(r => r.active && !existingIds.has(r.id))
    if (missing.length === 0) return
    await supabase.from('budget_entries').insert(
      missing.map(r => ({
        month: selectedMonth,
        category: 'Recurring',
        type: r.type === 'income' ? 'income' : 'expense',
        amount: toMonthly(r.amount, r.frequency),
        currency: r.currency || 'GBP',
        notes: r.name,
        recurring_item_id: r.id,
      }))
    )
    await fetchBudgetEntries()
  }

  useEffect(() => { fetchSnapshots() }, [])
  useEffect(() => { fetchRecurringItems() }, [])
  useEffect(() => { fetchAndSeedBudget() }, [selectedMonth, recurringItems])

  // ── Recurring CRUD
  async function addRecurringItem(data) {
    await supabase.from('recurring_items').insert([data])
    fetchRecurringItems()
  }
  async function updateRecurringItem(id, data) {
    await supabase.from('recurring_items').update(data).eq('id', id)
    fetchRecurringItems()
  }
  async function deleteRecurringItem(id) {
    await supabase.from('recurring_items').delete().eq('id', id)
    fetchRecurringItems()
  }

  // ── Snapshot CRUD
  async function saveNewSnapshot() {
    setSnapFormLoading(true)
    const valid = snapFormEntries.filter(e => e.name && e.value)
    const total = valid.reduce((sum, e) => sum + entryToGBP(e, rate), 0)
    await supabase.from('net_worth_snapshots').insert([{
      date: snapFormDate || new Date().toISOString().split('T')[0],
      entries: valid,
      total,
    }])
    setSnapFormEntries([{ ...EMPTY_SNAP_ENTRY }])
    setSnapFormDate('')
    setShowSnapForm(false)
    fetchSnapshots()
    setSnapFormLoading(false)
  }

  async function saveSnapshotEdit(id) {
    setEditSnapLoading(true)
    const valid = editSnapEntries.filter(e => e.name && e.value)
    const total = valid.reduce((sum, e) => sum + entryToGBP(e, rate), 0)
    await supabase.from('net_worth_snapshots').update({ entries: valid, total }).eq('id', id)
    setEditingSnapId(null)
    fetchSnapshots()
    setEditSnapLoading(false)
  }

  async function deleteSnapshot(id) {
    await supabase.from('net_worth_snapshots').delete().eq('id', id)
    if (editingSnapId === id) setEditingSnapId(null)
    fetchSnapshots()
  }

  // ── Budget CRUD
  async function addBudgetEntry(type) {
    setBudgetLoading(true)
    const f = type === 'income' ? incomeForm : expenseForm
    await supabase.from('budget_entries').insert([{
      month: selectedMonth,
      category: f.category,
      type,
      amount: parseFloat(f.amount),
      currency: f.currency || 'GBP',
      notes: f.notes || null,
    }])
    if (type === 'income') {
      setIncomeForm({ category: INCOME_CATEGORIES[0], amount: '', currency: 'GBP', notes: '' })
      setShowIncomeForm(false)
    } else {
      setExpenseForm({ category: EXPENSE_CATEGORIES[0], amount: '', currency: 'GBP', notes: '' })
      setShowExpenseForm(false)
    }
    fetchBudgetEntries()
    setBudgetLoading(false)
  }

  async function deleteBudgetEntry(id) {
    await supabase.from('budget_entries').delete().eq('id', id)
    fetchBudgetEntries()
  }

  async function updateBudgetEntry(id) {
    setBudgetLoading(true)
    await supabase.from('budget_entries').update({
      amount: parseFloat(editBudgetForm.amount),
      category: editBudgetForm.category,
      notes: editBudgetForm.notes || null,
    }).eq('id', id)
    setEditingBudgetId(null)
    await fetchBudgetEntries()
    setBudgetLoading(false)
  }

  // ── Derived: net worth
  const latest = snapshots[0]
  const prevSnap = snapshots[1]
  const monthDelta = latest && prevSnap ? latest.total - prevSnap.total : null
  const monthDeltaPct = monthDelta !== null && prevSnap ? (monthDelta / prevSnap.total) * 100 : null
  const sparkData = [...snapshots].sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-8).map(s => ({ v: s.total }))

  // ── Derived: assets
  const cashEntries = latest ? latest.entries.filter(e => e.type === 'Cash') : []
  const investedEntries = latest ? latest.entries.filter(e => e.type === 'Investments' || e.type === 'Crypto') : []
  const totalCashGBP = cashEntries.reduce((sum, e) => sum + entryToGBP(e, rate), 0)
  const totalInvestedGBP = investedEntries.reduce((sum, e) => sum + entryToGBP(e, rate), 0)
  const cashPct = latest && latest.total > 0 ? (totalCashGBP / latest.total) * 100 : 0
  const investedPct = latest && latest.total > 0 ? (totalInvestedGBP / latest.total) * 100 : 0

  const cashSparkData = [...snapshots].sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-8).map(s => ({
    v: s.entries.filter(e => e.type === 'Cash').reduce((sum, e) => sum + parseFloat(e.value || 0), 0)
  }))
  const investedSparkData = [...snapshots].sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-8).map(s => ({
    v: s.entries.filter(e => e.type === 'Investments' || e.type === 'Crypto').reduce((sum, e) => sum + parseFloat(e.value || 0), 0)
  }))

  // ── Derived: recurring
  const activeIncome = recurringItems.filter(r => r.type === 'income' && r.active)
  const activeCosts = recurringItems.filter(r => (r.type === 'subscription' || r.type === 'fixed_cost') && r.active)
  const monthlyIncome = activeIncome.reduce((sum, r) => sum + recurringToMonthlyGBP(r, rate), 0)
  const monthlyBurn = activeCosts.reduce((sum, r) => sum + recurringToMonthlyGBP(r, rate), 0)
  const runway = monthlyBurn > 0 ? totalCashGBP / monthlyBurn : null
  const recurringSaveRate = monthlyIncome > 0 ? ((monthlyIncome - monthlyBurn) / monthlyIncome) * 100 : null

  // ── Derived: budget
  const budgetIncome = budgetEntries.filter(e => e.type === 'income')
  const budgetExpenses = budgetEntries.filter(e => e.type === 'expense')
  const totalBudgetIncome = budgetIncome.reduce((sum, e) => sum + convert(parseFloat(e.amount), e.currency || 'GBP'), 0)
  const totalBudgetExpenses = budgetExpenses.reduce((sum, e) => sum + convert(parseFloat(e.amount), e.currency || 'GBP'), 0)
  const budgetSaved = totalBudgetIncome - totalBudgetExpenses
  const budgetSaveRate = totalBudgetIncome > 0 ? (budgetSaved / totalBudgetIncome) * 100 : null

  // ── Shared input classes
  const inputCls = 'bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400'
  const inputClsDark = 'bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400'

  return (
    <div className="space-y-6">

      {/* ── Section 1: Summary cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Net Worth */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-sm tracking-widest uppercase text-gray-400 mb-3">Net Worth</h2>
          <div className="text-3xl font-bold text-white mb-1">
            {latest ? format(convert(latest.total, 'GBP')) : '—'}
          </div>
          {monthDelta !== null && (
            <div className={`text-sm font-medium mb-0.5 ${monthDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {monthDelta >= 0 ? '+' : '-'}{format(convert(Math.abs(monthDelta), 'GBP'))}
              {monthDeltaPct !== null && ` (${monthDeltaPct >= 0 ? '+' : ''}${monthDeltaPct.toFixed(1)}%)`}
            </div>
          )}
          {prevSnap && (
            <div className="text-xs text-gray-500 mb-3">Last: {format(convert(prevSnap.total, 'GBP'))}</div>
          )}
          {sparkData.length > 1 && (
            <ResponsiveContainer width="100%" height={40}>
              <LineChart data={sparkData}>
                <Line type="monotone" dataKey="v" stroke="#34d399" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Runway */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-sm tracking-widest uppercase text-gray-400 mb-3">Runway</h2>
          <div className="text-3xl font-bold text-white mb-2">
            {runway !== null ? `${Math.floor(runway)} mo` : '—'}
          </div>
          <div className="text-xs text-gray-500 mb-0.5">Liquid: {format(convert(totalCashGBP, 'GBP'))}</div>
          <div className="text-xs text-gray-500">Burn: {format(convert(monthlyBurn, 'GBP'))}/mo</div>
        </div>

        {/* Income/mo */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-sm tracking-widest uppercase text-gray-400 mb-3">Income / mo</h2>
          <div className="text-3xl font-bold text-emerald-400 mb-2">
            {format(convert(monthlyIncome, 'GBP'))}
          </div>
          <div className="text-xs text-gray-500">
            {activeIncome.length} active source{activeIncome.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Burn/mo */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-sm tracking-widest uppercase text-gray-400 mb-3">Burn / mo</h2>
          <div className="text-3xl font-bold text-amber-400 mb-2">
            {format(convert(monthlyBurn, 'GBP'))}
          </div>
          <div className="text-xs text-gray-500">
            Save rate: {recurringSaveRate !== null ? `${recurringSaveRate.toFixed(0)}%` : '—'}
          </div>
        </div>
      </div>

      {/* ── Section 2: Asset cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Liquid Cash */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-sm tracking-widest uppercase text-gray-400 mb-3">Liquid Cash</h2>
          <div className="text-3xl font-bold text-white mb-1">{format(convert(totalCashGBP, 'GBP'))}</div>
          <div className="text-xs text-gray-500 mb-4">{cashPct.toFixed(1)}% of net worth</div>
          {cashSparkData.length > 1 && (
            <div className="mb-4">
              <ResponsiveContainer width="100%" height={40}>
                <LineChart data={cashSparkData}>
                  <Line type="monotone" dataKey="v" stroke="#34d399" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {cashEntries.length > 0 ? (
            <div>
              {cashEntries.map((e, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                  <span className="text-sm text-gray-400 truncate min-w-0 flex-1 mr-2">{e.name}</span>
                  <span className="text-sm text-white font-medium shrink-0">{format(convert(parseFloat(e.value || 0), e.currency || 'GBP'))}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-600">No snapshot yet</div>
          )}
        </div>

        {/* Invested Assets */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-sm tracking-widest uppercase text-gray-400 mb-3">Invested Assets</h2>
          <div className="text-3xl font-bold text-white mb-1">{format(convert(totalInvestedGBP, 'GBP'))}</div>
          <div className="text-xs text-gray-500 mb-4">{investedPct.toFixed(1)}% of net worth</div>
          {investedSparkData.length > 1 && (
            <div className="mb-4">
              <ResponsiveContainer width="100%" height={40}>
                <LineChart data={investedSparkData}>
                  <Line type="monotone" dataKey="v" stroke="#34d399" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {investedEntries.length > 0 ? (
            <div>
              {investedEntries.map((e, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                  <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                    <span className="text-sm text-gray-400 truncate min-w-0">{e.name}</span>
                    <span className="text-xs text-gray-600 border border-gray-700 rounded px-1.5 py-0.5 uppercase tracking-wider shrink-0">{e.type}</span>
                  </div>
                  <span className="text-sm text-white font-medium shrink-0">{format(convert(parseFloat(e.value || 0), e.currency || 'GBP'))}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-600">No snapshot yet</div>
          )}
        </div>
      </div>

      {/* ── Section 3: Recurring items ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <RecurringCard title="Subscriptions" type="subscription" items={recurringItems} onAdd={addRecurringItem} onUpdate={updateRecurringItem} onDelete={deleteRecurringItem} />
        <RecurringCard title="Fixed Costs"   type="fixed_cost"   items={recurringItems} onAdd={addRecurringItem} onUpdate={updateRecurringItem} onDelete={deleteRecurringItem} />
        <RecurringCard title="Income Sources" type="income"      items={recurringItems} onAdd={addRecurringItem} onUpdate={updateRecurringItem} onDelete={deleteRecurringItem} />
      </div>

      {/* ── Section 4: Monthly Budget ─────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm tracking-widest uppercase text-gray-400">Monthly Budget</h2>
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className={inputCls}
          >
            {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Income</div>
            <div className="text-xl font-bold text-emerald-400">{format(totalBudgetIncome)}</div>
            {monthlyIncome > 0 && (
              <div className="text-xs text-gray-600 mt-1">Expected: {format(convert(monthlyIncome, 'GBP'))}</div>
            )}
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Expenses</div>
            <div className="text-xl font-bold text-red-400">{format(totalBudgetExpenses)}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Saved</div>
            <div className={`text-xl font-bold ${budgetSaved >= 0 ? 'text-white' : 'text-red-400'}`}>
              {budgetSaved < 0 ? '-' : ''}{format(Math.abs(budgetSaved))}
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Save Rate</div>
            <div className={`text-xl font-bold ${budgetSaveRate === null || budgetSaveRate >= 0 ? 'text-white' : 'text-red-400'}`}>
              {budgetSaveRate !== null ? `${budgetSaveRate.toFixed(0)}%` : '—'}
            </div>
          </div>
        </div>

        {/* Two-column entry lists */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Income column */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm tracking-widest uppercase text-gray-400">Income</h3>
              <button
                onClick={() => { setShowIncomeForm(f => !f); setIncomeForm({ category: INCOME_CATEGORIES[0], amount: '', currency: 'GBP', notes: '' }) }}
                className="text-xs tracking-widest uppercase px-3 py-1.5 border border-emerald-400 text-emerald-400 rounded hover:bg-emerald-400 hover:text-gray-950 transition-colors"
              >
                {showIncomeForm ? 'Cancel' : '+ Add'}
              </button>
            </div>

            {showIncomeForm && (
              <div className="mb-4 p-4 bg-gray-800 rounded-lg space-y-2">
                <div className="flex gap-2">
                  <select value={incomeForm.category} onChange={e => setIncomeForm(f => ({ ...f, category: e.target.value }))} className={`flex-1 ${inputClsDark}`}>
                    {INCOME_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={incomeForm.currency} onChange={e => setIncomeForm(f => ({ ...f, currency: e.target.value }))} className={inputClsDark}>
                    <option value="GBP">GBP</option>
                    <option value="AUD">AUD</option>
                  </select>
                </div>
                <input type="number" value={incomeForm.amount} onChange={e => setIncomeForm(f => ({ ...f, amount: e.target.value }))} placeholder="Amount" className={`w-full ${inputClsDark}`} />
                <input value={incomeForm.notes} onChange={e => setIncomeForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes (optional)" className={`w-full ${inputClsDark}`} />
                <button onClick={() => addBudgetEntry('income')} disabled={budgetLoading || !incomeForm.amount} className="w-full px-3 py-2 bg-emerald-400 text-gray-950 text-xs font-bold tracking-widest uppercase rounded hover:bg-emerald-300 transition-colors disabled:opacity-50">
                  Save
                </button>
              </div>
            )}

            {budgetIncome.length === 0 ? (
              <div className="text-sm text-gray-600">No income entries</div>
            ) : (
              <div>
                {budgetIncome.map(e => {
                  const isRecurring = !!e.recurring_item_id
                  const isEditing = editingBudgetId === e.id
                  return (
                    <div key={e.id} className="border-b border-gray-800 last:border-0">
                      {isEditing ? (
                        <div className="py-3 space-y-2">
                          <div className="flex gap-2">
                            <select value={editBudgetForm.category} onChange={ev => setEditBudgetForm(f => ({ ...f, category: ev.target.value }))} className={`flex-1 ${inputCls}`}>
                              {INCOME_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                          <input type="number" value={editBudgetForm.amount} onChange={ev => setEditBudgetForm(f => ({ ...f, amount: ev.target.value }))} placeholder="Amount" className={`w-full ${inputCls}`} />
                          <input value={editBudgetForm.notes} onChange={ev => setEditBudgetForm(f => ({ ...f, notes: ev.target.value }))} placeholder="Notes (optional)" className={`w-full ${inputCls}`} />
                          <div className="flex gap-3">
                            <button onClick={() => updateBudgetEntry(e.id)} disabled={budgetLoading || !editBudgetForm.amount} className="px-3 py-1.5 bg-emerald-400 text-gray-950 text-xs font-bold tracking-widest uppercase rounded hover:bg-emerald-300 transition-colors disabled:opacity-50">Save</button>
                            <button onClick={() => setEditingBudgetId(null)} className="text-xs text-gray-500 hover:text-white tracking-widest uppercase transition-colors">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between py-2.5 group">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {isRecurring ? (
                              <>
                                <span className="text-sm text-gray-300 truncate">{e.notes}</span>
                                <span className="text-xs text-gray-600 border border-gray-700 rounded px-1.5 py-0.5 uppercase tracking-wider shrink-0">Recurring</span>
                              </>
                            ) : (
                              <>
                                <span className="text-xs text-gray-500 border border-gray-700 rounded px-1.5 py-0.5 uppercase tracking-wider shrink-0">{e.category}</span>
                                {e.notes && <span className="text-sm text-gray-400 truncate">{e.notes}</span>}
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-3 ml-2 shrink-0">
                            <span className="text-sm font-medium text-emerald-400">{format(convert(parseFloat(e.amount), e.currency || 'GBP'))}</span>
                            {isRecurring ? (
                              <button onClick={() => { setEditingBudgetId(e.id); setEditBudgetForm({ amount: String(e.amount), category: e.category, notes: e.notes || '' }) }} className="text-xs text-gray-600 hover:text-white transition-colors uppercase tracking-widest opacity-0 group-hover:opacity-100">Edit</button>
                            ) : (
                              <button onClick={() => deleteBudgetEntry(e.id)} className="text-xs text-gray-600 hover:text-red-400 transition-colors uppercase tracking-widest opacity-0 group-hover:opacity-100">Del</button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Expense column */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm tracking-widest uppercase text-gray-400">Expenses</h3>
              <button
                onClick={() => { setShowExpenseForm(f => !f); setExpenseForm({ category: EXPENSE_CATEGORIES[0], amount: '', currency: 'GBP', notes: '' }) }}
                className="text-xs tracking-widest uppercase px-3 py-1.5 border border-red-400 text-red-400 rounded hover:bg-red-400 hover:text-gray-950 transition-colors"
              >
                {showExpenseForm ? 'Cancel' : '+ Add'}
              </button>
            </div>

            {showExpenseForm && (
              <div className="mb-4 p-4 bg-gray-800 rounded-lg space-y-2">
                <div className="flex gap-2">
                  <select value={expenseForm.category} onChange={e => setExpenseForm(f => ({ ...f, category: e.target.value }))} className={`flex-1 ${inputClsDark}`}>
                    {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={expenseForm.currency} onChange={e => setExpenseForm(f => ({ ...f, currency: e.target.value }))} className={inputClsDark}>
                    <option value="GBP">GBP</option>
                    <option value="AUD">AUD</option>
                  </select>
                </div>
                <input type="number" value={expenseForm.amount} onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))} placeholder="Amount" className={`w-full ${inputClsDark}`} />
                <input value={expenseForm.notes} onChange={e => setExpenseForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes (optional)" className={`w-full ${inputClsDark}`} />
                <button onClick={() => addBudgetEntry('expense')} disabled={budgetLoading || !expenseForm.amount} className="w-full px-3 py-2 bg-red-400 text-white text-xs font-bold tracking-widest uppercase rounded hover:bg-red-300 transition-colors disabled:opacity-50">
                  Save
                </button>
              </div>
            )}

            {budgetExpenses.length === 0 ? (
              <div className="text-sm text-gray-600">No expense entries</div>
            ) : (
              <div>
                {budgetExpenses.map(e => {
                  const isRecurring = !!e.recurring_item_id
                  const isEditing = editingBudgetId === e.id
                  return (
                    <div key={e.id} className="border-b border-gray-800 last:border-0">
                      {isEditing ? (
                        <div className="py-3 space-y-2">
                          <div className="flex gap-2">
                            <select value={editBudgetForm.category} onChange={ev => setEditBudgetForm(f => ({ ...f, category: ev.target.value }))} className={`flex-1 ${inputCls}`}>
                              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                          <input type="number" value={editBudgetForm.amount} onChange={ev => setEditBudgetForm(f => ({ ...f, amount: ev.target.value }))} placeholder="Amount" className={`w-full ${inputCls}`} />
                          <input value={editBudgetForm.notes} onChange={ev => setEditBudgetForm(f => ({ ...f, notes: ev.target.value }))} placeholder="Notes (optional)" className={`w-full ${inputCls}`} />
                          <div className="flex gap-3">
                            <button onClick={() => updateBudgetEntry(e.id)} disabled={budgetLoading || !editBudgetForm.amount} className="px-3 py-1.5 bg-emerald-400 text-gray-950 text-xs font-bold tracking-widest uppercase rounded hover:bg-emerald-300 transition-colors disabled:opacity-50">Save</button>
                            <button onClick={() => setEditingBudgetId(null)} className="text-xs text-gray-500 hover:text-white tracking-widest uppercase transition-colors">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between py-2.5 group">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {isRecurring ? (
                              <>
                                <span className="text-sm text-gray-300 truncate">{e.notes}</span>
                                <span className="text-xs text-gray-600 border border-gray-700 rounded px-1.5 py-0.5 uppercase tracking-wider shrink-0">Recurring</span>
                              </>
                            ) : (
                              <>
                                <span className="text-xs text-gray-500 border border-gray-700 rounded px-1.5 py-0.5 uppercase tracking-wider shrink-0">{e.category}</span>
                                {e.notes && <span className="text-sm text-gray-400 truncate">{e.notes}</span>}
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-3 ml-2 shrink-0">
                            <span className="text-sm font-medium text-red-400">{format(convert(parseFloat(e.amount), e.currency || 'GBP'))}</span>
                            {isRecurring ? (
                              <button onClick={() => { setEditingBudgetId(e.id); setEditBudgetForm({ amount: String(e.amount), category: e.category, notes: e.notes || '' }) }} className="text-xs text-gray-600 hover:text-white transition-colors uppercase tracking-widest opacity-0 group-hover:opacity-100">Edit</button>
                            ) : (
                              <button onClick={() => deleteBudgetEntry(e.id)} className="text-xs text-gray-600 hover:text-red-400 transition-colors uppercase tracking-widest opacity-0 group-hover:opacity-100">Del</button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 5: Snapshot History ───────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm tracking-widest uppercase text-gray-400">Snapshot History</h2>
          <button
            onClick={() => {
              if (!showSnapForm && latest) {
                setSnapFormEntries(latest.entries.map(e => ({ ...e, value: String(e.value) })))
              } else if (!showSnapForm) {
                setSnapFormEntries([{ ...EMPTY_SNAP_ENTRY }])
              }
              setShowSnapForm(f => !f)
            }}
            className="text-xs tracking-widest uppercase px-4 py-2 border border-emerald-400 text-emerald-400 rounded hover:bg-emerald-400 hover:text-gray-950 transition-colors"
          >
            {showSnapForm ? 'Cancel' : '+ New Snapshot'}
          </button>
        </div>

        {/* Add snapshot form */}
        {showSnapForm && (
          <div className="mb-6 p-4 bg-gray-800 rounded-lg space-y-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500 uppercase tracking-widest">New Snapshot</span>
              <input
                type="date"
                value={snapFormDate}
                onChange={e => setSnapFormDate(e.target.value)}
                className={inputClsDark}
              />
            </div>
            {snapFormEntries.map((entry, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-4">
                  <input
                    type="text"
                    value={entry.name}
                    onChange={e => { const u = [...snapFormEntries]; u[idx] = { ...u[idx], name: e.target.value }; setSnapFormEntries(u) }}
                    placeholder="Account name"
                    className={`w-full ${inputClsDark}`}
                  />
                </div>
                <div className="col-span-3">
                  <select
                    value={entry.type}
                    onChange={e => { const u = [...snapFormEntries]; u[idx] = { ...u[idx], type: e.target.value }; setSnapFormEntries(u) }}
                    className={`w-full ${inputClsDark}`}
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <select
                    value={entry.currency || 'GBP'}
                    onChange={e => { const u = [...snapFormEntries]; u[idx] = { ...u[idx], currency: e.target.value }; setSnapFormEntries(u) }}
                    className={`w-full ${inputClsDark}`}
                  >
                    <option value="GBP">GBP</option>
                    <option value="AUD">AUD</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <input
                    type="number"
                    value={entry.value}
                    onChange={e => { const u = [...snapFormEntries]; u[idx] = { ...u[idx], value: e.target.value }; setSnapFormEntries(u) }}
                    placeholder="0"
                    className={`w-full ${inputClsDark}`}
                  />
                </div>
                <div className="col-span-1 flex justify-center">
                  {snapFormEntries.length > 1 && (
                    <button onClick={() => setSnapFormEntries(snapFormEntries.filter((_, i) => i !== idx))} className="text-gray-600 hover:text-red-400 transition-colors text-xl leading-none">×</button>
                  )}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-4 pt-1">
              <button onClick={() => setSnapFormEntries(e => [...e, { ...EMPTY_SNAP_ENTRY }])} className="text-xs tracking-widest uppercase text-gray-500 hover:text-white transition-colors">+ Add account</button>
              <button onClick={saveNewSnapshot} disabled={snapFormLoading} className="px-6 py-2 bg-emerald-400 text-gray-950 text-sm font-bold tracking-widest uppercase rounded hover:bg-emerald-300 transition-colors disabled:opacity-50">
                {snapFormLoading ? 'Saving...' : 'Save Snapshot'}
              </button>
            </div>
          </div>
        )}

        {/* History table */}
        {snapshots.length > 0 ? (
          <div>
            {/* Table header */}
            <div className="grid grid-cols-6 gap-4 pb-3 border-b border-gray-800">
              {['Period', 'Net Worth', 'Cash', 'Invested', 'Δ vs Prior', ''].map(h => (
                <div key={h} className="text-xs text-gray-500 uppercase tracking-widest">{h}</div>
              ))}
            </div>

            {/* Table rows */}
            {snapshots.map((s, i) => {
              const prior = snapshots[i + 1]
              const delta = prior ? s.total - prior.total : null
              const deltaPct = delta !== null && prior.total ? (delta / prior.total) * 100 : null
              const sCash = s.entries.filter(e => e.type === 'Cash').reduce((sum, e) => sum + entryToGBP(e, rate), 0)
              const sInvested = s.entries.filter(e => e.type === 'Investments' || e.type === 'Crypto').reduce((sum, e) => sum + entryToGBP(e, rate), 0)

              return (
                <div key={s.id}>
                  <div className="grid grid-cols-6 gap-4 py-3 border-b border-gray-800 last:border-0 items-center">
                    <div className="text-sm text-gray-400">
                      {new Date(s.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                    <div className="text-sm text-white font-medium">{format(convert(s.total, 'GBP'))}</div>
                    <div className="text-sm text-white">{format(convert(sCash, 'GBP'))}</div>
                    <div className="text-sm text-white">{format(convert(sInvested, 'GBP'))}</div>
                    <div className={`text-sm font-medium ${delta === null ? 'text-gray-600' : delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {delta === null ? '—' : `${delta >= 0 ? '+' : '-'}${format(convert(Math.abs(delta), 'GBP'))}${deltaPct !== null ? ` (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%)` : ''}`}
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          if (editingSnapId === s.id) { setEditingSnapId(null); return }
                          setEditingSnapId(s.id)
                          setEditSnapEntries(s.entries.map(e => ({ ...e, value: String(e.value) })))
                        }}
                        className="text-xs text-gray-600 hover:text-white transition-colors uppercase tracking-widest"
                      >
                        {editingSnapId === s.id ? 'Close' : 'Edit'}
                      </button>
                      <button
                        onClick={() => deleteSnapshot(s.id)}
                        className="text-xs text-gray-600 hover:text-red-400 transition-colors uppercase tracking-widest"
                      >
                        Del
                      </button>
                    </div>
                  </div>

                  {/* Inline edit form */}
                  {editingSnapId === s.id && (
                    <div className="my-2 p-4 bg-gray-800 rounded-lg space-y-2">
                      <div className="text-xs text-gray-500 uppercase tracking-widest mb-3">
                        Editing — {new Date(s.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                      {editSnapEntries.map((entry, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-4 text-sm text-gray-400 truncate">{entry.name}</div>
                          <div className="col-span-2 text-xs text-gray-600 uppercase">{entry.type}</div>
                          <div className="col-span-2 text-xs text-gray-600">{entry.currency || 'GBP'}</div>
                          <div className="col-span-3">
                            <input
                              type="number"
                              value={entry.value}
                              onChange={e => {
                                const u = [...editSnapEntries]
                                u[idx] = { ...u[idx], value: e.target.value }
                                setEditSnapEntries(u)
                              }}
                              className={`w-full ${inputClsDark}`}
                            />
                          </div>
                          <div className="col-span-1" />
                        </div>
                      ))}
                      <div className="flex gap-3 pt-2">
                        <button
                          onClick={() => saveSnapshotEdit(s.id)}
                          disabled={editSnapLoading}
                          className="px-4 py-2 bg-emerald-400 text-gray-950 text-xs font-bold tracking-widest uppercase rounded hover:bg-emerald-300 transition-colors disabled:opacity-50"
                        >
                          {editSnapLoading ? 'Saving...' : 'Save'}
                        </button>
                        <button onClick={() => setEditingSnapId(null)} className="text-xs text-gray-500 hover:text-white tracking-widest uppercase transition-colors">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-sm text-gray-600">No snapshots yet. Add your first snapshot above.</div>
        )}
      </div>

    </div>
  )
}
