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

**02 // FINANCE PULSE**
- Net worth (GBP primary)
- 30-day delta and percentage
- Sparkline chart
- Daily and monthly change stats

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
- "Today I will" focus input

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
- Due date per item
- Add / complete functionality

**07 // WEEKLY REVIEW**
- Wins this week
- What slipped
- Open loops
- Next week top 3
- Seal week button

### Right Column (200px) — Data at a Glance

**08 // ASSETS**
- Breakdown by category: Cash, Investments, Crypto, Other
- Value and percentage of net worth per category
- Colour-coded bar per category

**09 // BUDGET · [MONTH]**
- Income vs expenses
- Amount saved
- Save rate percentage
- Spend bar

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

### Phase 1 — Foundation & Finance (current)
- Net worth tracker — account-level entries, name / type / value / currency
- Monthly snapshot history with line chart
- Asset allocation breakdown
- Budget tracker — income vs expenses, monthly view, category breakdown
- Freedom figure progress bar toward £1,500,000
- GBP primary currency, AUD toggle in header
- Per-entry currency selection (GBP or AUD) on both net worth and budget trackers

### Phase 2 — Productivity
- Habits tracker (six habits, daily reset, streak)
- Weekly goals / task list with priorities
- Weekly review module
- Session focus card

### Phase 3 — Trading Analytics
Manual input initially. IG API integration later (IG has REST + Lightstreamer APIs — future work).

Metrics:
- Win rate, P&L over time, R:R ratio, profit factor, max drawdown, average hold time, top markets by P&L, P&L per trade
- Supply and demand swing trading strategy
- DEMO mode badge until live capital deployed

### Phase 4 — Health & Performance
Apple Health integration via Health Auto Export (third-party app, pushes to webhook/Supabase on a schedule). Lower priority.

Metrics: steps, mood, sleep, HRV, weight, workouts, running progress

---

## Data Persistence

All data persists via Supabase across sessions and devices. Do not use localStorage as primary data store. localStorage is acceptable only as a temporary cache with Supabase as source of truth.

---

## Key Financial Context

- Long-term goal: £1,500,000 in assets generating £5,000/month passive income
- Current net worth: approximately £100,000
- Currency: GBP primary, AUD secondary (currently based in Perth)
- Trading: supply and demand swing trading, currently on demo account

---

## Current State (as of 5 June 2026)

### Completed
- Full environment setup — Homebrew, Node, Git, VS Code, GitHub
- React + Vite + Tailwind v3 app scaffolded and running
- Supabase connected with two tables: `net_worth_snapshots`, `budget_entries`
- Net worth tracker — account-level entries with name, type, value
- Freedom figure progress bar
- Snapshot history with delete functionality
- Line chart showing net worth over time
- Date selector for historic snapshot entry
- Form pre-populates from last snapshot
- Budget tracker — income/expenses, monthly view, category breakdown
- GBP/AUD currency toggle in header
- CurrencyContext created, app wrapped in provider
- App deployed to Vercel at the-motherboard-pi.vercel.app

### In Progress
- Per-entry currency selection (GBP or AUD) on net worth tracker
- Per-entry currency selection on budget tracker
- Hook up convert and format functions from CurrencyContext into both components

### Next Up
- Rebuild home page layout to match agreed three-column design (see Home Layout above)
- Add habits module (Phase 2)
- Add weekly goals and review module (Phase 2)

---

## Notes for Claude Code

- Always read this file at the start of a session before making any changes
- The app is at `/the-motherboard` — check `src/` for all components
- Supabase config is in `.env` — never hardcode keys
- Tailwind v3 is in use — do not upgrade or change the Tailwind setup
- When adding new Supabase tables, provide the SQL separately so I can run it in the Supabase dashboard
- Commit message style: plain English, lowercase, descriptive (e.g. `add per-entry currency selection to net worth tracker`)
