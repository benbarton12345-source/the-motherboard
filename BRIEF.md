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
  - Each day column has a faint border (`border border-gray-800 rounded`) for visual separation
  - Only timed tasks (task_time set) appear as blocks in calendar columns; green border = regular task, purple border = recurring definition
  - Calendar blocks use truncated text to prevent overflow
  - Recurring definitions with task_time auto-populate on their scheduled day; completed instances suppress the definition block so no duplicates appear
  - A single "+ Add Task" button opens the shared AddTaskModal
  - Weekly goals with name and target_count; count tracked in `weekly_goal_logs` per week; +/− buttons; progress bar green/amber/red

- **Section 2 — Today's Tasks + Upcoming + Week Summary (three-column layout)**
  - Today's Tasks uses the shared TodaysTasks component (same as Home page)
  - Shows: regular tasks with task_date = today, plus recurring definitions due today that have no completed instance for today
  - Sorted by time first, then priority
  - Each task: checkbox to complete, snooze button (→ tomorrow, sets snoozed_from = today), Edit button (opens AddTaskModal), delete button
  - Recurring tasks show ↻ REC badge; snoozed tasks show SNOOZED badge
  - Completing a recurring task creates a completed instance row with recurrence_parent_id = def.id and task_date = today
  - Unchecking a completed instance deletes the instance row (restores to uncompleted)
  - Upcoming panel: shows next 7 days of tasks — regular tasks (task_date > today and ≤ today+7) plus projected recurring occurrences; sorted by date then time; Edit button on regular tasks (opens modal); × delete on regular tasks only
  - Week summary: tasks done/total, habit score (from habit_logs, last 7 days), goals hit — progress bars plus streak count

- **Section 3 — Recurring Task Definitions**
  - Lists all is_recurring = true tasks grouped by daily / weekly / monthly
  - Each row: name, schedule label, time (if set), priority badge; Edit and Del buttons on hover
  - Edit opens AddTaskModal pre-populated with lockRecurring = true (can't toggle recurring off)
  - Delete: first unlinks completed instances (sets recurrence_parent_id = null to preserve history), then deletes the definition
  - "+ Add Recurring" opens AddTaskModal with is_recurring pre-enabled
  - When a def is added/edited/deleted, TodaysTasks remounts via a React key increment to stay in sync

#### Productivity tab (stability fixes as of 9–11 June 2026)

Full audit of ProductivityPage, TodaysTasks, and AddTaskModal identified state synchronisation issues and duplicate helper functions. All issues resolved:

- **`src/utils/taskHelpers.js`** — shared helpers extracted: `localDate`, `shiftDate`, `getLastDayOfMonth`, `isRecurringDueOnDate`. Both ProductivityPage and TodaysTasks import from here; no duplication.
- **Recurring def state lifted** — `recurringDefs` and `setRecurringDefs` now live in ProductivityPage and are passed as optional controlled props to TodaysTasks. When on ProductivityPage, both components share the same state so adding/editing a def in TodaysTasks is immediately reflected in the Upcoming panel and calendar. When on HomePage, TodaysTasks manages its own local copy unchanged.
- **Calendar duplicate blocks fixed** — `timedRecurringForDay` now excludes definitions that already have a completed instance for that day, preventing double blocks.
- **New tasks updating Upcoming immediately** — when a task is added via TodaysTasks with a future date, an `onTaskChanged` callback fires and ProductivityPage adds it to `upcomingTasks` state without a refetch.
- **Edited tasks moving between panels correctly** — editing a task to change its date removes it from Today's Tasks if the new date is not today; adds or removes it from Upcoming based on whether the new date falls within the next 7 days.
- **stale editingTaskId fixed** — `openAddTask` and `openAddRecurring` both clear `editingTaskId` so a prior edit session can never corrupt a subsequent add.
- **Global text overflow fixed** — `truncate min-w-0` audit applied across Home, Finance, and Productivity pages; all cards and labels overflow cleanly.

Productivity page is now considered stable.

#### Shared components (added 8 June 2026)

- **`src/components/Modal.jsx`** — reusable overlay: bg-black/60 full-screen, bg-gray-900 border border-gray-800 rounded-lg max-w-md centred, header with title and × close, scrollable content area, Save/Cancel footer. Props: title, onClose, onSave, saveLabel, saveDisabled, saving, children.
- **`src/components/AddTaskModal.jsx`** — unified add/edit form using Modal. Fields: task name, date, time (optional), priority, recurring toggle (with frequency, day-of-week, day-of-month selectors when enabled), add-to-calendar checkbox. Props: title, onClose, onSave, initial (pre-populate), saving, lockRecurring (disables the recurring toggle for editing defs).
- **`src/components/TodaysTasks.jsx`** — self-contained today's tasks card. Fetches its own data (regular tasks for today + all recurring defs). Handles toggle, snooze, delete, edit, and add via AddTaskModal. Props: compact (boolean — caps list at 6 with overflow count, hides snooze button), recurringDefs / setRecurringDefs (optional controlled props when used inside ProductivityPage), onTaskChanged (optional callback fired after any task insert or edit, used by ProductivityPage to sync upcomingTasks).
- **`src/utils/taskHelpers.js`** — shared date and recurrence helpers used by both ProductivityPage and TodaysTasks.

#### Modal-first interaction pattern (established 8 June 2026)

All future form interactions across the app should use the shared Modal component, not inline forms. This is the established standard. Do not add new inline forms anywhere in the app.

#### Finance page modal migration (complete as of 13 June 2026)

All inline forms on the Finance page moved into modals. Cards now show read-only data only — all add/edit/delete interactions go through the shared Modal component. Affected areas: Subscriptions, Fixed Costs, Income Sources (each uses a single "Manage" modal with inline edit + add new section), Monthly Budget income/expense entries, and New Snapshot. Budget entry modals include a Name field that saves to the `notes` column. Snapshot modal uses `maxWidth="max-w-2xl"` to accommodate the 12-column account grid.

Modal component extended with two new props: `maxWidth` (default `'max-w-md'`) and `cancelLabel` (default `'Cancel'`).

#### Home page modal migration (complete as of 13 June 2026)

- **Habits edit mode** — EDIT button on the Habits card now opens a Modal titled "Edit Habits". The Habits card always shows read-only checklist only. No inline edit mode remains on the page surface.
- **Weekly Review** — always-visible textarea form replaced with a compact summary card showing the week date range, consistency score, truncated wins preview, and Sealed badge. "Write Review" button opens a Modal with all five fields. Auto-save (800ms debounce) continues to fire. Seal Week button lives inside the modal. Once sealed, button becomes "View Review" and fields are read-only. `saveLabel="Done"`, `cancelLabel="Close"` — both footer buttons close the modal.

### Phase 3 — Trading Analytics

Manual input initially. IG API integration later (IG has REST + Lightstreamer APIs — future work).

Metrics:
- Win rate, P&L over time, R:R ratio, profit factor, max drawdown, average hold time, top markets by P&L, P&L per trade
- Supply and demand swing trading strategy
- DEMO mode badge until live capital deployed

### Phase 4 — Health & Performance

#### Health page (complete as of 13 June 2026)

File: `src/components/HealthPage.jsx`

**Section 1 — Summary cards**
Five cards: Health Score (weighted composite, 0–100), Steps Today, Sleep Last Night, Active Cal, Heart (Resting HR + HRV). Cards show real data from `apple_health_logs` where available; fall back to `<ConnectBadge />` when null. Grid: `lg:grid-cols-3 xl:grid-cols-5`. Health score weights: Sleep 30%, Steps 20%, HRV 20%, Weight trend 15%, Nutrition 15%.

**Section 2 — Weight tracker**
- Recharts `LineChart` with two series: actual weight (emerald line) and 7-day moving average (dashed grey). Target weight shown as a dashed `ReferenceLine` when set.
- Range toggle: 30D / 90D / All
- Stat cards: Current, 7-Day Avg, Target, To Target
- Buttons in card header: View History | Set Target | + Log Weight
- **Log Weight modal** — Date, Weight (kg), Notes fields; inserts to `weight_logs`
- **Set Target modal** — single weight input; persists to `health_settings.weight_target_kg`
- **View History modal** (`max-w-2xl`) — table of all entries (Date, Weight, Notes, Edit/Delete per row). Clicking Edit switches the modal to an edit form; Back returns to the list. Delete removes the row and refreshes chart and stat cards immediately.

**Section 3 — Nutrition**
- Daily macro tracking — logs meals for today from `meal_logs`
- Macro progress bars: Calories, Protein, Carbs, Fat vs targets
- Three meal entry modes via tabbed modal: AI Estimate (describe → AI estimates → review/adjust → save), Manual (fill in numbers directly, no API call), Recent (pick from last 7 days deduplicated by name → pre-fills manual form for quick reuse or tweaking)
- Meal suggestion button — AI suggests a meal based on remaining daily targets
- Meal list for today with hover edit/delete; Edit opens a pre-populated edit modal
- Nutrition settings modal — two modes: Calories (set kcal target + macro % split) or Macros (set g directly); derived targets calculated and persisted
- Targets and settings persist to `health_settings` table

**Section 4 — Weekly breakdown**
Table showing each day of the current week with total calories and macros logged.

#### AI integration (Anthropic API)

Two Vercel serverless functions handle all Anthropic API calls. The API key is server-side only (`process.env.ANTHROPIC_API_KEY`, no `VITE_` prefix, never in the browser bundle).

- **`api/estimate-meal.js`** — POST `{ description, previousMeals }` → returns `{ description, kcal, protein_g, carbs_g, fat_g }`. Model: `claude-sonnet-4-6`, max_tokens 500. Includes yesterday's meals as context. Returns JSON only.
- **`api/suggest-meal.js`** — POST `{ remainingKcal, remainingProtein, remainingCarbs, remainingFat }` → returns `{ suggestion }`. Returns plain text (markdown stripped before display).

#### Apple Health integration (complete as of 17 June 2026)

Integration via Health Auto Export (iOS app), which pushes to `api/health-sync.js` on a schedule.

- **`api/health-sync.js`** — POST webhook receiver. Parses `data.metrics` and `data.stateOfMind` from Health Auto Export payloads. Upserts to `apple_health_logs` (one row per date, `onConflict: 'date'`). Perth-safe date extraction uses `String(raw).slice(0, 10)` — never `new Date()`.
- **Metrics mapped**: `step_count` → `steps`, `sleepAnalysis` (totalSleep hours → `sleep_minutes`; deep/rem/core/awake hours → `sleep_deep_minutes` / `sleep_rem_minutes` / `sleep_core_minutes` / `sleep_awake_minutes`), `heartRateVariability` / `hrv` → `hrv_ms`, `restingHeartRate` → `resting_hr`, `activeEnergy` / `activeCalories` → `active_calories` (Health Auto Export sends kJ — divided by 4.184 on ingest to get kcal), `stateOfMind` valence (−1 to 1) → `mood_score` (converted to 1–10 scale).
- **Step deduplication**: Health Auto Export sends per-minute `step_count` samples, often duplicated across overlapping sources (e.g. "Ben's Apple Watch", "Ben's iPhone", and "Ben's Apple Watch|Ben's iPhone"). Raw samples are upserted to `apple_health_step_samples` (unique on `date, timestamp`). Before upserting, samples are deduplicated in JS — for each `(date, timestamp)`, the max qty across sources is kept. Daily total is then recomputed from the full samples table (direct `SUM(qty)` — one row per timestamp, so no further deduplication needed).
- **Step bug fixed (18 June 2026)**: Two root causes identified and resolved. (1) Raw per-minute samples were being summed within the sync call without deduplicating across overlapping sources, causing wildly inflated daily totals. Fixed by the `apple_health_step_samples` deduplication approach above. (2) The step metric filter used `.includes('step')`, which incorrectly matched `walking_step_length` (stride length in cm) as well as `step_count`, corrupting the daily total by mixing stride-length values into the step sum. Fixed by changing the filter to an exact match: `=== 'step_count'`.
- **HealthPage.jsx** reads `apple_health_logs` (last 14 rows, ordered by date desc). `latestHealthLog` = most recent row (steps, active calories, HRV, resting HR). `latestSleepLog` = first row with non-null `sleep_minutes` (sleep belongs to the prior day's date row). `healthLogByDate` memo indexes rows by date string for O(1) weekly panel lookups. 7-day averages computed for HRV, resting HR, and active calories via `avgField(rows, field)`. Summary cards show real data where available; fall back to `<ConnectBadge />` when null.
- **Sleep card breakdown**: when `sleep_deep_minutes` / `sleep_rem_minutes` are non-null on `latestSleepLog`, a 2-column breakdown grid shows Deep / REM / Core / Awake in `Xh Ym` format, colour-coded (purple / blue / emerald / amber). Confirmed working with real data (20 June 2026: 55m deep, 111m REM, 360m core, 1m awake).

#### Telegram meal logging (planned)
Send a message to a Telegram bot describing a meal; bot parses it and writes to `meal_logs` via a webhook/serverless function.

---

### Phase 5 — Training

File (to be created): `src/components/TrainingPage.jsx`

Phone-first for logging, desktop-first for analysis.

#### Tab flow (three levels)

1. **Session list** — the Training tab opens showing the user's sessions listed (e.g. Upper 1, Lower 1, Upper 2, Lower 2). Tap one, then "Start session".
2. **Session overview** — shows that session's full exercise list with sets and rep targets visible, so the user sees the whole workout ahead. Each exercise row has a small line-chart icon indicating whether that lift is trending up (glanceable signal only, not a full graph — deep analysis is a desktop job).
3. **Exercise logging** — tap an exercise to open its logging view. Shows last session's weight/reps as reference. Reps entered via BOTH tap-increment buttons AND keyboard. Logging a set auto-advances to the next, but the user can always go back and edit a prior set. Can add an extra set on the fly. Can swap an exercise on the day without altering the saved programme template. Optional per-exercise note logged at the time (e.g. record a tweak felt during bench).

#### End of session

When finishing a logged session: session rating out of 10, energy rating out of 10 (how energy levels felt), and an optional session notes box.

#### Modal managers (opened occasionally, not permanent screen space)

- **Exercise bank** — inline add/edit/delete of the exercise library. Each exercise = name + muscle group (muscle group is an editable dropdown: presets Chest/Back/Legs/Shoulders/Arms/Core, but custom values allowed). Mockup approved.
- **Programme builder** — create/edit sessions (Upper 1, Lower 1, etc.), define which exercises sit in each, their order, rep targets, and top-set/back-off structure.

#### Desktop — progress analysis (primary analysis surface, kept out of the mid-workout flow)

- Per-lift progress graphs over weeks.
- Bodyweight ratio per lift, pulling the user's logged weight from the existing Health module.
- Flags for lifts that are progressing, stalled, or being skipped.

#### Progressive overload rule

If actual reps >= target reps on the top set, show a simple nudge: "increase weight or reps next time." No specific numeric increment is suggested — the user decides how much to add based on feel.

#### Data spine

| Table | Purpose |
|---|---|
| `exercises` | id, name, muscle_group — the exercise bank |
| `programme_sessions` | id, name (e.g. "Upper 1"), position (ordering) |
| `programme_exercises` | id, session_id (FK), exercise_id (FK), position, set_number, target_reps |
| `training_logs` | id, date, session_id (FK), session_rating (int 1–10, nullable), energy_rating (int 1–10, nullable), note (session-level, nullable) |
| `training_sets` | id, log_id (FK), exercise_id (FK), set_number, target_reps, actual_reps, actual_weight, note (nullable) |

RLS disabled on all training tables — same pattern as health tables.

Overload nudge is derived in the frontend by comparing `actual_reps >= target_reps` on the top set (set_number = 1) of the most recent log entry for each exercise. Analysis derives from logged sessions vs targets, plus bodyweight history from the Health module.

#### Build order (strictly sequential, each depends on the prior)

1. **Exercise bank** — complete (21 June 2026). `src/components/ExerciseBankModal.jsx`. Training tab added to nav. Modal manager: grouped list by muscle group, add/edit/delete, editable datalist for muscle group.
2. **Programme builder** — current build target. Needs exercises to exist.
3. **Phone logging screen** — needs programmes to load; mockup approved.
4. **Progress analysis, desktop** — needs logged history to chart.

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
| `apple_health_logs` | date (unique, NOT NULL), steps (integer), sleep_minutes (integer), sleep_deep_minutes (integer), sleep_rem_minutes (integer), sleep_core_minutes (integer), sleep_awake_minutes (integer), hrv_ms (numeric), resting_hr (integer), active_calories (integer, stored in kcal — Health Auto Export sends kJ, divided by 4.184 on ingest), mood_score (numeric) — one row per date, upserted by `api/health-sync.js` |
| `apple_health_step_samples` | id (uuid PK), date (date NOT NULL), timestamp (text NOT NULL), qty (integer NOT NULL), source (text), created_at — unique on (date, timestamp); stores raw per-minute step samples for cross-source deduplication |
| `weight_logs` | date (NOT NULL), weight_kg (NOT NULL), notes (nullable), created_at |
| `meal_logs` | date (NOT NULL), time (nullable — column is `time`, not `logged_at`), description (NOT NULL), kcal, protein_g, carbs_g, fat_g, created_at |
| `health_settings` | weight_target_kg (nullable), sleep_target_hours (default 8), steps_target (default 10000), nutrition_mode (default 'calories'), kcal_target (default 2000), protein_target_g (default 150), carbs_target_g (default 200), fat_target_g (default 70), protein_pct (default 30), carbs_pct (default 40), fat_pct (default 30) — single row, no user_id |

### Health table notes

- All five health tables have RLS disabled — anon key has full read/write access.
- `health_settings` is a single-row table. The code reads with `.limit(1).maybeSingle()` and tracks the row's `id` in `settingsId` state to decide insert vs update. The `persistHealthSettings` function strips `id` from the update payload to avoid primary key conflicts.
- `meal_logs` time column is named `time` (not `logged_at`). The frontend form state uses `logged_at` internally but maps to `time` on insert/update.
- `health_settings` column for weight target is `weight_target_kg` (not `target_weight_kg`). All code references use `weight_target_kg`.
- The nutrition columns (`nutrition_mode`, `kcal_target`, etc.) must exist in `health_settings` or all writes will fail with PGRST204 — they are always included in the insert/update payload.

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

## Current State (as of 20 June 2026)

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
- Habits — editable list from `habit_definitions`; daily checkboxes reset at midnight; persists to `habit_logs`; edit mode now in a Modal
- TodaysTasks compact view (max 6 items) in centre column, replacing old This Week card
- Weekly Review — compact summary card with "Write Review" / "View Review" modal; five goal-specific fields, auto-save (800ms debounce), Seal Week button inside modal; persists to `weekly_reviews`
- Assets, Budget, and Trading snapshot cards in right column

**Finance page**
- Full rebuild as `FinancePage.jsx`
- Summary cards: Net Worth, Runway, Income/mo, Burn/mo
- Liquid Cash and Invested Assets cards with sparklines and per-account breakdown
- Recurring items: Subscriptions, Fixed Costs, Income Sources — full add/edit/delete CRUD via Manage modal per card; per-item currency (GBP/AUD); monthly total
- Monthly Budget — auto-populated from recurring items on first load; RECURRING badge; add/edit entries via modal; month selector
- Snapshot History table — Period, Net Worth, Cash, Invested, Δ vs Prior; New Snapshot modal (`max-w-2xl`)
- All inline forms removed; modal-first pattern throughout

### Phase 2 — Complete as of 13 June 2026

**Home page** — modal migration complete. Habits edit and Weekly Review both in modals. All page surfaces show read-only data only.

**Finance page** — modal migration complete. All inline forms removed from page surfaces.

**Productivity tab** — full rebuild complete and stable. Unified task system, modal-first pattern, all sections functional. State sync between ProductivityPage and TodaysTasks fully resolved. Productivity page is considered stable — do not refactor unless a specific bug is reported.

### Phase 4 — Health page complete as of 20 June 2026

Health page is built and stable. All sections functional with real Apple Health data. AI meal estimation and suggestion working via Vercel serverless functions. Weight tracker, nutrition tracking, and settings all persisting to Supabase. View History modal allows editing and deleting past weight entries. RLS disabled on all health tables.

**Apple Health integration complete as of 18 June 2026.** Step deduplication via `apple_health_step_samples` working end to end. Two step-count bugs fixed (source overlap inflation and `walking_step_length` contamination). See Apple Health integration section for full detail.

**Consolidation fixes complete as of 20 June 2026.** See fixes detail above. All confirmed working with real synced data.

**Health page consolidation fixes (20 June 2026) — all confirmed working:**

1. **active_calories unit bug** — Health Auto Export sends `active_energy` in kJ, not kcal. `health-sync.js` was summing the raw value with no conversion, so all stored values were ~4.184× too high. Fixed by dividing by 4.184 on ingest. A one-off SQL migration corrected all existing `apple_health_logs` rows by the same factor.

2. **Weekly history panels** — Steps This Week / Sleep This Week / HRV This Week were showing em-dashes for every day despite data existing in `apple_health_logs`. Root cause: the component iterated `WEEK_DATES` but never looked up the date in the health data. Fixed via a `healthLogByDate` memo (keyed by date string) so each panel row does an O(1) lookup. Confirmed showing real numbers across the week.

3. **Sleep stage breakdown** — added `sleep_deep_minutes`, `sleep_rem_minutes`, `sleep_core_minutes`, `sleep_awake_minutes` to `apple_health_logs`. `health-sync.js` now parses `entry.deep / rem / core / awake` (hours) from `sleepAnalysis` payloads and converts to minutes. Sleep card shows a 2-column breakdown grid when data is present. Confirmed with real synced data (20 June: 55m deep, 111m REM, 360m core, 1m awake).

4. **Active Calories tile** — fifth summary card showing today's kcal burned and 7-day average. Grid: `lg:grid-cols-3 xl:grid-cols-5`.

**Nutrition module additions (20 June 2026):** The Add Meal modal now has three tabs — AI Estimate (existing flow unchanged), Manual (enter description + calories/macros directly, no API call), Recent (last 7 days deduplicated by description, most recent instance kept, selecting one pre-fills the manual form). All three paths save through the same `meal_logs` insert so meals display identically. `Modal.jsx` gained a `hideSave` prop (omits the save button from the footer; used for the Recent tab where interaction is list-click rather than a form submit).

### Known Issues

- **Mobile responsive layout** — needs a dedicated pass, particularly the Health page summary tile row (now 5 tiles) on small screens. No fix attempted yet.

### Phase 5 — Training (in progress as of 21 June 2026)

**Exercise bank complete.** Training tab added to nav. `src/components/ExerciseBankModal.jsx` — grouped list by muscle group, inline add/edit/delete, name + editable datalist muscle group (presets: Chest, Back, Legs, Shoulders, Arms, Core). `exercises` table in Supabase, RLS disabled.

### Next Session

**Programme builder** — step 2 of 4. Needs exercises table to exist (done). Define sessions (Upper 1, Lower 1, etc.) and which exercises sit in each, with order, rep targets, and top-set/back-off structure.

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
