// Budgeting Insights settings — savings-rate target + FI target/date.
//
// Persisted in Supabase `app_settings` (single row, RLS disabled — same pattern
// as health_settings). See sql/app_settings.sql for the table definition; run it
// once in the Supabase dashboard. loadSettings tolerates the table not existing
// yet (returns defaults) so the app keeps working before the migration is run.
//
// FI target is stored in GBP (net worth's base currency). The target date
// defaults to ~10 years out, which also drives the "required monthly" figure.

import { supabase } from '../supabase'

export const DEFAULT_SETTINGS = {
  savingsTarget: 0.45,        // fraction of income
  fiTarget: 1_500_000,        // GBP
  fiTargetDate: defaultTargetDate(), // 'YYYY-MM-01', ~10 years out
}

function defaultTargetDate() {
  const d = new Date()
  return `${d.getFullYear() + 10}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

const fromRow = (row) => ({
  savingsTarget: row.savings_target ?? DEFAULT_SETTINGS.savingsTarget,
  fiTarget: row.fi_target ?? DEFAULT_SETTINGS.fiTarget,
  fiTargetDate: row.fi_target_date || DEFAULT_SETTINGS.fiTargetDate,
})
const toRow = (s) => ({
  savings_target: s.savingsTarget,
  fi_target: s.fiTarget,
  fi_target_date: s.fiTargetDate,
})

// Returns { settings, id }. id is the row's uuid (null if no row / table absent).
export async function loadSettings() {
  const { data, error } = await supabase.from('app_settings').select('*').limit(1).maybeSingle()
  if (error || !data) return { settings: { ...DEFAULT_SETTINGS }, id: null }
  return { settings: fromRow(data), id: data.id }
}

// Upsert the single row; returns the row id (insert-if-missing, else update).
export async function saveSettings(settings, id) {
  const payload = toRow(settings)
  if (id) {
    const { error } = await supabase.from('app_settings').update(payload).eq('id', id)
    if (error) console.error('app_settings update error:', error)
    return id
  }
  const { data, error } = await supabase.from('app_settings').insert(payload).select('id').maybeSingle()
  if (error) console.error('app_settings insert error:', error)
  return data?.id ?? null
}

// Whole months between now and the FI target date (min 1).
export function monthsToTarget(fiTargetDate) {
  const [y, m] = (fiTargetDate || '').split('-').map(Number)
  if (!y) return 120
  const now = new Date()
  const months = (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth())
  return Math.max(1, months)
}
