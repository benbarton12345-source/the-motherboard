import { createClient } from '@supabase/supabase-js'

// IG closed-trade sync. Same shape as the other functions here: credentials live
// in Vercel env vars and never reach the browser.
//
// Two IG endpoints are needed, not one:
//   /history/transactions (v2) — the closed trade itself: instrument, levels,
//       dates, realised P&L. This is the canonical record and the only source of
//       truth for P&L.
//   /history/activity (v3, detailed) — the *original stop*. Transactions do not
//       carry it, so without this there is no R multiple. Matched back onto the
//       trade by deal reference; anything that fails to match keeps a null stop
//       and a null R, and the table renders a dash for it.
//
// Re-running is safe: rows are upserted on `deal_id` (IG's transaction reference),
// so the same trade always lands on the same row.

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

const IG_BASE = {
  demo: 'https://demo-api.ig.com/gateway/deal',
  live: 'https://api.ig.com/gateway/deal',
}

// How far back to look when there is no previous sync to resume from.
const BACKFILL_MONTHS = 24
// Re-pull a few days either side of the last sync: IG can settle a trade slightly
// after the fact, and re-pulling is free because the upsert is idempotent.
const OVERLAP_DAYS = 7

// ── Parsing helpers ─────────────────────────────────────────────────────────
// IG returns numbers as display strings: levels like "18,240.4", P&L like "£-15.60".

export function toNumber(raw) {
  if (raw == null) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const m = String(raw).replace(/,/g, '').match(/-?\d*\.?\d+/)
  if (!m) return null
  const n = parseFloat(m[0])
  return Number.isFinite(n) ? n : null
}

// Decimal places the instrument quotes in. IG has no field for this, but it
// already formats levels to the instrument's own precision, so the string tells us.
export function decimalsOf(raw) {
  if (raw == null) return null
  const s = String(raw).replace(/,/g, '')
  const dot = s.indexOf('.')
  return dot === -1 ? 0 : s.length - dot - 1
}

// IG's *Utc fields are UTC but carry no zone suffix, so Date would read them as local.
export function toIso(raw) {
  if (!raw) return null
  const s = String(raw).trim()
  const norm = /(Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s.replace(' ', 'T')}Z`
  const d = new Date(norm)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// IG wants 'YYYY-MM-DDTHH:mm:ss', no zone, no milliseconds — and reads it in the
// ACCOUNT's local time, not UTC. The session reports that offset in hours. Without
// applying it, a window ending "now" in UTC silently drops every trade closed in
// the last `tzOffsetHours` hours, which is exactly the newest ones. Verified
// against a real account: to=now(UTC) returned 0 deals where to=now+2h returned 3.
export function igDate(d, tzOffsetHours = 0) {
  return new Date(d.getTime() + tzOffsetHours * 3600000).toISOString().slice(0, 19)
}

function normaliseName(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// ── IG client ───────────────────────────────────────────────────────────────

export async function igLogin(base, apiKey, username, password) {
  const resp = await fetch(`${base}/session`, {
    method: 'POST',
    headers: {
      'X-IG-API-KEY': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json; charset=UTF-8',
      VERSION: '2',
    },
    body: JSON.stringify({ identifier: username, password }),
  })

  if (!resp.ok) {
    const detail = await resp.text()
    throw new Error(`IG auth failed (${resp.status}): ${detail}`)
  }

  const cst = resp.headers.get('CST')
  const token = resp.headers.get('X-SECURITY-TOKEN')
  if (!cst || !token) throw new Error('IG auth succeeded but returned no session tokens')

  const body = await resp.json().catch(() => ({}))
  return {
    headers: {
      'X-IG-API-KEY': apiKey,
      CST: cst,
      'X-SECURITY-TOKEN': token,
      Accept: 'application/json; charset=UTF-8',
    },
    accountId: body?.currentAccountId ?? null,
    currency: body?.currencyIsoCode ?? null,
    // Hours to add to UTC to get account-local time; every history query needs it.
    timezoneOffset: Number(body?.timezoneOffset) || 0,
  }
}

export async function igGet(base, path, headers, version) {
  const resp = await fetch(`${base}${path}`, {
    headers: { ...headers, VERSION: String(version) },
  })
  if (!resp.ok) {
    const detail = await resp.text()
    throw new Error(`IG GET ${path} failed (${resp.status}): ${detail}`)
  }
  return resp.json()
}

// Closed deals. Paged by page number; v2 reports totalPages in metadata.
export async function fetchTransactions(base, headers, from, to, tz = 0) {
  const out = []
  let page = 1
  let totalPages = 1

  while (page <= totalPages && page <= 100) {
    const qs = new URLSearchParams({
      type: 'ALL_DEAL',
      from: igDate(from, tz),
      to: igDate(to, tz),
      pageSize: '500',
      pageNumber: String(page),
    })
    const data = await igGet(base, `/history/transactions?${qs}`, headers, 2)
    out.push(...(data?.transactions || []))
    totalPages = data?.metadata?.pageData?.totalPages ?? 1
    page += 1
  }
  return out
}

// Activity, only for the stop. Paged by an opaque `next` cursor rather than page number.
export async function fetchActivity(base, headers, from, to, tz = 0) {
  const out = []
  const qs = new URLSearchParams({
    from: igDate(from, tz),
    to: igDate(to, tz),
    detailed: 'true',
    pageSize: '500',
  })
  let path = `/history/activity?${qs}`
  let guard = 0

  while (path && guard < 100) {
    const data = await igGet(base, path, headers, 3)
    out.push(...(data?.activities || []))
    const next = data?.metadata?.paging?.next
    path = next ? (next.startsWith('/') ? next : `/${next}`) : null
    guard += 1
  }
  return out
}

// ── Stop index ──────────────────────────────────────────────────────────────
// Build a lookup from every identifier an opening activity exposes to its stop.
// Which of those identifiers a transaction's `reference` matches varies, so we
// index all of them rather than betting on one.
//
// Units matter here and are easy to get wrong: IG quotes `stopDistance` in the
// instrument's *points*, which are not price units. A 50-point stop on GBP/USD
// is 0.005 of the level, but 50 points on Germany 40 is 50.0 of it. Everything
// below is therefore normalised to price units, so it can be compared against
// the difference between two levels.
export function buildStopIndex(activities) {
  const byRef = new Map()
  const byShape = new Map()

  // Points-to-price factor per market, learned from activities that happen to
  // carry both forms of the same stop. This is measured from IG's own numbers,
  // not assumed from the instrument type.
  const factors = new Map()
  for (const act of activities || []) {
    const d = act?.details
    if (!d) continue
    const level = toNumber(d.level)
    const stopLevel = toNumber(d.stopLevel)
    const stopDistance = toNumber(d.stopDistance)
    if (!level || !stopLevel || !stopDistance || stopDistance <= 0) continue
    const market = normaliseName(d.marketName)
    if (market && !factors.has(market)) factors.set(market, Math.abs(level - stopLevel) / stopDistance)
  }

  // A transaction's `reference` is the CLOSING deal's id, but the stop lives on the
  // OPENING deal. Verified on real data: ref DIAAAAYGQGQMFBY is the close, whose
  // action carries affectedDealId DIAAAAYGQF53UAG — the open. Without this hop the
  // join misses every stop, so map close -> open first.
  const closeToOpen = new Map()
  for (const act of activities || []) {
    for (const a of act?.details?.actions || []) {
      if (a?.affectedDealId && String(a.actionType || '').includes('CLOS')) {
        closeToOpen.set(String(act.dealId), String(a.affectedDealId))
      }
    }
  }

  // Two passes so a stop set at open always beats one from a later amendment:
  // the brief wants the risk originally taken, not whatever it was moved to.
  const index = (act, preferOpenOnly) => {
    const d = act?.details
    if (!d) return

    const level = toNumber(d.level)
    const stopLevel = toNumber(d.stopLevel)
    const rawDistance = toNumber(d.stopDistance)
    const factor = factors.get(normaliseName(d.marketName))

    // stopLevel is already in price units, so it is the trustworthy source.
    // stopDistance is only usable once we know that market's factor; without one
    // we leave the stop unknown rather than guess at a scale.
    let stop = null
    if (level && stopLevel) stop = Math.abs(level - stopLevel)
    else if (rawDistance && rawDistance > 0 && factor) stop = rawDistance * factor

    // IG reports "no stop" as 0 as often as null, so treat both as absent.
    if (!stop || stop <= 0) return

    const actions = d.actions || []
    const isOpen = actions.some(a => String(a?.actionType || '').includes('OPEN'))
    if (preferOpenOnly !== isOpen) return

    const entry = { stopDistance: stop, direction: d.direction || null, level }

    const keys = [act.dealId, d.dealReference]
    for (const a of actions) {
      if (a?.affectedDealId) keys.push(a.affectedDealId)
    }
    for (const k of keys) {
      if (k && !byRef.has(String(k))) byRef.set(String(k), entry)
    }

    // Fallback for trades whose reference matches nothing: an open at the same
    // level on the same market in the same direction is the same position.
    if (level && d.marketName && d.direction) {
      const shape = `${normaliseName(d.marketName)}|${d.direction}|${level.toFixed(5)}`
      if (!byShape.has(shape)) byShape.set(shape, entry)
    }
  }

  for (const act of activities || []) index(act, true)   // opens win
  for (const act of activities || []) index(act, false)  // amendments only fill gaps

  return { byRef, byShape, closeToOpen }
}

// ── Transaction -> row ──────────────────────────────────────────────────────

export function buildRow(tx, stops) {
  const reference = tx?.reference
  if (!reference) return null
  // Interest, dividends, funding and the like are not trades.
  if (tx?.cashTransaction === true) return null

  const openLevel = toNumber(tx.openLevel)
  const closeLevel = toNumber(tx.closeLevel)
  const pnl = toNumber(tx.profitAndLoss)
  const closeDate = toIso(tx.dateUtc || tx.date)

  // A closed trade needs both ends and a settled P&L; anything else is not one.
  if (openLevel == null || closeLevel == null || pnl == null || !closeDate) return null

  const size = toNumber(tx.size)
  // Direct hit first, then via the closing deal's affectedDealId, then by shape.
  const openRef = stops.closeToOpen?.get(String(reference))
  const matched =
    stops.byRef.get(String(reference)) ||
    (openRef ? stops.byRef.get(openRef) : null) ||
    (openLevel != null && tx.instrumentName
      ? stops.byShape.get(`${normaliseName(tx.instrumentName)}|BUY|${openLevel.toFixed(5)}`) ||
        stops.byShape.get(`${normaliseName(tx.instrumentName)}|SELL|${openLevel.toFixed(5)}`)
      : null)

  // Direction, best source first. IG's activity states it outright. Failing that,
  // the trade states it implicitly: a long makes money when price rises, so the
  // sign of the move agreeing with the sign of the P&L means it was a buy. The
  // sign of `size` is the last resort — its convention varies by product.
  let direction = matched?.direction === 'BUY' || matched?.direction === 'SELL' ? matched.direction : null
  if (!direction && pnl !== 0 && closeLevel !== openLevel) {
    direction = Math.sign(closeLevel - openLevel) === Math.sign(pnl) ? 'BUY' : 'SELL'
  }
  if (!direction) direction = size != null && size < 0 ? 'SELL' : 'BUY'

  // R is the move in the trade's favour measured in units of the risk taken.
  // Deriving it from levels alone sidesteps needing the per-point value:
  //   R = pnl / (stop x size x pointValue)  and  pnl = move x size x pointValue
  //   => R = move / stop
  // Both terms are in price units (see buildStopIndex), so this is unit-safe.
  const stopDistance = matched?.stopDistance ?? null
  const move = direction === 'BUY' ? closeLevel - openLevel : openLevel - closeLevel
  const rMultiple = stopDistance ? Number((move / stopDistance).toFixed(3)) : null

  // Prefer whichever level was quoted more precisely; they should agree.
  const dp = Math.max(decimalsOf(tx.openLevel) ?? 0, decimalsOf(tx.closeLevel) ?? 0)

  return {
    deal_id: String(reference),
    instrument_name: tx.instrumentName || 'Unknown',
    direction,
    open_level: openLevel,
    close_level: closeLevel,
    price_dp: dp,
    open_date: toIso(tx.openDateUtc) || null,
    close_date: closeDate,
    pnl,
    currency: tx.currency || null,
    size: size != null ? Math.abs(size) : null,
    stop_distance: stopDistance,
    r_multiple: rMultiple,
    raw: tx,
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.IG_API_KEY
  const username = process.env.IG_USERNAME
  const password = process.env.IG_PASSWORD
  const accountType = (process.env.IG_ACCOUNT_TYPE || 'demo').toLowerCase()

  const missing = [
    !apiKey && 'IG_API_KEY',
    !username && 'IG_USERNAME',
    !password && 'IG_PASSWORD',
  ].filter(Boolean)
  if (missing.length) {
    return res.status(500).json({ error: `Missing environment variables: ${missing.join(', ')}` })
  }

  const base = IG_BASE[accountType] || IG_BASE.demo

  try {
    // Resume from the last sync unless asked for a full backfill.
    const { data: state } = await supabase
      .from('ig_sync_state').select('last_synced_at').eq('id', 1).maybeSingle()

    // A few minutes of forward slack absorbs clock skew between this function and
    // IG; no future trades can exist, so the upper bound costs nothing.
    const to = new Date(Date.now() + 5 * 60 * 1000)
    let from
    if (req.body?.full || !state?.last_synced_at) {
      from = new Date(to)
      from.setMonth(from.getMonth() - BACKFILL_MONTHS)
    } else {
      from = new Date(new Date(state.last_synced_at).getTime() - OVERLAP_DAYS * 86400000)
    }
    if (req.body?.from) {
      const explicit = new Date(req.body.from)
      if (!Number.isNaN(explicit.getTime())) from = explicit
    }

    const session = await igLogin(base, apiKey, username, password)

    const tz = session.timezoneOffset
    const [transactions, activities] = await Promise.all([
      fetchTransactions(base, session.headers, from, to, tz),
      // The stop is a nice-to-have: if activity fails, the sync still records the
      // trades, just without R. Losing P&L because of it would be the wrong trade-off.
      fetchActivity(base, session.headers, from, to, tz).catch(err => {
        console.error('ig-sync: activity fetch failed, continuing without stops:', err.message)
        return []
      }),
    ])

    const stops = buildStopIndex(activities)
    const rows = []
    const seen = new Set()
    for (const tx of transactions) {
      const row = buildRow(tx, stops)
      // Guard the upsert: a repeated reference in one payload would make Postgres
      // reject the whole batch ("cannot affect row a second time").
      if (row && !seen.has(row.deal_id)) {
        seen.add(row.deal_id)
        rows.push(row)
      }
    }

    if (rows.length) {
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase
          .from('ig_trades')
          .upsert(rows.slice(i, i + 500), { onConflict: 'deal_id' })
        if (error) throw new Error(`Supabase upsert failed: ${error.message}`)
      }
    }

    const withR = rows.filter(r => r.r_multiple != null).length
    const syncedAt = new Date().toISOString()

    await supabase.from('ig_sync_state').upsert({
      id: 1,
      last_synced_at: syncedAt,
      last_status: 'ok',
      last_error: null,
      trades_synced: rows.length,
      updated_at: syncedAt,
    }, { onConflict: 'id' })

    return res.status(200).json({
      ok: true,
      accountType,
      accountId: session.accountId,
      accountCurrency: session.currency,
      timezoneOffset: tz,
      from: from.toISOString(),
      to: to.toISOString(),
      transactionsFetched: transactions.length,
      activitiesFetched: activities.length,
      tradesUpserted: rows.length,
      tradesWithR: withR,
      syncedAt,
    })
  } catch (err) {
    console.error('ig-sync failed:', err)
    const syncedAt = new Date().toISOString()
    await supabase.from('ig_sync_state').upsert({
      id: 1,
      last_status: 'error',
      last_error: String(err.message || err).slice(0, 500),
      updated_at: syncedAt,
    }, { onConflict: 'id' }).then(() => {}, () => {})

    return res.status(502).json({ error: 'IG sync failed', detail: String(err.message || err) })
  }
}
