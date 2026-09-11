import { useState } from 'react'
import { supabase } from '../supabase'
import { localDate } from '../utils/taskHelpers'
import Modal from './Modal'
import { ASSET_CLASS_ORDER, classLabel, COUNTRY_KEYS, COUNTRIES, CURRENCY_KEYS } from '../utils/financeTaxonomy'

// Add Account — creates a new `accounts` row plus its first dated balance in
// `account_snapshots`, so the account appears immediately in the grouped list,
// the asset-class breakdown and every future bulk snapshot.
//
// `country` and `currency` are separate fields by design (see financeTaxonomy);
// picking a country pre-selects the usual currency but either can be changed.
// The opening balance is entered in the account's NATIVE currency, matching how
// balances are stored.
export default function AddAccountModal({ onClose, onSaved }) {
  const [name, setName] = useState('')
  const [assetClass, setAssetClass] = useState('cash')
  const [country, setCountry] = useState('UK')
  const [currency, setCurrency] = useState('GBP')
  const [balance, setBalance] = useState('')
  const [date, setDate] = useState(localDate())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Country is the usual driver of denomination; changing it moves the currency
  // with it, but the user can still decouple the two afterwards.
  function pickCountry(next) {
    setCountry(next)
    setCurrency(next === 'AU' ? 'AUD' : 'GBP')
  }

  const trimmed = name.trim()
  const parsedBalance = parseFloat(balance)
  const valid = trimmed.length > 0 && !isNaN(parsedBalance) && !!date

  async function save() {
    if (!valid || busy) return
    setBusy(true)
    setError('')

    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .insert({ name: trimmed, asset_class: assetClass, country, currency, active: true })
      .select()
      .single()

    if (accountError || !account) {
      // Most likely causes: the unique name constraint, or the asset_class CHECK
      // rejecting 'crypto' before sql/crypto_asset_class.sql has been run.
      setError(accountError?.message || 'Could not create the account.')
      setBusy(false)
      return
    }

    const { error: balanceError } = await supabase
      .from('account_snapshots')
      .insert({ account_id: account.id, snapshot_date: date, balance: parsedBalance })

    if (balanceError) {
      setError(`Account created, but the opening balance failed: ${balanceError.message}`)
      setBusy(false)
      return
    }

    setBusy(false)
    onSaved?.()
    onClose()
  }

  const inputCls = 'bg-gray-950 border border-gray-800 rounded px-2.5 py-2 text-white text-sm focus:outline-none focus:border-emerald-400/60'
  const labelCls = 'block text-[11px] text-gray-500 uppercase tracking-widest mb-1.5'
  const nativeSym = currency === 'GBP' ? '£' : 'A$'

  return (
    <Modal
      title="Add Account"
      onClose={onClose}
      onSave={save}
      saveLabel="Add Account"
      saveDisabled={!valid}
      saving={busy}
    >
      <div>
        <label className={labelCls}>Account name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Vanguard ISA"
          autoFocus
          className={`w-full ${inputCls}`}
        />
      </div>

      <div>
        <label className={labelCls}>Asset class</label>
        <select value={assetClass} onChange={e => setAssetClass(e.target.value)} className={`w-full ${inputCls}`}>
          {ASSET_CLASS_ORDER.map(cls => (
            <option key={cls} value={cls}>{classLabel(cls)}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Country</label>
          <select value={country} onChange={e => pickCountry(e.target.value)} className={`w-full ${inputCls}`}>
            {COUNTRY_KEYS.map(c => <option key={c} value={c}>{COUNTRIES[c]}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Currency</label>
          <select value={currency} onChange={e => setCurrency(e.target.value)} className={`w-full ${inputCls}`}>
            {CURRENCY_KEYS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Opening balance ({nativeSym})</label>
          <input
            type="number"
            step="0.01"
            value={balance}
            onChange={e => setBalance(e.target.value)}
            placeholder="0.00"
            className={`w-full ${inputCls}`}
          />
        </div>
        <div>
          <label className={labelCls}>As at</label>
          <input
            type="date"
            value={date}
            max={localDate()}
            onChange={e => setDate(e.target.value)}
            className={`w-full ${inputCls}`}
          />
        </div>
      </div>

      <p className="text-[11px] text-gray-600">
        Balance is stored in the account&apos;s own currency and converted for display.
      </p>

      {error && <div className="text-xs text-red-400">{error}</div>}
    </Modal>
  )
}
