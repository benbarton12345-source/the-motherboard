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
- Priority tags: HIGH / MEDIUM / LOW with colour coding (red / amber / blue)
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

**05 // HABITS**
- Editable list of daily habits (add, rename, delete via EDIT mode)
- Daily score out of habit count
- Persists to `habit_definitions` table; seeded with 6 defaults on first load
- Checkboxes reset at midnight local time; state persists to `habit_logs`

**06 // THIS WEEK**
- Weekly task/goal list
- Priority tags: HIGH / MEDIUM / LOW
- Add / complete / delete functionality
- Save button stamps `saved_at` on all tasks

**07 // WEEKLY REVIEW**
- Five goal-specific fields: What went well, One challenge I overcame, One thing I can improve next week, Consistency score 1–10, One thing I am proud of
- Auto-saves on change (debounced, 800ms)
- Seal Week button writes `sealed_at`; once sealed auto-save does not overwrite

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
- Currency selection (GBP/AUD) on recurring items; amounts convert correctly via CurrencyContext
- Monthly budget auto-populated from active recurring items on first load each month; RECURRING badge; no delete on recurring entries; inline edit to override amount/category/notes for that month only
- Timezone bug fixed — month date strings now built from local date components, not toISOString()

### Phase 2 — Productivity

#### Home page (complete as of 7 June 2026)

- Editable habits list — EDIT mode in Habits card; rename, delete, add habits; persists to `habit_definitions` table; seeds six defaults on first load
- Save button on This Week — stamps `saved_at` on all tasks; shows "Saved [date]" confirmation
- Seal Week button on Weekly Review — writes `sealed_at`; button replaced by "Sealed [date]" once sealed; auto-save continues without overwriting seal
- Weekly review questions replaced with five goal-specific fields: What went well, One challenge I overcame, One thing I can improve next week, Consistency score 1–10, One thing I am proud of
- Removed Focus Today (Operator card) and Today I Will (Session card)
- Priority tags changed from HOT/WARM/COOL to HIGH/MEDIUM/LOW across the entire app; tasks table constraint updated; existing data migrated

#### Home page (updated 8 June 2026)

- This Week card replaced with TodaysTasks component (compact view, max 6 items shown with overflow count)

#### Productivity tab (complete as of 8 June 2026)

Full rebuild of the Productivity page and task system on 8 June 2026. Old `events`, `recurring_tasks`, and `recurring_task_logs` tables dropped. Tasks table extended into a unified system — see Supabase Tables below.

- **Section 1 — Weekly Calendar + Weekly Goals**
  - Week strip Mon–Sun with prev/next navigation; today highlighted emerald
  - Only timed tasks (task_time set) appear as blocks in calendar columns; green border = regular task, purple border = recurring definition
  - Recurring definitions with task_time auto-populate on their scheduled day
  - A single "+ Add Task" button opens the shared AddTaskModal
  - Weekly goals with name and target_count; count tracked in `weekly_goal_logs` per week; +/− buttons; progress bar green/amber/red

- **Section 2 — Today's Tasks + Week Summary**
  - Today's Tasks uses the shared TodaysTasks component (same as Home page)
  - Shows: regular tasks with task_date = today, plus recurring definitions due today that have no completed instance for today
  - Sorted by time first, then priority
  - Each task: checkbox to complete, snooze button (→ tomorrow, sets snoozed_from = today), delete button
  - Recurring tasks show ↻ REC badge; snoozed tasks show SNOOZED badge
  - Completing a recurring task creates a completed instance row with recurrence_parent_id = def.id and task_date = today
  - Unchecking a completed instance deletes the instance row (restores to uncompleted)
  - Week summary: tasks done/total, habit score (from habit_logs, last 7 days), goals hit — progress bars plus streak count

- **Section 3 — Recurring Task Definitions**
  - Lists all is_recurring = true tasks grouped by daily / weekly / monthly
  - Each row: name, schedule label, time (if set), priority badge; Edit and Del buttons on hover
  - Edit opens AddTaskModal pre-populated with lockRecurring = true (can't toggle recurring off)
  - Delete: first unlinks completed instances (sets recurrence_parent_id = null to preserve history), then deletes the definition
  - "+ Add Recurring" opens AddTaskModal with is_recurring pre-enabled
  - When a def is added/edited/deleted, TodaysTasks remounts via a React key increment to stay in sync

#### Shared components (added 8 June 2026)

- **`src/components/Modal.jsx`** — reusable overlay: bg-black/60 full-screen, bg-gray-900 border border-gray-800 rounded-lg max-w-md centred, header with title and × close, scrollable content area, Save/Cancel footer. Props: title, onClose, onSave, saveLabel, saveDisabled, saving, children.
- **`src/components/AddTaskModal.jsx`** — unified add/edit form using Modal. Fields: task name, date, time (optional), priority, recurring toggle (with frequency, day-of-week, day-of-month selectors when enabled), add-to-calendar checkbox. Props: title, onClose, onSave, initial (pre-populate), saving, lockRecurring (disables the recurring toggle for editing defs).
- **`src/components/TodaysTasks.jsx`** — self-contained today's tasks card. Fetches its own data (regular tasks for today + all recurring defs). Handles toggle, snooze, delete, and add via AddTaskModal. Props: compact (boolean — caps list at 6 with overflow count, hides snooze button).

#### Modal-first interaction pattern (established 8 June 2026)

All future form interactions across the app should use the shared Modal component, not inline forms. This is the established standard. Next migration targets: Finance page (subscriptions, fixed costs, income sources, snapshot entry), then Home page (habits edit). Do not add new inline forms.

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
- Currency field (GBP/AUD) on each item — amounts convert via CurrencyContext
- Uses `recurring_items` table (type: subscription / fixed_cost / income)

### Section 4 — Monthly Budget
- Month selector dropdown (rolling 12 months)
- Summary stats: Income, Expenses, Saved, Save Rate
- On first load for a given month, active recurring items are auto-inserted as budget entries (income sources → Income column; subscriptions + fixed costs → Expenses column)
- Auto-populated entries show a RECURRING badge; no delete button; Edit button opens inline form to override amount, category, and notes for that month without affecting the recurring item
- Manual one-off entries can still be added and deleted as before
- Uses `budget_entries` table with `recurring_item_id` FK to track origin

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
| `budget_entries` | month, category, type (income/expense), amount, currency, notes, recurring_item_id (FK, nullable) |
| `habit_definitions` | position, label — editable ordered list of habits; seeded with 6 defaults on first load |
| `habit_logs` | date (unique), habits (jsonb array of booleans, length matches habit_definitions count) |
| `tasks` | text, priority (HIGH/MEDIUM/LOW), done boolean, saved_at timestamptz, task_date date (nullable), task_time time (nullable), is_recurring boolean, recurrence_frequency text (daily/weekly/monthly), recurrence_day_of_week int (0=Mon…6=Sun), recurrence_day_of_month int (1–31), recurrence_parent_id uuid FK→tasks(id) ON DELETE CASCADE, snoozed_from date, add_to_cal boolean |
| `weekly_reviews` | week_start (unique Monday date), went_well, challenge_overcome, improve_next_week, consistency_score (int 1–10), proud_of, sealed_at timestamptz |
| `recurring_items` | name, type (subscription/fixed_cost/income), amount, frequency, currency (GBP/AUD), active boolean |
| `weekly_goals` | name, target_count, active boolean, created_at |
| `weekly_goal_logs` | goal_id (FK→weekly_goals), week_start date, count int, updated_at — unique on (goal_id, week_start) |

### Unified task system (as of 8 June 2026)

The `tasks` table handles all task types. There are two row kinds:

- **Regular task** — `is_recurring = false`, has `task_date`. Created by the user for a specific date. Can be snoozed (task_date → tomorrow, snoozed_from → today).
- **Recurring definition** — `is_recurring = true`, no `task_date`. Defines a recurrence rule. Never appears directly in the daily list.
- **Completed instance** — `is_recurring = false`, has `task_date` (the completion date), `recurrence_parent_id` points to the definition. Created when a user completes a recurring def for a given day. Deleting it un-completes the recurring task for that day.

Recurrence logic (applied in JS, not DB):
- Daily: always due
- Weekly: `recurrence_day_of_week` must match JS `(getDay() + 6) % 7` (0=Mon…6=Sun)
- Monthly: `recurrence_day_of_month`, with fallback to last day of month if the set day exceeds month length

When a recurring definition is deleted: first update all completed instances to set `recurrence_parent_id = null` (preserves history), then delete the definition.

Snapshot `total` is always stored in GBP. Individual entry `value` fields are stored in their original currency. Display conversion is view-layer only via `convert(amount, fromCurrency)` from CurrencyContext.

### Timezone note
All date strings must be built from local date components (e.g. `` `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` ``). Never use `toISOString().split('T')[0]` — this produces a UTC date which shifts by one day in Perth (UTC+8). String-based date arithmetic via `shiftDate(dateStr, n)` is the correct pattern.

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

## Current State (as of 7 June 2026)

### Phase 1 — Complete

Everything in Phase 1 is built and deployed.

**Foundation**
- Full environment setup — Homebrew, Node, Git, VS Code, GitHub
- React + Vite + Tailwind v3 scaffolded and running
- Supabase connected, app deployed to Vercel at the-motherboard-pi.vercel.app
- CurrencyContext with live GBP→AUD rate (frankfurter.app), GBP/AUD toggle in header

**Home page**
- Three-column layout matching the agreed brief
- Operator card (week number, habits score), Net Worth card (sparkline, m/m delta), Freedom Figure progress bar
- Session card (clock, date, Perth/UK time)
- Habits — editable list from `habit_definitions`; daily checkboxes reset at midnight; persists to `habit_logs`
- This Week — task list with HIGH/MEDIUM/LOW priorities, Save button with timestamp; persists to `tasks`
- Weekly Review — five goal-specific fields, auto-save (800ms debounce), Seal Week button; persists to `weekly_reviews`
- Assets, Budget, and Trading snapshot cards in right column

**Finance page**
- Full rebuild as `FinancePage.jsx`
- Summary cards: Net Worth, Runway, Income/mo, Burn/mo
- Liquid Cash and Invested Assets cards with sparklines and per-account breakdown
- Recurring items: Subscriptions, Fixed Costs, Income Sources — full add/edit/delete CRUD, per-item currency (GBP/AUD), monthly total
- Monthly Budget — auto-populated from recurring items on first load; RECURRING badge; inline edit override; manual entries add/delete; month selector
- Snapshot History table — Period, Net Worth, Cash, Invested, Δ vs Prior (value + % change), inline edit per row, new snapshot form

### Phase 2 — Complete as of 8 June 2026

**Home page** — all improvements complete and live, including TodaysTasks compact view replacing This Week card.

**Productivity tab** — full rebuild complete. Unified task system, modal-first pattern, all sections functional.

### Known Issues

None currently known.

### Next Session

1. Test the full task system on the live app — verify adding tasks, completing recurring tasks, snooze, delete, and recurring def CRUD all work correctly. Fix anything broken before proceeding.
2. Finance page modal migration — move subscriptions, fixed costs, income sources, and snapshot entry forms into modals using the shared Modal component. Do not change any data logic, only the interaction layer.
3. Home page modal migration — habits edit mode and weekly review into modals (lower priority than Finance).

---

## Notes for Claude Code

- Always read this file at the start of a session before making any changes
- The app is at `/the-motherboard` — check `src/` for all components
- Supabase config is in `.env` — never hardcode keys
- Tailwind v3 is in use — do not upgrade or change the Tailwind setup
- When adding new Supabase tables, provide the SQL separately so I can run it in the Supabase dashboard
- Commit message style: plain English, lowercase, descriptive (e.g. `add per-entry currency selection to net worth tracker`)
- Finance page visual tokens are the source of truth for styling — see Design Direction above
- Priority tags are HIGH/MEDIUM/LOW everywhere — never use HOT/WARM/COOL
- Date strings must always use local date components — never toISOString() — see Timezone note above
- All new form interactions must use the shared Modal component at `src/components/Modal.jsx` — no new inline forms. See Modal-first interaction pattern above.
- The unified task system uses `is_recurring` to distinguish definitions from regular tasks — see Unified task system above before touching any task-related code
