# Build Prompt — Productivity Section Redesign

Paste this into Claude Code in the-motherboard-pi repo.

---

I need you to implement a redesign of the **Productivity** section of this app. Full design context, visual spec, screen-by-screen breakdown, interaction details, and a suggested data model are in `README.md` in this folder — read it in full before starting. Two HTML files are also included as design references (open them in a browser to see them run): `Productivity App (interactive prototype).dc.html` is the primary behavioral reference — click through every page and interaction in it before writing code, it shows exactly how each piece should behave. `Productivity Redesign (static mockups).dc.html` shows the desktop + mobile static layouts.

**Important — these HTML files are design references only, not code to port.** They're built with inline styles and a bespoke templating system for fast prototyping. Recreate the design using this repo's actual stack, existing components, existing design tokens/theme, and existing data layer (Supabase) conventions. If this repo already has shared components for cards, buttons, badges, progress bars, modals, etc., use them — don't hand-roll new ones that duplicate existing patterns. Match the existing app's dark theme, card styling, and color usage exactly (emerald primary accent, red for negative/overdue, amber for warnings) — no new colors, fonts, or visual treatments beyond what's already established in the codebase, other than the new UI patterns this feature needs (habit day-grids, goal journals, the reading heatmap).

## Scope
Restructure the current single Productivity page into four sub-pages under the existing Productivity nav item: **Overview, Habits & Goals, Tasks, Reading**. Add a **Weekly Review modal** reachable from the Overview page. Full detail on every screen's layout and content is in the README's "Screens / Views" section — implement each screen as described there.

## Explicit requirements pulled from user feedback (don't miss these)
1. **Remove purple entirely** from the Reading tracker (and anywhere else it appears) — replace with the app's existing emerald accent. This was a specific complaint about the current implementation.
2. **Habits vs. Weekly Goals are different things** — don't conflate them. Habits (e.g. "Running", "Read 10 mins") track daily streaks with a backfillable 7-day grid and a week-navigator to go back and fill in past weeks. Weekly Goals (e.g. "Gym 3x/week", "Sauna Ice Bath", "Muay Thai", "Facetime Mum") are frequency targets for the *current* week only, with their own 7-day tap grid that contributes toward a current/target count.
3. **Freedom Figure (net worth target) belongs in Long-term Goals, not Yearly Goals** — and should NOT get "behind pace" language/badges. Long-term goals are aspirational/someday and shouldn't carry deadline pressure styling.
4. **Long-term goals need a journal** — clicking a goal expands a dated free-text journal (add an entry, it timestamps and stacks above older entries) plus an explicit **Phase selector** (Not Started / In Progress / Done as three clickable pills, not an ambiguous single-tap-to-cycle control).
5. **Editing:** habits, weekly goals, yearly goals, and tasks all need an inline edit affordance (not just add-only).
6. **Goal type choice on creation:** when adding a weekly or yearly goal, ask whether it's quantifiable by number (with a target) or just a completion/milestone — don't force everything into a numeric shape.
7. **Tasks page:** calendar + task list should NOT be a cramped 50/50 side-by-side split — stack the calendar full-width on top and the task list full-width below. Add an **Overdue** section (with edit + delete) above Today/Upcoming/Completed. Calendar needs working **week navigation (‹ ›)** using real date math — verify it correctly rolls over month boundaries (a bug during design QA had it showing "-1 Jul" instead of rolling into June; check for that class of bug in your own date logic too).
8. **Reading:** needs the future reading queue (with edit/remove), the 26-week activity heatmap, and a **"Log 10 min reading"** action (plus an undo, in case of accidental taps) that also ticks off a "Read 10 mins" daily habit — this is the concrete example of the cross-metric linking pattern described below.
9. **Weekly Review modal:** all 6 fields in the exact order specified in the README, a Seal Week action that locks the entry and increments a streak, and — not yet in the interactive prototype, needs to be built from spec — a week selector for retrospective entries and a history view of past sealed reviews.

## Cross-metric goal linking (design intent, needs your judgment on implementation)
The user wants goals to be able to auto-update from activity elsewhere in the app — e.g. completing a gym session in the Training section should tick the weekly Gym goal; logging bodyweight in Health should feed a bodyweight goal; net worth in Finance should feed the Freedom Figure long-term goal. The design demonstrates this pattern narrowly (Reading log → "Read 10 mins" habit; Sauna weekly goal check-in → yearly "Sauna 200x" goal) but does not implement the general case, since Training/Health/Finance aren't in scope for this feature. Propose and implement a reasonably general mechanism — e.g. a `linked_source` field on a goal plus a small set of app-wide hooks/events other features can call into — rather than one-off wiring per goal. Use your judgment on how deep to take this given the existing app architecture; flag any assumptions you make.

## Data model
The README's "State Management" section has a proposed shape for every entity (habits, weekly goals, yearly goals, long-term goals, tasks, reading, weekly review). Adapt it to match this repo's existing Supabase schema conventions rather than introducing a new pattern — check for existing tables/patterns for user-scoped data first.

## Suggested build order
1. Data model / Supabase schema changes first (habits, weekly_goals, yearly_goals, long_term_goals + journal entries, tasks changes if needed, weekly_reviews).
2. Overview page (pulls summary data from everything else, so build it last if the other pages' data isn't ready yet — or stub it first with placeholder aggregates and wire it up last).
3. Habits & Goals page (habits, weekly goals, yearly goals, long-term goals + journal).
4. Tasks page (calendar + list restructure, overdue section).
5. Reading page (move existing tracker, remove purple, add queue + heatmap + log-minutes).
6. Weekly Review modal + history view.

Ask me questions if anything in the README is ambiguous before you start — don't guess on data model decisions that would be expensive to redo.
