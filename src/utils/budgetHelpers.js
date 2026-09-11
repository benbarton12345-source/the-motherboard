// Budget — shared pure helpers. Extracted from FinancePage so the Home budget
// card and the Budgeting page compute identical figures rather than each
// carrying their own copy of the conversion rules.

// Frequency -> monthly equivalent. Documented in BRIEF.md under
// "Frequency-to-monthly conversion" — keep the two in step.
export function toMonthly(amount, frequency) {
  switch (frequency) {
    case 'monthly':     return amount
    case 'fortnightly': return amount * 26 / 12
    case 'weekly':      return amount * 52 / 12
    case 'quarterly':   return amount / 3
    case 'annual':      return amount / 12
    default:            return amount
  }
}

// First-of-next-month for a `YYYY-MM-01` string — the exclusive upper bound used
// by every month-scoped budget_entries query.
export function monthEnd(month) {
  const [y, m] = month.split('-').map(Number)
  return `${m === 12 ? y + 1 : y}-${String(m % 12 + 1).padStart(2, '0')}-01`
}

// Current month as `YYYY-MM-01`, from local date components (never toISOString —
// see the Timezone note in BRIEF.md).
export function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// Seed a month's active recurring items as budget entries, inserting only those
// not already present. Shared by the Budgeting page and the Home budget card so
// both months seed identically.
//
// This deliberately uses a plain insert rather than an upsert. The 9 Aug 2026
// fit-up used `.upsert(..., { onConflict: 'month,recurring_item_id' })` against a
// PARTIAL unique index (`where recurring_item_id is not null`). Postgres cannot
// infer a partial index for ON CONFLICT unless the predicate is restated, which
// PostgREST cannot express, so every seed failed with 42P10 and new months were
// never populated. Duplicates are already excluded in JS below; the unique index
// remains the backstop for a concurrent seed, and a rejected race is swallowed
// rather than thrown.
export function seedMissingRecurring(supabase, { month, recurringItems, entries }) {
  const seeded = new Set(entries.filter(e => e.recurring_item_id).map(e => e.recurring_item_id))
  const missing = (recurringItems || []).filter(r => r.active && !seeded.has(r.id))
  if (missing.length === 0) return Promise.resolve(false)

  return supabase.from('budget_entries').insert(
    missing.map(r => ({
      month,
      category: 'Recurring',
      type: r.type === 'income' ? 'income' : 'expense',
      amount: toMonthly(r.amount, r.frequency),
      currency: r.currency || 'GBP',
      notes: r.name,
      recurring_item_id: r.id,
    }))
  ).then(({ error }) => {
    // A concurrent seed winning the race trips the unique index — that is the
    // guard working, not a failure. Caller refetches either way.
    if (error) console.warn('[budget] recurring seed skipped:', error.message)
    return true
  })
}
