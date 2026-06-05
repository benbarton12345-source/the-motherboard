import { createContext, useContext, useState, useEffect } from 'react'

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