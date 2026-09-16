import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

// Shared IG sync state. Owned by App so the header indicator and the Trading
// page's Sync button read and write the same thing — the button lives on the
// page, the status lives in the top bar, and they must not drift apart.
//
// Last-synced time is persisted in `ig_sync_state`, not component state, so the
// indicator still reads correctly on a fresh page load.
export function useIgSync() {
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState(null)
  const [status, setStatus] = useState('never')  // never | ok | error
  const [error, setError] = useState(null)

  const loadTrades = useCallback(() => (
    Promise.all([
      supabase.from('ig_trades')
        .select('deal_id, instrument_name, direction, open_level, close_level, price_dp, open_date, close_date, pnl, currency, r_multiple')
        .order('close_date', { ascending: true }),
      supabase.from('ig_sync_state').select('last_synced_at, last_status, last_error').eq('id', 1).maybeSingle(),
    ]).then(([t, st]) => {
      if (t.error) setError(t.error.message)
      else setTrades(t.data || [])

      if (st.data) {
        setLastSyncedAt(st.data.last_synced_at || null)
        setStatus(st.data.last_status || 'never')
        // Surface a failure from a previous session, not just this one.
        if (st.data.last_status === 'error') setError(st.data.last_error || 'Last sync failed')
      }
      setLoading(false)
    })
  ), [])

  useEffect(() => { loadTrades() }, [loadTrades])

  const sync = useCallback(async () => {
    setSyncing(true)
    setError(null)
    try {
      const resp = await fetch('/api/ig-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const body = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(body.detail || body.error || `Sync failed (${resp.status})`)
      setStatus('ok')
      // Re-read rather than trusting the response: the function is the writer,
      // the table is the truth, and this also picks up the new synced-at stamp.
      await loadTrades()
      return body
    } catch (err) {
      setStatus('error')
      setError(String(err.message || err))
      return null
    } finally {
      setSyncing(false)
    }
  }, [loadTrades])

  return { trades, loading, syncing, lastSyncedAt, status, error, sync, reload: loadTrades }
}
