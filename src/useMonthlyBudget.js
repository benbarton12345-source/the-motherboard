import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { useCurrency } from './CurrencyContext'
import { monthEnd, currentMonth, seedMissingRecurring } from './utils/budgetHelpers'

// Monthly budget — the shared fetch-and-seed used by both the Budgeting page and
// the Home budget card. Home previously read `budget_entries` raw without the
// recurring seed, so any month not yet opened in Finance showed an empty or
// partial budget.
//
// Seeding inserts the month's active recurring items as budget entries via the
// shared `seedMissingRecurring` helper, so running it from more than one place is
// safe (see that helper for why it is an insert, not an upsert).
export function useMonthlyBudget(month = currentMonth(), { seed = true } = {}) {
  const { rate } = useCurrency()
  const [entries, setEntries] = useState([])
  const [recurringItems, setRecurringItems] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchEntries = useCallback(() => (
    supabase.from('budget_entries').select('*')
      .gte('month', month).lt('month', monthEnd(month))
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const rows = data || []
        setEntries(rows)
        return rows
      })
  ), [month])

  const refresh = useCallback(() => (
    supabase.from('recurring_items').select('*').order('created_at')
      .then(({ data }) => {
        const recurring = data || []
        setRecurringItems(recurring)
        return fetchEntries().then(rows => ({ recurring, rows }))
      })
      .then(({ recurring, rows }) => {
        if (!seed) return null
        return seedMissingRecurring(supabase, { month, recurringItems: recurring, entries: rows })
          .then(didInsert => (didInsert ? fetchEntries() : null))
      })
      .then(() => { setLoading(false) })
  ), [month, seed, fetchEntries])

  useEffect(() => { refresh() }, [refresh])

  const fx = rate || 2.05
  const toGbp = (amount, ccy) => ((ccy || 'GBP') === 'GBP' ? amount : amount / fx)
  const sumGbp = type => entries
    .filter(e => e.type === type)
    .reduce((s, e) => s + toGbp(parseFloat(e.amount) || 0, e.currency), 0)

  const totalIncomeGbp = sumGbp('income')
  const totalExpenseGbp = sumGbp('expense')
  const savedGbp = totalIncomeGbp - totalExpenseGbp
  const saveRate = totalIncomeGbp > 0 ? (savedGbp / totalIncomeGbp) * 100 : 0

  return {
    month, entries, recurringItems, loading,
    refresh, fetchEntries,
    totalIncomeGbp, totalExpenseGbp, savedGbp, saveRate,
  }
}
