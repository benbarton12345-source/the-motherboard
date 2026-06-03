import { useState } from 'react'
import NetWorthTracker from './components/NetWorthTracker'

function App() {
  const [activeTab, setActiveTab] = useState('finance')

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-widest text-white uppercase">
            The Motherboard
          </h1>
          <span className="text-xs text-gray-500 tracking-widest uppercase">
            Personal OS
          </span>
        </div>
      </header>

      {/* Navigation */}
      <nav className="border-b border-gray-800 px-6">
        <div className="max-w-7xl mx-auto flex gap-8">
          {['finance', 'productivity', 'trading', 'health'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 text-sm tracking-widest uppercase border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-emerald-400 text-emerald-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
   {activeTab === 'finance' && <NetWorthTracker />}
        {activeTab === 'productivity' && (
          <div className="text-gray-400">Productivity module coming soon</div>
        )}
        {activeTab === 'trading' && (
          <div className="text-gray-400">Trading module coming soon</div>
        )}
        {activeTab === 'health' && (
          <div className="text-gray-400">Health module coming soon</div>
        )}
      </main>
    </div>
  )
}

export default App