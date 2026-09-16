import { useState, useEffect } from 'react'
import HomePage from './components/HomePage'
import FinancePage from './components/FinancePage'
import NetWorthPage from './components/NetWorthPage'
import ProjectionsPage from './components/ProjectionsPage'
import FinanceOverviewPage from './components/FinanceOverviewPage'
import ProductivityPage from './components/ProductivityPage'
import ProductivityOverview from './components/ProductivityOverview'
import HabitsGoalsPage from './components/HabitsGoalsPage'
import ReadingPage from './components/ReadingPage'
import HealthPage from './components/HealthPage'
import TrainingPage from './components/TrainingPage'
import TrainingOverview from './components/TrainingOverview'
import TradingPage from './components/TradingPage'
import Sidebar, { MobileDrawer } from './components/Sidebar'
import { useCurrency, ForceCurrency } from './CurrencyContext'
import { useIgSync } from './useIgSync'

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
  // Owned here, not in TradingPage: the Sync button lives on the page but the
  // status indicator lives in this top bar, and they read one state.
  const ig = useIgSync()

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
            {/* Trading reuses the FX slot for its IG sync state — FX is irrelevant
                there, and the status belongs next to the page it describes. */}
            {activeTab === 'trading' ? (
              <IgSyncIndicator ig={ig} />
            ) : rate !== null ? (
              <span className="hidden sm:inline font-mono text-[11px] text-[#3a3a3a]">
                1 GBP = A${rate.toFixed(4)}
              </span>
            ) : (
              <span className="hidden sm:inline font-mono text-[11px] text-[#2a2a2a]">fetching rate...</span>
            )}
            {/* Budgeting is AUD-only: the toggle is truly inert there (no handler
                fires, global currency state unchanged) and shows AUD locked. */}
            {(() => {
              const budgetingLocked = activeTab === 'finance' && activeSubItem === 'budgeting'
              const shown = budgetingLocked ? 'AUD' : currency
              return (
                <div
                  className="flex items-center bg-[#111] border border-[#1c1c1c] rounded-lg p-1"
                  title={budgetingLocked ? 'Budgeting is AUD-only' : undefined}
                >
                  {['GBP', 'AUD'].map(c => (
                    <button
                      key={c}
                      onClick={() => { if (!budgetingLocked) setCurrency(c) }}
                      aria-disabled={budgetingLocked}
                      style={budgetingLocked ? { pointerEvents: 'none' } : undefined}
                      className={`px-3 py-1 font-mono text-xs font-bold tracking-widest rounded-md transition-colors ${
                        shown === c ? 'bg-[#00ff88] text-black' : 'text-[#555] hover:text-white'
                      } ${budgetingLocked ? 'cursor-not-allowed' : ''}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )
            })()}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-6 py-6">
            {activeTab === 'home' && <HomePage />}
            {activeTab === 'finance' && (
              activeSubItem === 'net-worth'
                ? <NetWorthPage />
                : activeSubItem === 'budgeting'
                  ? <ForceCurrency currency="AUD"><FinancePage /></ForceCurrency>
                  : activeSubItem === 'projections'
                    ? <ProjectionsPage />
                    : <FinanceOverviewPage />
            )}
            {activeTab === 'trading' && (
              <TradingPage
                trades={ig.trades}
                loading={ig.loading}
                syncing={ig.syncing}
                sync={ig.sync}
                error={ig.error}
              />
            )}
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

// Sync state for the top bar: a dot plus a terse mono line, matching the weight
// of the FX indicator it sits in place of.
function IgSyncIndicator({ ig }) {
  const { syncing, lastSyncedAt, status } = ig

  const time = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null

  const [dot, text] = syncing
    ? ['bg-amber-400', 'IG · SYNCING…']
    : status === 'error'
      ? ['bg-red-400', 'IG · SYNC FAILED']
      : time
        ? ['bg-emerald-400', `IG · SYNCED ${time}`]
        : ['bg-gray-600', 'IG · NEVER SYNCED']

  return (
    <span className="hidden sm:flex items-center gap-1.5 font-mono text-[11px] text-gray-500">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot} ${syncing ? 'animate-pulse' : ''}`} />
      {text}
    </span>
  )
}

export default App
