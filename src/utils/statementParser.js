// Statement CSV parsing, description cleaning, and Layer-1 classification for the
// statement-import flow. Pure functions — no DB, no React, no AI.
//
// Normalised transaction shape used throughout:
//   { date: 'YYYY-MM-DD', rawDescription, description (cleaned), amount (positive
//     magnitude in $), kind: 'debit' | 'credit', source: 'commbank' | 'amex' }
//
// NOTE: the description-cleaning regexes and the Amex column order below are built
// to the handoff spec but should be validated against real CommBank/Amex exports —
// bank CSV formats vary and these are the parts most likely to need tuning.

import { matchCategoryByKeyword } from './categoryRules'

// ── CSV parsing (quote-aware; bank descriptions can contain commas) ──
export function parseCSV(text) {
  const rows = []
  let field = '', row = [], inQuotes = false
  const s = (text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.some(f => f.trim() !== ''))
}

function parseDMY(s) {
  const m = (s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!m) return null
  let [, d, mo, y] = m
  if (y.length === 2) y = '20' + y
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function parseAmount(s) {
  const n = parseFloat(String(s).replace(/[$,\s]/g, ''))
  return isNaN(n) ? 0 : n
}

// ── Description cleaning ─────────────────────────────────────────────
export function cleanCommbankDescription(raw) {
  let d = raw || ''
  d = d.split(/card\s*xx/i)[0]        // strip "Card xx1234 ..." onward
  d = d.split(/value\s*date:/i)[0]    // strip "Value Date: ..." onward
  d = d.replace(/\b\d{6,}\b/g, ' ')   // strip long reference numbers
  d = d.replace(/\b(AUS?|USA?|NZL?|GBR?)\b\s*$/i, '') // trailing country code
  return d.replace(/\s+/g, ' ').trim()
}

export function cleanAmexDescription(raw) {
  // Amex rows are typically "MERCHANT NAME     CITY   STATE" — collapse runs of
  // whitespace and drop a trailing location suffix, keeping the merchant name.
  let d = (raw || '').replace(/\s{2,}/g, '  ').trim()
  const parts = d.split(/\s{2,}/)
  if (parts.length > 1) d = parts[0]
  d = d.replace(/^\d+\s+/, '')        // strip a leading store number ("244 JB HI-FI")
  d = d.replace(/\s+\d{4,}\s*$/, '')  // strip a trailing reference number ("MOLESCAN 72469")
  return d.replace(/\s+/g, ' ').trim()
}

// ── Parsers ──────────────────────────────────────────────────────────
// CommBank: no header. Columns: Date, Amount (signed), Description, Running Balance.
export function parseCommbankCSV(text) {
  const out = []
  for (const cols of parseCSV(text)) {
    if (cols.length < 3) continue
    const date = parseDMY(cols[0])
    if (!date) continue // skips any stray header/blank row
    const signed = parseAmount(cols[1])
    const raw = cols[2] || ''
    out.push({
      date,
      rawDescription: raw,
      description: cleanCommbankDescription(raw),
      amount: Math.abs(signed),
      kind: signed < 0 ? 'debit' : 'credit',
      source: 'commbank',
    })
  }
  return out
}

// Amex: has a header row (skipped). Columns: Date, Date Processed, Description,
// Amount (all positive debits).
export function parseAmexCSV(text) {
  const rows = parseCSV(text)
  const out = []
  for (let i = 0; i < rows.length; i++) {
    const cols = rows[i]
    const date = parseDMY(cols[0])
    if (!date) continue // header row (non-date first cell) is skipped here
    const raw = cols[2] || ''
    out.push({
      date,
      rawDescription: raw,
      description: cleanAmexDescription(raw),
      amount: parseAmount(cols[3]),
      kind: 'debit',
      source: 'amex',
    })
  }
  return out
}

// ── Layer 1 — exclusions & special handling (matched on the RAW description) ──
// Returns a routing object, or null to fall through to keyword/AI layers.
export function classifyLayer1(txn) {
  const raw = (txn.rawDescription || '').toUpperCase()
  const isCredit = txn.kind === 'credit'

  if (raw.includes('LIFENET WAGES')) return { route: 'recurring', target: 'salary' }
  if (raw.includes('DEFT PAYMENTS')) return { route: 'recurring', target: 'rent' }
  if (raw.includes('CASH DEPOSIT')) return { route: 'excluded', reason: 'Internal money movement' }

  // Amex bill payment on the Commbank statement — an inter-account transfer, not
  // real spending; the underlying purchases are captured via the Amex CSV import.
  // Scoped to Commbank so it can't swallow a genuine Amex line (word boundary on
  // AMEX avoids matching merchant names like "AMEXICO").
  if (txn.source === 'commbank' && (raw.includes('AMERICAN EXPRESS') || /\bAMEX\b/.test(raw))) {
    return { route: 'excluded', reason: 'Amex bill payment — captured via Amex import' }
  }

  if (isCredit) {
    if (raw.includes('LAURA HOLDSWORTH')) return { route: 'reimbursement', laura: true }
    if (/\bTRANSFER FROM\b/.test(raw)) return { route: 'reimbursement', laura: false }
    return { route: 'needs_review', reason: 'Unclassified incoming' } // any other positive Commbank amount
  }

  if (raw.includes('TRANSFER TO LAURA')) {
    if (raw.includes('REGO')) return { route: 'confident', category: 'Vehicle' }
    if (raw.includes('GAS') || raw.includes('UTILITIES')) return { route: 'confident', category: 'Utilities' }
    return { route: 'needs_review', reason: 'Transfer to Laura — no recognised reference' }
  }

  return null
}

let _nrId = 0
const nrItem = (txn, needsAI, reason) => ({
  id: `nr-${_nrId++}`,
  date: txn.date,
  merchant: txn.description || txn.rawDescription,
  amount: txn.amount,
  source: txn.source,
  needsAI,
  reason: reason || null,
  aiSuggested: null,
})

// ── Full Layer 1 + Layer 2 pass ──────────────────────────────────────
// Produces everything the review screen needs EXCEPT the AI suggestions for
// Section C — the caller batches `unmatchedForAI` to the serverless function
// and then fills each item's `aiSuggested`.
export function buildReview(txns) {
  const recurring = {
    salary: { count: 0, total: 0 },
    rent: { total: 0, lauraIncoming: 0 },
  }
  const reimbursements = { total: 0, items: [] }
  const excluded = []
  const confident = {} // category -> { total, txns: [] }
  const needsReview = []

  const addConfident = (category, txn) => {
    if (!confident[category]) confident[category] = { total: 0, txns: [] }
    confident[category].total += txn.amount
    confident[category].txns.push({ date: txn.date, merchant: txn.description, amount: txn.amount, source: txn.source })
  }

  for (const txn of txns) {
    const l1 = classifyLayer1(txn)
    if (l1) {
      if (l1.route === 'recurring' && l1.target === 'salary') { recurring.salary.count++; recurring.salary.total += txn.amount; continue }
      if (l1.route === 'recurring' && l1.target === 'rent') { recurring.rent.total += txn.amount; continue }
      if (l1.route === 'reimbursement') {
        reimbursements.total += txn.amount
        reimbursements.items.push({ date: txn.date, merchant: txn.description, amount: txn.amount, source: txn.source })
        if (l1.laura) recurring.rent.lauraIncoming += txn.amount
        continue
      }
      if (l1.route === 'excluded') { excluded.push({ date: txn.date, merchant: txn.description, amount: txn.amount, reason: l1.reason }); continue }
      if (l1.route === 'confident') { addConfident(l1.category, txn); continue }
      if (l1.route === 'needs_review') { needsReview.push(nrItem(txn, false, l1.reason)); continue }
    }

    // Credits with no Layer-1 match shouldn't reach keyword rules
    if (txn.kind === 'credit') { needsReview.push(nrItem(txn, false, 'Unclassified incoming')); continue }

    // Layer 2 — keyword rules
    const cat = matchCategoryByKeyword(txn.description)
    if (cat) { addConfident(cat, txn); continue }

    // Layer 3 — AI fallback (Section C, awaiting suggestion)
    needsReview.push(nrItem(txn, true, null))
  }

  const unmatchedForAI = needsReview.filter(n => n.needsAI)
  return { recurring, reimbursements, excluded, confident, needsReview, unmatchedForAI }
}
