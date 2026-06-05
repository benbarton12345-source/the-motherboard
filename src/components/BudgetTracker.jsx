import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useCurrency } from '../CurrencyContext'

const INCOME_CATEGORIES = ['Salary', 'Trading', 'Dividends', 'Bonus', 'Other']
const EXPENSE_CATEGORIES = ['Rent', 'Food', 'Transport', 'Subscriptions', 'Entertainment', 'Health', 'Clothing', 'Other']

const emptyEntry = { category: '', amount: '', notes: '', currency: 'GBP' }

function getMonthOptions() {
  const months = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({
      label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      value: d.toISOString().split('T')[0]
    })
  }
  return months
}

export default function BudgetTracker() {
  const { convert, format } = useCurrency()
  const months = getMonthOptions()
  const [selectedMonth, setSelectedMonth] = useState(months[0].value)
  const [entries, setEntries] = useState([])
  const [showForm, setShowForm] = useState(null)
  const [form, setForm] = useState({ ...emptyEntry, category: INCOME_CATEGORIES[0] })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchEntries()
  }, [selectedMonth])

  async function fetchEntries() {
    const start = selectedMonth
    const end = new Date(new Date(selectedMonth).getFullYear(), new Date(selectedMonth).getMonth() + 1, 1).toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('budget_entries')
      .select('*')
      .gte('month', start)
      .lt('month', end)
      .order('created_at', { ascending: false })
    if (!error) setEntries(data)
  }

  async function handleSubmit(type) {
    setLoading(true)
    const { error } = await supabase.from('budget_entries').insert([{
      month: selectedMonth,
      category: form.category,
      type,
      amount: parseFloat(form.amount),
      currency: form.currency || 'GBP',
      notes: form.notes || null,
    }])
    if (!error) {
      setForm({ ...emptyEntry, currency: 'GBP', category: type === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0] })
      setShowForm(null)
      fetchEntries()
    }
    setLoading(false)
  }

  async function handleDelete(id) {
    await supabase.from('budget_entries').delete().eq('id', id)
    fetchEntries()
  }

  const income = entries.filter(e => e.type === 'income')
  const expenses = entries.filter(e => e.type === 'expense')
  const totalIncome = income.reduce((sum, e) => sum + convert(parseFloat(e.amount), e.currency || 'GBP'), 0)
  const totalExpenses = expenses.reduce((sum, e) => sum + convert(parseFloat(e.amount), e.currency || 'GBP'), 0)
  const net = totalIncome - totalExpenses

  const expensesByCategory = EXPENSE_CATEGORIES.map(cat => ({
    category: cat,
    amount: expenses.filter(e => e.category === cat).reduce((sum, e) => sum + convert(parseFloat(e.amount), e.currency || 'GBP'), 0)
  })).filter(c => c.amount > 0)

  return (
    <div className="space-y-6">

      {/* Month selector */}
      <div className="flex items-center gap-3">
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="bg-gray-900 border border-gray-800 rounded px-4 py-2 text-white text-sm focus:outline-none focus:border-emerald-400"
        >
          {months.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Income</div>
          <div className="text-2xl font-bold text-emerald-400">{format(totalIncome)}</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Expenses</div>
          <div className="text-2xl font-bold text-red-400">{format(totalExpenses)}</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Net</div>
          <div className={`text-2xl font-bold ${net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {net >= 0 ? '+' : ''}{format(Math.abs(net))}
          </div>
        </div>
      </div>

      {/* Income section */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm tracking-widest uppercase text-gray-400">Income</h3>
          <button
            onClick={() => {
              setShowForm(showForm === 'income' ? null : 'income')
              setForm({ ...emptyEntry, category: INCOME_CATEGORIES[0] })
            }}
            className="text-xs tracking-widest uppercase px-4 py-2 border border-emerald-400 text-emerald-400 rounded hover:bg-emerald-400 hover:text-gray-950 transition-colors"
          >
            {showForm === 'income' ? 'Cancel' : '+ Add'}
          </button>
        </div>

        {showForm === 'income' && (
          <div className="mb-4 grid grid-cols-12 gap-3 items-center">
            <div className="col-span-3">
              <select
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400"
              >
                {INCOME_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <select
                value={form.currency || 'GBP'}
                onChange={e => setForm({ ...form, currency: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400"
              >
                <option value="GBP">GBP</option>
                <option value="AUD">AUD</option>
              </select>
            </div>
            <div className="col-span-2">
              <input
                type="number"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                placeholder="0"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400"
              />
            </div>
            <div className="col-span-3">
              <input
                type="text"
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Notes (optional)"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400"
              />
            </div>
            <div className="col-span-2">
              <button
                onClick={() => handleSubmit('income')}
                disabled={loading || !form.amount}
                className="w-full px-3 py-2 bg-emerald-400 text-gray-950 text-xs font-bold tracking-widest uppercase rounded hover:bg-emerald-300 transition-colors disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {income.length === 0 ? (
          <div className="text-sm text-gray-600">No income entries yet</div>
        ) : (
          <div className="space-y-2">
            {income.map(e => (
              <div key={e.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                <div>
                  <span className="text-sm text-white">{e.category}</span>
                  {e.notes && <span className="text-xs text-gray-500 ml-2">{e.notes}</span>}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-emerald-400">{format(convert(parseFloat(e.amount), e.currency || 'GBP'))}</span>
                  <button onClick={() => handleDelete(e.id)} className="text-xs text-gray-600 hover:text-red-400 transition-colors uppercase tracking-widest">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Expenses section */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm tracking-widest uppercase text-gray-400">Expenses</h3>
          <button
            onClick={() => {
              setShowForm(showForm === 'expense' ? null : 'expense')
              setForm({ ...emptyEntry, category: EXPENSE_CATEGORIES[0] })
            }}
            className="text-xs tracking-widest uppercase px-4 py-2 border border-red-400 text-red-400 rounded hover:bg-red-400 hover:text-gray-950 transition-colors"
          >
            {showForm === 'expense' ? 'Cancel' : '+ Add'}
          </button>
        </div>

        {showForm === 'expense' && (
          <div className="mb-4 grid grid-cols-12 gap-3 items-center">
            <div className="col-span-3">
              <select
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400"
              >
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <select
                value={form.currency || 'GBP'}
                onChange={e => setForm({ ...form, currency: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400"
              >
                <option value="GBP">GBP</option>
                <option value="AUD">AUD</option>
              </select>
            </div>
            <div className="col-span-2">
              <input
                type="number"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                placeholder="0"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400"
              />
            </div>
            <div className="col-span-3">
              <input
                type="text"
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Notes (optional)"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400"
              />
            </div>
            <div className="col-span-2">
              <button
                onClick={() => handleSubmit('expense')}
                disabled={loading || !form.amount}
                className="w-full px-3 py-2 bg-red-400 text-white text-xs font-bold tracking-widest uppercase rounded hover:bg-red-300 transition-colors disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {expenses.length === 0 ? (
          <div className="text-sm text-gray-600">No expense entries yet</div>
        ) : (
          <div className="space-y-2">
            {expenses.map(e => (
              <div key={e.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                <div>
                  <span className="text-sm text-white">{e.category}</span>
                  {e.notes && <span className="text-xs text-gray-500 ml-2">{e.notes}</span>}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-red-400">{format(convert(parseFloat(e.amount), e.currency || 'GBP'))}</span>
                  <button onClick={() => handleDelete(e.id)} className="text-xs text-gray-600 hover:text-red-400 transition-colors uppercase tracking-widest">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Expense breakdown */}
      {expensesByCategory.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h3 className="text-sm tracking-widest uppercase text-gray-400 mb-4">Expenses by Category</h3>
          <div className="space-y-3">
            {expensesByCategory.sort((a, b) => b.amount - a.amount).map(c => (
              <div key={c.category}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">{c.category}</span>
                  <span className="text-xs text-white">{format(c.amount)}</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-1">
                  <div
                    className="bg-red-400 h-1 rounded-full"
                    style={{ width: `${(c.amount / totalExpenses) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}