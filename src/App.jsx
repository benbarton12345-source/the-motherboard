import { useState, useEffect } from 'react'
import HomePage from './components/HomePage'
import FinancePage from './components/FinancePage'
import NetWorthPage from './components/NetWorthPage'
import ProductivityPage from './components/ProductivityPage'
import ProductivityOverview from './components/ProductivityOverview'
import HabitsGoalsPage from './components/HabitsGoalsPage'
import ReadingPage from './components/ReadingPage'
import HealthPage from './components/HealthPage'
import TrainingPage from './components/TrainingPage'
import TrainingOverview from './components/TrainingOverview'
import Sidebar, { MobileDrawer } from './components/Sidebar'
import { useCurrency } from './CurrencyContext'

const LABELS = {
  home: 'Home', finance: 'Finance', trading: 'Trading',
  productivity: 'Productivity', health: 'Health', training: 'Training',
}

function App() {
  const [activeTab, setActiveTab] = useState('home')
  // Which sub-item within the active group is selected (null for flat groups).
  // Interim: groups with sub-items land on subs[0] until overview pages exist,
  // so this only drives the sidebar highlight — page content is per-group.
  const [activeSubItem, setActiveSubItem] = useState(null)
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebarCollapsed') === 'true' } catch { return false }
  })
  const [mobileOpen, setMobileOpen] = useState(false)
  // Session id the Training Overview asked to start — consumed once by TrainingPage.
  const [pendingStartSession, setPendingStartSession] = useState(null)
  const { currency, setCurrency, rate } = useCurrency()

  useEffect(() => {
    try { localStorage.setItem('sidebarCollapsed', String(collapsed)) } catch { /* ignore */ }
  }, [collapsed])

  function navigate(id, subId = null) {
    setActiveTab(id)
    setActiveSubItem(subId)
    setMobileOpen(false)
  }

  // Deep link from the Overview's Start Session CTA → Log Session, pre-selected.
  function startSession(sessionId) {
    setPendingStartSession(sessionId)
    navigate('training', 'log-session')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0a] text-white">

      <Sidebar
        activeGroup={activeTab}
        activeSubItem={activeSubItem}
        onNavigate={navigate}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(c => !c)}
      />
      <MobileDrawer
        open={mobileOpen}
        activeGroup={activeTab}
        activeSubItem={activeSubItem}
        onNavigate={navigate}
        onClose={() => setMobileOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* Top bar */}
        <header className="h-[60px] shrink-0 flex items-center gap-4 px-6 border-b border-gray-800">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="md:hidden w-[38px] h-[38px] rounded-[9px] bg-white/5 hover:bg-white/10 flex flex-col items-center justify-center gap-[5px] shrink-0 transition-colors"
          >
            <span className="w-[17px] h-[1.5px] bg-gray-200 rounded" />
            <span className="w-[17px] h-[1.5px] bg-gray-200 rounded" />
            <span className="w-[17px] h-[1.5px] bg-gray-200 rounded" />
          </button>

          <h1 className="text-[17px] font-bold tracking-tight text-white flex-1 min-w-0 truncate">
            {LABELS[activeTab]}
          </h1>

          <div className="flex items-center gap-4 shrink-0">
            {rate !== null ? (
              <span className="hidden sm:inline font-mono text-[11px] text-[#3a3a3a]">
                1 GBP = A${rate.toFixed(4)}
              </span>
            ) : (
              <span className="hidden sm:inline font-mono text-[11px] text-[#2a2a2a]">fetching rate...</span>
            )}
            <div className="flex items-center bg-[#111] border border-[#1c1c1c] rounded-lg p-1">
              {['GBP', 'AUD'].map(c => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`px-3 py-1 font-mono text-xs font-bold tracking-widest rounded-md transition-colors ${
                    currency === c ? 'bg-[#00ff88] text-black' : 'text-[#555] hover:text-white'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-6 py-6">
            {activeTab === 'home' && <HomePage />}
            {activeTab === 'finance' && (
              activeSubItem === 'budgeting'
                ? <FinancePage />
                : activeSubItem === 'projections'
                  ? <SectionPlaceholder label="Projections" />
                  : <NetWorthPage />
            )}
            {activeTab === 'trading' && <TradingPlaceholder />}
            {activeTab === 'productivity' && (
              activeSubItem === 'habits-goals'
                ? <HabitsGoalsPage />
                : activeSubItem === 'reading'
                  ? <ReadingPage />
                  : (activeSubItem === 'overview' || activeSubItem == null)
                    ? <ProductivityOverview onOpenSub={(sub) => navigate('productivity', sub)} />
                    : <ProductivityPage />
            )}
            {activeTab === 'health' && (
              <HealthPage
                subItem={activeSubItem}
                onOpenSub={(sub) => navigate('health', sub)}
              />
            )}
            {activeTab === 'training' && (
              activeSubItem === 'overview' || activeSubItem == null
                ? <TrainingOverview
                    onStartSession={startSession}
                    onOpenSub={(sub) => navigate('training', sub)}
                  />
                : <TrainingPage
                    autoStartSessionId={pendingStartSession}
                    onAutoStartConsumed={() => setPendingStartSession(null)}
                  />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

function SectionPlaceholder({ label }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-4 py-20 min-h-[320px]">
      <div className="w-16 h-16 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center text-gray-600">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" />
        </svg>
      </div>
      <div>
        <div className="text-[17px] font-bold tracking-tight text-white mb-2">{label}</div>
        <div className="text-sm text-gray-500 leading-relaxed max-w-[280px] mx-auto">
          This section is not yet built. It will appear here once ready.
        </div>
      </div>
      <div className="bg-white/5 border border-gray-800 text-gray-500 text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
        Coming soon
      </div>
    </div>
  )
}

function TradingPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-4 py-20 min-h-[320px]">
      <div className="w-16 h-16 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center text-gray-600">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
        </svg>
      </div>
      <div>
        <div className="text-[17px] font-bold tracking-tight text-white mb-2">Trading</div>
        <div className="text-sm text-gray-500 leading-relaxed max-w-[280px] mx-auto">
          This section is not yet built. It will appear here once ready.
        </div>
      </div>
      <div className="bg-white/5 border border-gray-800 text-gray-500 text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
        Coming soon
      </div>
    </div>
  )
}

export default App
