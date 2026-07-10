# Handoff: Productivity Section Redesign — The Motherboard

## Overview
This package covers a redesign and restructure of the **Productivity** section of "The Motherboard" (Ben's personal life-tracking app, live at the-motherboard-pi.vercel.app). The single existing Productivity page is being split into four sub-pages — **Overview, Habits & Goals, Tasks, Reading** — plus a **Weekly Review modal**. The app-wide sidebar navigation already exists in production and is not part of this handoff; only the Productivity content and its four sub-nav items are new.

## About the Design Files
The files in this bundle are **design references built in HTML** — interactive prototypes showing intended layout, visual language, and behavior. They are not production code to copy directly. The task is to **recreate these designs in the target codebase's existing stack** (whatever framework/styling system the-motherboard already uses — likely React + Tailwind or CSS modules, backed by Supabase) using its established component and data patterns, not to port the raw HTML/inline-styles.

Two files are included:
- **`Productivity App (interactive prototype).dc.html`** — the primary reference. A working click-through prototype with real state: navigate between all 4 sub-pages, toggle habits/weekly goals, edit items inline, expand long-term goal journals, manage tasks (including overdue), log reading, and run the full Weekly Review modal flow (fill in, seal, streak increments). **This is the source of truth for behavior.**
- **`Productivity Redesign (static mockups).dc.html`** — earlier static mockups of the same screens at both desktop and mobile viewport sizes, useful for checking responsive layout intent (the interactive prototype is desktop-only).

To view either file, open it directly in a browser — no build step required.

## Fidelity
**High-fidelity.** Colors, spacing, and typography in the prototype are meant to match the existing Motherboard visual language exactly (dark background, card-based layout, emerald accent) — this was explicitly required by the brief, not a new visual direction. Recreate pixel-close using the codebase's existing design tokens/components where they already cover these values (buttons, cards, badges, inputs) — only introduce new styles for patterns that don't exist yet (habit day-grids, journal entries, the heatmap).

## Design System Notes (carried over from the existing app — do not deviate)
- Dark theme only. Background `#0c0f1e`, card surface `#131726`, nested/inset surface `#0f1220`.
- **Emerald `#10b981`** is the one primary accent — used for active nav, primary buttons, "on track" states, positive progress bars, links.
- **Red `#ef4444`** = negative/overdue/unmet (e.g. "0/3 this week", overdue task borders).
- **Amber `#f59e0b`** = warning/behind-pace/not-yet-done (e.g. weekly review not started, "BEHIND" yearly goal badge).
- **Purple was removed intentionally.** The previous Reading tracker used a purple glow/accent; the user explicitly disliked this and asked for it to be replaced with emerald, matching the rest of the app. Do not reintroduce purple anywhere in Productivity.
- Typography: Inter, weights 400/500/600/700. Section eyebrow labels are `10-11px`, uppercase, `600` weight, `0.08em` letter-spacing, emerald. Body text `12-13px`. Headline numbers `20-40px` `700` weight.
- Cards: `8px` border-radius, `1px solid rgba(255,255,255,0.07)` border, no drop shadows (flat dark UI).
- Buttons: primary = solid emerald bg with dark text (`#0c0f1e`) on emerald; secondary = transparent bg with `1px` emerald or neutral border.

## Screens / Views

### 1. Productivity Overview (landing page)
**Purpose:** A 10-second pulse check across all four sub-pages — not a deep dive. This is what Ben sees every time he opens Productivity.

**Layout:** Single scrollable column, `18-22px` padding, `12-14px` gaps between sections, top-to-bottom:
1. **Week snapshot strip** — 4-column grid of stat cards: Tasks Today (done/total, overdue count in red if any), Habit Score (done/total across all habits' 7-day grids + top streak), Goals This Week (weekly goals hit/total, red if not all hit), Reading (current book, chapter progress, books this year).
2. **Habits This Week + Goals Pulse** — 2-column grid (3fr/2fr). Left: compact list of active habits, each row = name + streak, 7-day tap grid (see Habits & Goals below for interaction), "View all →" link to Habits & Goals. Right: 2-4 most-relevant yearly goals shown as compact progress bars with ON TRACK/BEHIND badges (pulled only from **yearly** goals — long-term goals like Freedom Figure are NOT shown here since they're not deadline-bound), "View all →" link.
3. **Weekly Review card** — full width, prominent, border color signals state (amber = not started, emerald = sealed). Shows week number, streak count, and either a "Start Weekly Review" button (amber, opens modal) or "View this week's review" link (emerald, sealed state).
4. **Today's Tasks + Reading** — 2-column grid. Left: compact today's-tasks preview (first 3-4, checkbox to toggle inline) or empty state with next-upcoming hint. Right: current book card with cover placeholder, progress bar, "on track" badge.

### 2. Habits & Goals
**Purpose:** Single long scrollable page covering all three goal tiers plus habits. Density is expected — do not compress to fit above the fold.

**Layout**, top to bottom with clear section headers and `20px` gaps between sections:
1. **Summary strip** — 4-column stat cards: Yearly Goals on-track count, Top Habit Streak, Long-term Goals total/achieved, Weekly Goals hit/total.
2. **Habits** — Daily/frequent personal habits tracked with **streaks**, distinct from Weekly Goals (see Data Model below for why they're separate). Each habit card: name, edit (✎) button, 7-day dot/pill grid, streak count. A shared **week navigator** (‹ This week / Last week / N weeks ago ›) above the list lets Ben page backward to backfill missed days in past weeks — the current week only allows toggling "today"; any other day (past week or earlier in current week) opens a **backfill confirm popover** ("Mark {day} as done for {habit}? Confirm / Cancel") rather than toggling instantly. "+ Add Habit" at the bottom (prompts for name).
3. **Weekly Goals** — Frequency-based goals for the *current* week only (Gym 3x, Sauna Ice Bath 1x, Muay Thai 1x, Facetime Mum 1x). Each row: name + edit, a 7-day tap grid where tapping **today** toggles instantly and tapping a **past day** opens the same backfill-confirm pattern, and a current/target counter colored red (not yet hit) or emerald (hit). Ticking Sauna's grid also auto-increments the linked yearly "Sauna 200x" goal (see Data Model — cross-linking). "+ Add" prompts for name, then goal type (numeric count e.g. 3x/week, or simple 1x completion).
4. **Yearly Goals — {year}** — two card types in one grid:
   - **Numeric** (Read 6 Books, Sauna 200x): title, edit, ON TRACK / BEHIND / WAY BEHIND badge (computed from progress-vs-elapsed-year-fraction, not just raw %), current/target, progress bar colored to match badge, "Auto-updating via {source}" indicator with no manual-update control when linked, otherwise a manual "Update" affordance.
   - **Boolean** (Run a Marathon): checkbox-style completion toggle, title, edit, target date, status text. Completed goals get a strike-through + emerald tick and should sort to the bottom (not yet built into the prototype's sort — add this in implementation).
   - "+ Add Goal" asks name, then type (numeric value or boolean milestone), then relevant fields.
5. **Long-term Goals** — the someday bucket list, simpler than yearly goals: no deadline pressure. Supports both **boolean** milestones (Buy a House, Start a Business, Run an Ultramarathon) and a **numeric** goal (Freedom Figure — net worth target). Crucially: **do not apply on-track/behind-pace judgment language to long-term goals** — Freedom Figure shows current/target and a neutral emerald progress bar with no "behind" badge, because it has no fixed year deadline.
   - Each goal card is **clickable to expand** a journal panel showing:
     - A **Phase selector** — three pills (Not Started / In Progress / Done), replacing any ambiguous single-click-to-cycle interaction. Clicking a pill sets status directly.
     - (Numeric goals only) an "Update current value" action.
     - A **Journal**: reverse-chronological list of dated free-text entries (`{date}: {text}`), a textarea, and an "Add Entry" button that stamps today's date and prepends the entry. This is meant to feel like a running diary on the goal, not a form — no title/structure per entry, just date + text.
   - Completed goals (phase = Done) move out of the active list into a collapsed "Achieved (N)" section at the bottom, toggle to expand/collapse.
   - "+ Add" prompts for name only, defaults to boolean/not-started (numeric long-term goals like Freedom Figure need a dedicated form in the real build — the prototype's quick-add doesn't cover the numeric case).

### 3. Tasks
**Purpose:** Pure task + calendar management — no goal tracking, no weekly review trigger (both moved elsewhere).

**Layout:** Full-width vertical stack (not the side-by-side split originally briefed — user feedback said side-by-side felt cramped once the calendar became interactive):
1. **Weekly Calendar** (top, full width) — 7 equal columns Mon-Sun, each a day cell with date number and any tasks due that day shown as small pills (time + name, REC badge if recurring, tap to toggle done). A **‹ / ›** week navigator pages the calendar independently of "today" — implement using real date arithmetic (a fixed anchor date + day offset), not string/number concatenation, so month boundaries roll over correctly (this was a bug caught in QA — e.g. paging back from "6 Jul" must show "29 Jun", not "-1 Jul"). "+ Add Task" prompts for a name and creates it due today.
2. **Task List** (below, full width) — in order:
   - **Overdue** (only shown if any exist) — red-bordered 2-column card grid, each card shows name, "{N} days overdue" in red, edit (✎) and delete (🗑) actions, and a checkbox to mark complete.
   - **Today** — 2-column card grid, checkbox + name + time + REC badge + priority badge (HIGH/MEDIUM/LOW colored red/amber/neutral), edit + delete.
   - **Upcoming** — same card pattern, sorted by due date.
   - **Completed** — collapsed by default behind a "Completed (N) ▼" toggle; expanded rows show strike-through text at reduced opacity, still deletable.
   - Empty state for "no tasks today": centered text "No tasks for today" + "Add a task to get started".

### 4. Reading
**Purpose:** Moved as-is from the old single Productivity page — no redesign of the reading tracker's own layout, only visual updates to remove purple.

**Layout:**
1. **Currently Reading + 2026 Progress** — 2-column grid. Left: book cover placeholder, title/author, progress bar + %, primary **"📖 Log 10 min reading"** button (see Data Model — this is a new addition per user request, replacing/augmenting simple +/-5% chapter nudges), a small "undo last log" link to correct accidental taps, and −5%/+5%/✓ Finished manual controls as a fallback. Right: books-this-year count, on-track/behind label, year-% of goal, and the "Finished This Year" list (title/author/genre/date).
2. **Reading Activity heatmap** — GitHub-style 26-week × 7-day grid, columns = weeks (oldest to newest, left to right), 4-level emerald opacity scale, streak count shown top-right.
3. **Reading Queue** — future-reads list, each row: cover placeholder, title, author, "NEXT" badge on the first item, edit (✎) and remove (🗑) actions, "+ Add Book" prompts for title then author.

### 5. Weekly Review Modal
**Purpose:** Triggered from the Overview weekly-review card. Builds a weekly reflection habit.

**Layout:** Centered modal, dark overlay behind. Header shows week number + date range, a "SEALED" badge if locked, close (×). A streak banner strip below the header ("Complete this review to continue your **N-week streak**" / "You kept your **N-week streak**" once sealed). Body, in exact order:
1. What went well this week? (textarea)
2. One challenge I overcame (textarea)
3. One thing I can improve next week (textarea)
4. One thing I am proud of (textarea)
5. Consistency Score 1–10 (number input)
6. Anything else? (textarea, no prompt copy — just an open field)

Footer: "SEAL WEEK" button (locks entry, increments the Overview streak, flips the card to sealed/emerald state) on the left, "CLOSE" + "DONE" on the right. Once sealed, all fields become read-only and the seal button is replaced with a "✓ Sealed — read only" label.

**Not yet built in the prototype (spec only, see brief):**
- A **week selector** at the top of the modal to retrospectively add/edit a past (non-current) week's review.
- A **history view** — accessible from the Overview card — listing past completed reviews; clicking one opens it read-only (or editable if not yet sealed).

## Interactions & Behavior Summary
- **Nav:** sidebar's 4 Productivity sub-items switch a single `page` state value; no full page reloads.
- **Habit/weekly-goal day grids:** clicking **today's** cell toggles instantly. Clicking any **other** cell that isn't already done opens a small confirm popover anchored near the click ("Mark {day} as done for {name}? Confirm/Cancel") before committing — this applies to both Habits (any visible week, via the week navigator) and Weekly Goals (current week only, since weekly goals reset weekly by definition).
- **Inline editing:** a single ✎ pattern is reused across Habits, Weekly Goals, Yearly Goals (numeric + boolean), and Tasks — clicking it swaps the row into an inline form (name [+ target where relevant]) with Save/Cancel, rather than opening a separate modal.
- **Long-term goal journal:** clicking anywhere on the card (except the phase pills, which stop propagation) expands/collapses the journal panel in place.
- **Weekly Review streak:** increments by 1 only when "Seal Week" is pressed; the Overview card border/icon/CTA all derive from a single `reviewSealed` boolean plus the streak number.
- **Reading ↔ Habit link:** "Log 10 min reading" bumps reading progress **and** marks today's "Read 10 mins" habit as done (visible immediately on the Overview and Habits & Goals pages) — demonstrating the general "auto-linked" pattern requested for cross-metric goals.
- **Sauna Weekly Goal ↔ Yearly Goal link:** ticking a day on the Sauna weekly goal increments the yearly "Sauna 200x" numeric goal by 1 (and decrements if un-ticked) — same auto-link pattern, a second concrete example.
- **Cross-app metric linking (forward-looking, not built):** the user asked whether goals could link to *other app sections* — e.g. a Training-section gym check-in auto-ticking the Weekly Gym goal, a Health-section bodyweight log feeding a bodyweight goal, Finance net worth feeding the Freedom Figure long-term goal. The two links above (Reading→Habit, Sauna Weekly→Yearly) are the proof-of-concept for this pattern. In the real build, generalize it: each "auto-linked" goal stores a `linkedSource` (e.g. `training.gym_checkin`, `finance.net_worth`, `health.bodyweight`) and a small number of app-wide event hooks (on gym check-in, on bodyweight log, on net-worth update) look up any goals subscribed to that source and increment/set them. This is a backend/data-layer concern more than a UI one — the UI only needs the "Auto-updating via {source}" indicator and to hide manual-update controls when a goal is auto-linked.

## State Management (from the prototype — translate into real app state / Supabase)
- `page`: which of the 4 sub-pages is active.
- **Habits**: `{ id, name, streak, completions }` where `completions` is a map keyed `"{weekOffset}_{dayIndex}"` → boolean. In the real app, replace `weekOffset` with actual calendar week identifiers (e.g. ISO week start date) so history is permanent, not relative to a session.
- **Weekly Goals**: `{ id, name, target, days[7] }`, resets every week (persist last week's tally into history for the "Weekly Goals hit vs total" stat, then zero the `days` array on week rollover).
- **Yearly Goals — numeric**: `{ id, name, current, target, unit, autoLinked, linkedSource }`. Badge (ON TRACK/BEHIND/WAY BEHIND) = compare `current/target` progress fraction against the elapsed-fraction-of-year; thresholds used in the prototype: ≥ -3% of pace = on track, ≥ -15% = behind, else way behind.
- **Yearly Goals — boolean**: `{ id, name, done, targetDate }`.
- **Long-term Goals**: `{ id, type: 'boolean'|'numeric', name, status: 'not_started'|'in_progress'|'done', timeframe, note, current?, target?, unit?, journal: [{date, text}] }`.
- **Tasks**: `{ id, name, dueOffset, time, done, recurring, priority }` where `dueOffset` is signed days-from-today (negative = overdue, 0 = today, positive = upcoming). In the real app, use an actual due-date field and derive overdue/today/upcoming from a comparison against `now`.
- **Reading**: `{ book, author, chapter, totalChapters, booksThisYear, booksTarget, minutesThisWeek }`, plus a `readingQueue` array and `finishedBooks` array and the 26-week heatmap data (real implementation should derive the heatmap from actual daily reading-log timestamps, not a generated pattern).
- **Weekly Review**: one record per ISO week (`week_start_date` as key) with the 6 fields + `sealed: boolean` + `sealed_at`. Streak = count of consecutive weeks (walking backward from the most recent) with `sealed = true` and no gap.

## Design Tokens
| Token | Value |
|---|---|
| Background | `#0c0f1e` |
| Card surface | `#131726` |
| Inset/nested surface | `#0f1220` |
| Border (default) | `rgba(255,255,255,0.07)` |
| Border (subtle divider) | `rgba(255,255,255,0.05)` |
| Primary text | `#e2e5ef` |
| Secondary text | `#d4d8e8` |
| Muted text | `#5a6882` |
| Faint text | `#3a4255` / `#4e5e79` |
| Emerald (primary accent) | `#10b981` |
| Emerald bg tint | `rgba(16,185,129,0.06–0.15)` per use |
| Red (negative/overdue) | `#ef4444` |
| Amber (warning/behind) | `#f59e0b` |
| Font | Inter, 400/500/600/700 |
| Eyebrow label | 9-10px, 600, uppercase, 0.08em tracking, emerald |
| Card radius | 8px |
| Pill/badge radius | 3-4px |
| Button radius | 5-6px |
| Section gap (Habits & Goals) | 20px |
| Card internal padding | 14-18px |

## Assets
No custom icons/images — all iconography is inline SVG (checkmarks, chevrons) drawn directly in the markup; book covers are gradient placeholder blocks (real book cover images/uploads should replace these). No external asset dependencies.

## Screenshots
`screenshots/` contains reference captures from the interactive prototype (desktop):
- `01-overview.png`
- `02-habits-goals.png`
- `03-tasks.png`
- `04-reading.png`
- `05-weekly-review-modal.png`

For mobile layouts, open `Productivity Redesign (static mockups).dc.html` directly — it's a pannable canvas with desktop and mobile variants side by side for Overview, Habits & Goals, and Tasks (ids `1a/1b`, `2a/2b`, `3a/3b`).

## Files
- `Productivity App (interactive prototype).dc.html` — primary behavioral reference (open directly in any browser).
- `Productivity Redesign (static mockups).dc.html` — desktop + mobile static layout reference for all 5 screens.
- `screenshots/` — static PNG captures of the interactive prototype, listed above.
