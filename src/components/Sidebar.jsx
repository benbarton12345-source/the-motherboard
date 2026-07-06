// Sidebar navigation shell — replaces the old flat top tab bar.
// Desktop: expanded (220px) / collapsed (64px) rail. Mobile: slide-in drawer.
// Design tokens mapped to the app's existing Tailwind classes (emerald-400 accent,
// gray-900 surface, gray-800 borders) rather than the handoff's raw hex values.
//
// Sub-navigation layer (this chunk) adds a second level of nav beneath the six
// top-level groups. Top-level group styling, widths, colours and logo area are
// unchanged — only the sub-item behaviour is new:
//   Expanded  — active group renders its sub-items inline below the group row
//   Collapsed — clicking a group icon opens a click-to-open flyout popover
//   Mobile    — group rows have two tap targets: label (navigates) + chevron
//               (toggles an inline accordion, independent of the active group)
// Interim routing: clicking a group with sub-items lands on subs[0] until group
// overview pages exist — a routing concern, tracked as activeSubItem in App.
import { useState } from 'react'

// ── Icons (Lucide-compatible inline SVG) ────────────────────────────
const Svg = ({ size = 16, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    {children}
  </svg>
)
const HomeIcon = (p) => <Svg {...p}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></Svg>
const FinanceIcon = (p) => <Svg {...p}><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" /></Svg>
const TradingIcon = (p) => <Svg {...p}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></Svg>
const ProductivityIcon = (p) => <Svg {...p}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></Svg>
const HealthIcon = (p) => <Svg {...p}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></Svg>
const TrainingIcon = (p) => <Svg {...p}><line x1="4" y1="9" x2="4" y2="15" /><line x1="7" y1="5" x2="7" y2="19" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="17" y1="5" x2="17" y2="19" /><line x1="20" y1="9" x2="20" y2="15" /></Svg>
const ChevronLeft = (p) => <Svg {...p}><polyline points="15 18 9 12 15 6" /></Svg>
const ChevronRight = (p) => <Svg {...p}><polyline points="9 18 15 12 9 6" /></Svg>
const ChevronDown = (p) => <Svg {...p}><polyline points="6 9 12 15 18 9" /></Svg>
const DotsIcon = (p) => <Svg {...p}><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></Svg>
const CloseIcon = (p) => <Svg {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Svg>

// Locked structure. Groups with a `subs` array reveal a second nav level;
// Home and Trading are flat (activeSubItem stays null).
const NAV = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  {
    id: 'finance', label: 'Finance', icon: FinanceIcon,
    subs: [
      { id: 'net-worth', label: 'Net Worth' },
      { id: 'budgeting', label: 'Budgeting' },
      { id: 'projections', label: 'Projections' },
    ],
  },
  { id: 'trading', label: 'Trading', icon: TradingIcon, soon: true },
  {
    id: 'productivity', label: 'Productivity', icon: ProductivityIcon,
    subs: [
      { id: 'overview', label: 'Overview' },
      { id: 'habits-goals', label: 'Habits & Goals' },
      { id: 'tasks', label: 'Tasks' },
      { id: 'reading', label: 'Reading' },
    ],
  },
  {
    id: 'health', label: 'Health', icon: HealthIcon,
    subs: [
      { id: 'daily-metrics', label: 'Daily Metrics' },
      { id: 'nutrition', label: 'Nutrition' },
      { id: 'mood', label: 'Mood' },
      { id: 'insights', label: 'Insights' },
    ],
  },
  {
    id: 'training', label: 'Training', icon: TrainingIcon,
    subs: [
      { id: 'overview', label: 'Overview' },
      { id: 'log-session', label: 'Log Session' },
      { id: 'programmes', label: 'Programmes' },
      { id: 'exercise-bank', label: 'Exercise Bank' },
      { id: 'analysis', label: 'Analysis' },
    ],
  },
]

// Where a group with sub-items navigates on click, until overview pages exist.
const firstSub = (item) => (item.subs ? item.subs[0].id : null)

// ── Logo mark (circuit-board pattern in emerald) ────────────────────
function LogoMark({ size = 28 }) {
  return (
    <div className="rounded-[7px] bg-gradient-to-br from-emerald-950 to-emerald-900 border border-emerald-400/20 flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}>
      <svg width={Math.round(size * 0.46)} height={Math.round(size * 0.46)} viewBox="0 0 24 24"
        fill="none" stroke="currentColor" className="text-emerald-400/80" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="4" rx="1" />
        <rect x="2" y="10" width="20" height="4" rx="1" />
        <rect x="2" y="17" width="11" height="4" rx="1" />
        <rect x="16" y="17" width="6" height="4" rx="1" />
      </svg>
    </div>
  )
}

function Avatar({ size = 30 }) {
  return (
    <div className="rounded-full bg-gradient-to-br from-emerald-950 to-emerald-900 border border-emerald-400/25 flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}>
      <span className="text-emerald-400 text-xs font-bold">B</span>
    </div>
  )
}

// ── Group nav item (top-level styling unchanged from the built shell) ─
function NavItem({ item, active, onClick, variant }) {
  const Icon = item.icon
  const color = active ? 'text-emerald-400' : 'text-gray-400'
  const bg = active ? 'bg-emerald-400/10' : 'hover:bg-white/5'
  const soon = item.soon ? 'opacity-[0.65]' : ''

  if (variant === 'collapsed') {
    return (
      <button onClick={onClick} title={item.label}
        className={`relative flex items-center justify-center h-10 w-full rounded-lg select-none transition-colors ${bg} ${color} ${soon}`}>
        {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] bg-emerald-400 rounded-r-[2px]" />}
        <Icon size={17} />
      </button>
    )
  }

  const pad = variant === 'mobile' ? 'px-3 py-[11px] rounded-[9px]' : 'px-3 py-2 rounded-lg'
  const ind = variant === 'mobile' ? 'top-[9px] bottom-[9px]' : 'top-2 bottom-2'
  const labelSize = variant === 'mobile' ? 'text-sm' : 'text-[13.5px]'
  return (
    <button onClick={onClick}
      className={`relative w-full flex items-center gap-2.5 ${pad} select-none transition-colors ${bg} ${color} ${soon}`}>
      {active && <span className={`absolute left-0 ${ind} w-[3px] bg-emerald-400 rounded-r-[2px]`} />}
      <Icon size={variant === 'mobile' ? 17 : 16} />
      <span className={`${labelSize} font-medium`}>{item.label}</span>
      {item.soon && <span className="ml-auto text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-gray-600">Soon</span>}
    </button>
  )
}

// ── Sub-item row (new) ──────────────────────────────────────────────
// Shared by expanded inline list, collapsed flyout, and mobile accordion.
// `layout` tweaks only the box metrics per mode; the active/inactive colour
// system (2px emerald left border, white/5 tint, white vs gray-400 text) is
// identical across all three per the handoff.
function SubItem({ label, active, onClick, layout }) {
  const geometry = {
    expanded: 'h-8 ml-6 pl-2.5 pr-2 rounded-[5px] mb-0.5 text-[13px]',
    flyout: 'h-[34px] px-3 rounded-[5px] mb-px text-[13px]',
    mobile: 'h-10 pl-12 pr-4 mb-px text-sm',
  }[layout]
  const state = active
    ? 'border-emerald-400 bg-white/5 text-white font-medium hover:bg-white/[0.08]'
    : 'border-transparent text-gray-400 font-normal hover:bg-white/[0.04] hover:text-gray-200'
  return (
    <button onClick={onClick}
      className={`w-full flex items-center border-l-2 select-none transition-colors ${geometry} ${state}`}>
      {label}
    </button>
  )
}

function SubList({ item, activeSubItem, onNavigate }) {
  return (
    <div className="flex flex-col pb-1.5">
      {item.subs.map(sub => (
        <SubItem key={sub.id} label={sub.label} layout="expanded"
          active={activeSubItem === sub.id}
          onClick={() => onNavigate(item.id, sub.id)} />
      ))}
    </div>
  )
}

function UserArea({ collapsed }) {
  if (collapsed) {
    return (
      <div className="py-3 flex justify-center border-t border-gray-800">
        <Avatar />
      </div>
    )
  }
  return (
    <div className="p-2 border-t border-gray-800">
      <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/5 cursor-pointer">
        <Avatar />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-white leading-tight truncate">Ben</div>
          <div className="text-[11px] text-gray-500 leading-tight">Personal</div>
        </div>
        <span className="text-gray-600"><DotsIcon size={13} /></span>
      </div>
    </div>
  )
}

function ToggleButton({ collapsed, onClick }) {
  return (
    <button onClick={onClick} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      className={`${collapsed ? 'w-[34px]' : 'w-[26px]'} h-[26px] rounded-md border border-gray-700 bg-white/5 hover:bg-white/10 text-gray-500 hover:text-gray-300 flex items-center justify-center transition-colors shrink-0`}>
      {collapsed ? <ChevronRight size={11} /> : <ChevronLeft size={11} />}
    </button>
  )
}

// ── Collapsed flyout popover (new) ──────────────────────────────────
// Fixed-positioned so it escapes the rail's clipped overflow. Anchored to the
// clicked icon; closes on selection or via the transparent backdrop.
function Flyout({ item, anchorTop, activeGroup, activeSubItem, onNavigate, onClose }) {
  return (
    <>
      <div className="fixed inset-0 z-[45]" onClick={onClose} />
      <div
        className="fixed left-[68px] z-[100] min-w-[180px] bg-gray-800 border border-gray-700 rounded-[10px] p-1.5 animate-[flyoutIn_120ms_ease-out]"
        style={{ top: anchorTop - 4, boxShadow: '0 8px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.25)' }}
      >
        <div className="px-3 pt-1.5 pb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-white opacity-45">
          {item.label}
        </div>
        <div className="h-px bg-gray-700 mx-1 mb-1.5" />
        {item.subs.map(sub => (
          <SubItem key={sub.id} label={sub.label} layout="flyout"
            active={activeGroup === item.id && activeSubItem === sub.id}
            onClick={() => onNavigate(item.id, sub.id)} />
        ))}
      </div>
    </>
  )
}

// ── Desktop sidebar ─────────────────────────────────────────────────
export default function Sidebar({ activeGroup, activeSubItem, onNavigate, collapsed, onToggleCollapse }) {
  // Collapsed-mode flyout: which group's popover is open + its anchor position.
  const [flyout, setFlyout] = useState(null) // { id, top } | null
  const closeFlyout = () => setFlyout(null)

  const handleToggle = () => { closeFlyout(); onToggleCollapse() }

  // Navigating always dismisses any open flyout.
  const navigate = (id, subId) => { closeFlyout(); onNavigate(id, subId) }

  const onCollapsedIcon = (e, item) => {
    if (item.subs) {
      const top = e.currentTarget.getBoundingClientRect().top
      setFlyout(f => (f && f.id === item.id ? null : { id: item.id, top }))
    } else {
      navigate(item.id, null)
    }
  }

  const flyoutItem = flyout && NAV.find(n => n.id === flyout.id)

  return (
    <aside className={`hidden md:flex flex-col shrink-0 bg-gray-900 border-r border-gray-800 overflow-hidden ${collapsed ? 'w-16' : 'w-[220px]'}`}>
      {collapsed ? (
        <>
          <div className="h-[60px] flex items-center justify-center border-b border-gray-800 shrink-0">
            <LogoMark />
          </div>
          <div className="p-2 flex justify-center">
            <ToggleButton collapsed onClick={handleToggle} />
          </div>
        </>
      ) : (
        <div className="h-[60px] flex items-center gap-2.5 pl-3.5 pr-2.5 border-b border-gray-800 shrink-0">
          <LogoMark />
          <span className="flex-1 min-w-0 font-syne text-[13.5px] font-bold text-white truncate">The Motherboard</span>
          <ToggleButton collapsed={false} onClick={handleToggle} />
        </div>
      )}

      <nav className="flex-1 p-2 flex flex-col gap-0.5 overflow-y-auto">
        {NAV.map(item => {
          const active = activeGroup === item.id
          if (collapsed) {
            return (
              <NavItem key={item.id} item={item} active={active}
                onClick={(e) => onCollapsedIcon(e, item)} variant="collapsed" />
            )
          }
          return (
            <div key={item.id}>
              <NavItem item={item} active={active}
                onClick={() => navigate(item.id, firstSub(item))} variant="expanded" />
              {active && item.subs && (
                <SubList item={item} activeSubItem={activeSubItem} onNavigate={navigate} />
              )}
            </div>
          )
        })}
      </nav>

      <UserArea collapsed={collapsed} />

      {collapsed && flyoutItem && (
        <Flyout item={flyoutItem} anchorTop={flyout.top}
          activeGroup={activeGroup} activeSubItem={activeSubItem}
          onNavigate={navigate} onClose={closeFlyout} />
      )}
    </aside>
  )
}

// ── Mobile drawer (+ scrim) ─────────────────────────────────────────
export function MobileDrawer({ open, activeGroup, activeSubItem, onNavigate, onClose }) {
  // Accordion open/closed is local UI state, independent of activeGroup, and
  // multiple can be open at once. Seed with the active group for convenience.
  const [openAccordions, setOpenAccordions] = useState(() => (activeGroup ? [activeGroup] : []))
  const toggleAccordion = (id) =>
    setOpenAccordions(list => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]))

  // Always mounted so the drawer can slide both in and out via a transform
  // transition. Off-screen + non-interactive when closed.
  return (
    <div className="md:hidden" aria-hidden={!open}>
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/60 z-30 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />
      <div
        className={`fixed left-0 top-0 bottom-0 w-[280px] bg-gray-900 z-40 flex flex-col transition-transform duration-300 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ boxShadow: '8px 0 40px rgba(0,0,0,0.55)' }}
      >
        <div className="h-[60px] flex items-center justify-between px-3.5 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <LogoMark size={26} />
            <span className="font-syne text-[13.5px] font-bold text-white truncate">The Motherboard</span>
          </div>
          <button onClick={onClose} aria-label="Close navigation"
            className="w-7 h-7 rounded-[7px] bg-white/5 hover:bg-white/10 text-gray-400 flex items-center justify-center transition-colors shrink-0">
            <CloseIcon size={12} />
          </button>
        </div>
        <nav className="flex-1 p-2 flex flex-col gap-0.5 overflow-y-auto">
          {NAV.map(item => {
            const active = activeGroup === item.id
            if (!item.subs) {
              return (
                <NavItem key={item.id} item={item} active={active}
                  onClick={() => onNavigate(item.id, null)} variant="mobile" />
              )
            }
            // Two independent tap targets: label navigates + closes; chevron
            // only toggles the accordion (stopPropagation so the row doesn't fire).
            const accordionOpen = openAccordions.includes(item.id)
            const Icon = item.icon
            const color = active ? 'text-emerald-400' : 'text-gray-400'
            const bg = active ? 'bg-emerald-400/10' : 'hover:bg-white/5'
            return (
              <div key={item.id}>
                <div className={`relative flex items-center rounded-[9px] transition-colors ${bg} ${color}`}>
                  {active && <span className="absolute left-0 top-[9px] bottom-[9px] w-[3px] bg-emerald-400 rounded-r-[2px]" />}
                  <button onClick={() => onNavigate(item.id, firstSub(item))}
                    className="flex-1 min-w-0 flex items-center gap-2.5 pl-3 py-[11px] select-none">
                    <Icon size={17} />
                    <span className="text-sm font-medium truncate">{item.label}</span>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); toggleAccordion(item.id) }}
                    aria-label={`Toggle ${item.label} sub-items`}
                    className="w-9 h-9 mr-1 rounded-md flex items-center justify-center shrink-0 hover:bg-white/5 transition-colors">
                    {accordionOpen
                      ? <span className="text-emerald-400/65"><ChevronDown size={15} /></span>
                      : <span className="text-gray-600"><ChevronRight size={15} /></span>}
                  </button>
                </div>
                {accordionOpen && (
                  <div className="flex flex-col pb-1">
                    {item.subs.map(sub => (
                      <SubItem key={sub.id} label={sub.label} layout="mobile"
                        active={active && activeSubItem === sub.id}
                        onClick={() => onNavigate(item.id, sub.id)} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
        <UserArea collapsed={false} />
      </div>
    </div>
  )
}
