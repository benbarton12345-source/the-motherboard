import { useState } from 'react'
import HomePage from './components/HomePage'
import FinancePage from './components/FinancePage'
import { useCurrency } from './CurrencyContext'

const TABS = ['home', 'finance', 'trading', 'productivity', 'health']

function App() {
  const [activeTab, setActiveTab] = useState('home')
  const { currency, setCurrency, rate } = useCurrency()

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">

      {/* Header */}
      <header className="border-b border-[#1a1a1a] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="font-syne text-xl font-bold tracking-widest text-white uppercase">
            The Motherboard
          </h1>
          <div className="flex items-center gap-4">
            {rate !== null ? (
              <span className="font-mono text-[11px] text-[#3a3a3a]">
                1 GBP = A${rate.toFixed(4)}
              </span>
            ) : (
              <span className="font-mono text-[11px] text-[#2a2a2a]">fetching rate...</span>
            )}
            <div className="flex items-center bg-[#111] border border-[#1c1c1c] rounded-lg p-1">
              {['GBP', 'AUD'].map(c => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`px-3 py-1 font-mono text-xs font-bold tracking-widest rounded-md transition-colors ${
                    currency === c
                      ? 'bg-[#00ff88] text-black'
                      : 'text-[#555] hover:text-white'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="border-b border-[#1a1a1a] px-6">
        <div className="max-w-7xl mx-auto flex gap-8">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 font-mono text-xs tracking-[0.15em] uppercase border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-[#00ff88] text-[#00ff88]'
                  : 'border-transparent text-[#444] hover:text-[#888]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === 'home' && <HomePage />}
        {activeTab === 'finance' && <FinancePage />}
        {activeTab === 'trading' && (
          <div className="font-mono text-sm text-[#333]">Trading module — Phase 3</div>
        )}
        {activeTab === 'productivity' && (
          <div className="font-mono text-sm text-[#333]">Productivity module — Phase 2</div>
        )}
        {activeTab === 'health' && (
          <div className="font-mono text-sm text-[#333]">Health module — Phase 4</div>
        )}
      </main>
    </div>
  )
}

export default App
