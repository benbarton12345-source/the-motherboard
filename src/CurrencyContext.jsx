import { createContext, useContext, useState, useEffect, useMemo } from 'react'

const CurrencyContext = createContext()

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState('GBP')
  const [rate, setRate] = useState(null)

  useEffect(() => {
    fetch('https://api.frankfurter.app/latest?from=GBP&to=AUD')
      .then(res => res.json())
      .then(data => setRate(data.rates.AUD))
      .catch(() => setRate(2.05))
  }, [])

  function convert(amount, fromCurrency) {
    if (!rate) return amount
    if (fromCurrency === currency) return amount
    if (fromCurrency === 'GBP' && currency === 'AUD') return amount * rate
    if (fromCurrency === 'AUD' && currency === 'GBP') return amount / rate
    return amount
  }

  function format(amount) {
    const symbol = currency === 'GBP' ? '£' : 'A$'
    return `${symbol}${amount.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, rate, convert, format }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  return useContext(CurrencyContext)
}

// Locks a subtree to a fixed display currency regardless of the app-wide toggle,
// and makes setCurrency inert inside it. Used for the AUD-only Budgeting page so
// it always renders in AUD and nothing it does can change global currency state.
export function ForceCurrency({ currency: forced, children }) {
  const base = useCurrency()
  const value = useMemo(() => ({
    ...base,
    currency: forced,
    setCurrency: () => {}, // inert — Budgeting must not mutate app-wide currency
    convert(amount, fromCurrency) {
      if (!base.rate || fromCurrency === forced) return amount
      if (fromCurrency === 'GBP' && forced === 'AUD') return amount * base.rate
      if (fromCurrency === 'AUD' && forced === 'GBP') return amount / base.rate
      return amount
    },
    format(amount) {
      const symbol = forced === 'GBP' ? '£' : 'A$'
      return `${symbol}${amount.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    },
  }), [base, forced])
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}