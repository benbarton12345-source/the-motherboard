import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { useCurrency } from './CurrencyContext'
import { latestBalance, groupSnapshots } from './utils/netWorthHelpers'

// Net Worth — the single data-fetching surface for the per-account model
// (`accounts` + `account_snapshots`). Home, Net Worth and Finance Overview all
// read through this so their headline figures can never drift apart; before it
// existed, Home read the legacy `net_worth_snapshots` table and silently showed
// figures frozen at the 26 July 2026 restructure.
//
// Balances are stored in each account's NATIVE currency. Everything derived here
// is normalised to GBP; components convert GBP -> display via CurrencyContext.
export function useNetWorth() {
  const { rate } = useCurrency()
  const [accounts, setAccounts] = useState([])
  const [snaps, setSnaps] = useState({})   // account_id -> history asc by date
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => (
    Promise.all([
      supabase.from('accounts').select('*').eq('active', true).order('created_at'),
      supabase.from('account_snapshots').select('*'),
    ]).then(([a, s]) => {
      if (a.data) setAccounts(a.data)
      if (s.data) setSnaps(groupSnapshots(s.data))
      setLoading(false)
    })
  ), [])

  useEffect(() => { refresh() }, [refresh])

  const fx = rate || 2.05
  const toGbp = (native, ccy) => (ccy === 'GBP' ? native : native / fx)

  const nativeOf = a => latestBalance(snaps[a.id])
  const gbpOf = a => toGbp(nativeOf(a), a.currency)

  const latestByAccount = Object.fromEntries(accounts.map(a => [a.id, nativeOf(a)]))
  const totalGbp = accounts.reduce((s, a) => s + gbpOf(a), 0)

  // Dated net-worth history, carrying each account's last known balance forward
  // across dates where only other accounts were updated.
  const allDates = [...new Set(Object.values(snaps).flat().map(r => r.snapshot_date))].sort()
  const historyGbp = allDates.map(date => {
    let gbp = 0
    for (const a of accounts) {
      let bal = null
      for (const r of (snaps[a.id] || [])) {
        if (r.snapshot_date <= date) bal = Number(r.balance)
        else break
      }
      if (bal != null) gbp += toGbp(bal, a.currency)
    }
    return { date, gbp }
  })

  const curGbp = historyGbp.length ? historyGbp[historyGbp.length - 1].gbp : 0
  const prevTotalGbp = historyGbp.length > 1 ? historyGbp[historyGbp.length - 2].gbp : null
  const deltaGbp = prevTotalGbp != null ? curGbp - prevTotalGbp : null
  const deltaPct = deltaGbp != null && prevTotalGbp ? (deltaGbp / prevTotalGbp) * 100 : null

  // GBP total per leaf asset_class — drives the asset-class donut and Home's
  // allocation card.
  const classTotalsGbp = accounts.reduce((acc, a) => {
    acc[a.asset_class] = (acc[a.asset_class] || 0) + gbpOf(a)
    return acc
  }, {})

  return {
    accounts, snaps, loading, refresh,
    nativeOf, gbpOf, toGbp, latestByAccount,
    totalGbp, historyGbp, prevTotalGbp, deltaGbp, deltaPct, classTotalsGbp,
  }
}
