# The Motherboard — Project Brief

---

## Who I Am

Name: Ben Barton. Age 26, currently based in Perth, Australia. Planning to return to the UK to work in financial advice. Building this app as a personal tool to support long-term goals around financial freedom, location independence, and high performance. Good technical literacy but new to coding — learning as I go.

---

## How I Want Claude to Engage

- Brief explanations by default — enough to understand what was done and why
- Only go in depth when I specifically ask
- Be direct and practical — forward momentum, not theory
- Challenge my thinking when a decision might cause problems later
- UK English at all times
- No unnecessary bolding, no emojis, no over-hyphenation

---

## What I Am Building

A personal web-based dashboard called **The Motherboard**.

Purpose: personal operating system combining finance, productivity, and health into one clean, intelligent dashboard. Helps monitor progress, make better decisions, and support the lifestyle and financial freedom I am working toward.

---

## Design Direction

- Dark background (#0a0a0a), neon green (#00ff88) as primary accent
- Terminal / trading desk aesthetic — clean, data-rich, not cluttered
- Typography: JetBrains Mono for numbers and labels, Syne for headings
- Three-column grid layout (see Home Layout section below)
- Section labels follow the pattern: `01 // SECTION NAME`
- Status tags: HOT / WARM / COOL with colour coding (red / green / blue)
- Mobile-first responsive — primary use on mobile, also laptop and iPad
- Personal and premium, not generic

### Finance Page Visual Tokens (source of truth)

All pages should match the finance page styling exactly:
- Card background: `bg-gray-900 border border-gray-800 rounded-lg p-6`
- Section headings: `text-sm tracking-widest uppercase text-gray-400 mb-4`
- Values: `text-white font-bold`
- Secondary text: `text-gray-500`
- Green accent: `text-emerald-400` / sparkline stroke `#34d399`
- Red: `text-red-400`
- Amber: `text-amber-400`
- No custom hex colours in page components — use Tailwind tokens only
- No `font-mono` or `font-syne` in page components — those are reserved for the header/nav layer

---

## Tech Stack

- **Frontend**: React via Vite
- **Styling**: Tailwind CSS v3
- **Database**: Supabase (Postgres)
- **Version control**: GitHub
- **Deployment**: Vercel (auto-deploys from GitHub)
- **Editor**: VS Code with Claude Code CLI

All free tier. No paid services until explicitly decided.

---

## Home Layout (Three-Column Grid)

### Left Column (220px) — Identity & Financial Pulse

**01 // OPERATOR**
- Name, role, location
- Focus today (editable text)
- Streak counter
- Week number

**02 // NET WORTH**
- Net worth (GBP primary)
- 30-day delta and percentage
- Sparkline chart
- Previous month value

**03 // FREEDOM FIGURE**
- Progress toward £1,500,000 target
- Progress bar
- Current value vs target
- Projected time at current rate

### Centre Column (flexible) — Working Surface

**04 // SESSION**
- Greeting with name
- Live clock (Perth / UK timezone aware)
- Date
- "Today I will" focus input (localStorage)

**05 // HABITS**
- Six daily habits (manual checkboxes, resets at midnight local time)
- Daily score out of 6
- Habits:
  1. 10k steps (manual now, Apple Health via Health Auto Export later)
  2. Gratitude — write one thing
  3. 10 mins reading
  4. Log mood
  5. Morning gym / walk
  6. No phone before 8am

**06 // THIS WEEK**
- Weekly task/goal list
- Priority tags: HOT / WARM / COOL
- Add / complete / delete functionality

**07 // WEEKLY REVIEW**
- Wins this week
- What slipped
- Open loops
- Next week top 3
- Auto-saves on change (debounced, 800ms)
- Saving... / ✓ Saved indicator

### Right Column (200px) — Data at a Glance

**08 // ASSETS**
- Breakdown by category: Cash, Investments, Crypto, Other
- Value and percentage of net worth per category
- Colour-coded bar per category

**09 // BUDGET · [MONTH]**
- Income vs expenses
- Amount saved
- Save rate percentage

**10 // TRADING · DEMO**
- Win rate
- P&L this month
- Average R:R
- Open trades
- Max drawdown
- DEMO badge until live capital is deployed

---

## Navigation Tabs

HOME · FINANCE · TRADING · PRODUCTIVITY · HEALTH

---

## Build Phases

### Phase 1 — Foundation & Finance (complete)

- Net worth tracker — account-level entries, name / type / value / currency
- Monthly snapshot history with line chart
- Asset allocation breakdown
- Budget tracker — income vs expenses, monthly view, category breakdown
- Freedom figure progress bar toward £1,500,000
- GBP primary currency, AUD toggle in header
- Per-entry currency selection (GBP or AUD) on both trackers
- Live GBP→AUD exchange rate from frankfurter.app, cached per session
- Home page — full three-column layout with all ten sections
- Habits, tasks, and weekly review persisted to Supabase
- Finance page complete rebuild with five sections (see Finance Page below)

### Phase 2 — Productivity

Home page foundation versions of all four features are built (habits, tasks, weekly review, session focus). The dedicated Productivity tab is still to be built with deeper functionality:
- Streak logic and habit history visualisation
- Expanded task management (due dates, projects)
- Weekly review history and trends
- Session planning tools

### Phase 3 — Trading Analytics

Manual input initially. IG API integration later (IG has REST + Lightstreamer APIs — future work).

Metrics:
- Win rate, P&L over time, R:R ratio, profit factor, max drawdown, average hold time, top markets by P&L, P&L per trade
- Supply and demand swing trading strategy
- DEMO mode badge until live capital deployed

### Phase 4 — Health & Performance

#### Apple Health
Integration via Health Auto Export (third-party app, pushes to webhook/Supabase on a schedule).

Metrics: steps, mood, sleep, HRV, weight, workouts, running progress

#### Nutrition
- Daily nutrition logging with macro tracking (calories, protein, carbs, fat)
- Telegram bot capture — send a message to a bot describing a meal, bot parses it and writes to Supabase via a webhook/function
- Dashboard card showing daily totals vs targets, weekly averages, and a simple macro breakdown chart
- Targets: configurable per-user (calories, protein goal etc.)

---

## Finance Page (current implementation)

File: `src/components/FinancePage.jsx`

### Section 1 — Summary cards (grid, 4 columns)
- Net Worth: current total (GBP), m/m delta + percentage, sparkline
- Runway: liquid cash ÷ monthly burn in months
- Income/mo: sum of active income recurring items converted to monthly
- Burn/mo: sum of active subscriptions + fixed costs, save rate

### Section 2 — Asset cards (2 columns)
- Liquid Cash: sum of Cash-type accounts from latest snapshot, % of NW, sparkline, per-account list
- Invested Assets: Investments + Crypto accounts, same treatment

### Section 3 — Recurring items (3 columns)
- Subscriptions | Fixed Costs | Income Sources
- Each card: list with name, frequency badge, monthly-equivalent amount; add/edit/delete; monthly total
- Uses `recurring_items` table (type: subscription / fixed_cost / income)

### Section 4 — Monthly Budget
- Month selector dropdown (rolling 12 months)
- Summary stats: Income, Expenses, Saved, Save Rate
- Expected recurring income shown for comparison in Income stat
- Two-column entry lists (Income / Expenses) with add forms and delete
- Uses existing `budget_entries` table

### Section 5 — Snapshot History
- Table columns: Period, Net Worth, Cash, Invested, Δ vs Prior (value + percentage e.g. +£6,269 (+6.4%))
- Each row: Edit button opens inline edit form pre-populated with account values; Del button
- "+ New Snapshot" button opens form, pre-fills from latest snapshot
- Uses `net_worth_snapshots` table

### Frequency-to-monthly conversion
- Monthly × 1, Fortnightly × 26 ÷ 12, Weekly × 52 ÷ 12, Quarterly ÷ 3, Annual ÷ 12

---

## Supabase Tables

| Table | Purpose |
|---|---|
| `net_worth_snapshots` | date, entries (jsonb array of {name, type, value, currency}), total (GBP) |
| `budget_entries` | month, category, type (income/expense), amount, currency, notes |
| `habit_logs` | date (unique), habits (jsonb array of 6 booleans) |
| `tasks` | text, priority (HOT/WARM/COOL), done boolean |
| `weekly_reviews` | week_start (unique Monday date), wins, slipped, open_loops, next_week_top_3 |
| `recurring_items` | name, type (subscription/fixed_cost/income), amount, frequency, active boolean |
| `recurring_overrides` | recurring_item_id, month (date), amount, note — overrides for a specific month |

Snapshot `total` is always stored in GBP. Individual entry `value` fields are stored in their original currency. Display conversion is view-layer only via `convert(amount, fromCurrency)` from CurrencyContext.

---

## CurrencyContext

File: `src/CurrencyContext.jsx`

- Fetches live GBP→AUD rate on mount from `https://api.frankfurter.app/latest?from=GBP&to=AUD`
- Cached for the session (single fetch)
- Exposes: `currency`, `setCurrency`, `rate`, `convert(amount, fromCurrency)`, `format(amount)`
- `convert` returns the amount in the current display currency
- `format` adds the correct symbol (£ or A$)
- All displayed monetary values must go through `convert` then `format`

---

## Data Persistence

All data persists via Supabase across sessions and devices. Do not use localStorage as primary data store. localStorage is acceptable only as a temporary cache with Supabase as source of truth (e.g. the session focus text).

---

## Key Financial Context

- Long-term goal: £1,500,000 in assets generating £5,000/month passive income
- Currency: GBP primary, AUD secondary (currently based in Perth)
- Trading: supply and demand swing trading, currently on demo account

---

## Current State (as of 5 June 2026)

### Phase 1 — Complete

Everything in Phase 1 is built and deployed.

**Foundation**
- Full environment setup — Homebrew, Node, Git, VS Code, GitHub
- React + Vite + Tailwind v3 scaffolded and running
- Supabase connected, app deployed to Vercel at the-motherboard-pi.vercel.app
- CurrencyContext with live GBP→AUD rate (frankfurter.app), GBP/AUD toggle in header

**Home page**
- Three-column layout matching the agreed brief
- Operator card, Net Worth card (sparkline, m/m delta), Freedom Figure progress bar
- Session card with focus input (localStorage)
- Habits — six checkboxes, daily reset, persists to `habit_logs` in Supabase
- This Week — task list with HOT/WARM/COOL priorities, persists to `tasks` in Supabase
- Weekly Review — four text fields, auto-saves to `weekly_reviews` in Supabase (800ms debounce), Saving.../✓ Saved indicator
- Assets, Budget, and Trading snapshot cards in right column

**Finance page**
- Full rebuild as `FinancePage.jsx` replacing the original NetWorthTracker + BudgetTracker
- Summary cards: Net Worth, Runway, Income/mo, Burn/mo
- Liquid Cash and Invested Assets cards with sparklines and per-account breakdown
- Recurring items: Subscriptions, Fixed Costs, Income Sources — full add/edit/delete CRUD, monthly total
- Monthly Budget redesigned — two-column layout, summary stats, expected recurring income comparison
- Snapshot History table — Period, Net Worth, Cash, Invested, Δ vs Prior (value + % change), inline edit per row, new snapshot form

### Next Up — Phase 2

Dedicated Productivity tab. The home page has working versions of habits, tasks, and weekly review already. The tab needs deeper functionality: streak logic, habit history, expanded task management with due dates, weekly review history and trends.

---

## Notes for Claude Code

- Always read this file at the start of a session before making any changes
- The app is at `/the-motherboard` — check `src/` for all components
- Supabase config is in `.env` — never hardcode keys
- Tailwind v3 is in use — do not upgrade or change the Tailwind setup
- When adding new Supabase tables, provide the SQL separately so I can run it in the Supabase dashboard
- Commit message style: plain English, lowercase, descriptive (e.g. `add per-entry currency selection to net worth tracker`)
- Finance page visual tokens are the source of truth for styling — see Design Direction above
