Schema decisions and all Session 2 component decisions are documented in BRIEF.md. Read it before starting. Purple has been left in Tasks/Reading intentionally — remove it as part of this session. Weekly goals currently double-track via legacy weekly_goal_logs and new weekly_goal_completions — migrate Tasks page fully onto weekly_goal_completions and retire weekly_goal_logs. reading_activity table does not exist — only reading_settings. Design handoff files are in design-handoffs/productivity/design_handoff_productivity_section/

# Productivity Redesign — Session 3 of 3: Tasks + Reading + Weekly Review

## Before starting
1. Read BRIEF.md in full — the schema from Session 1 and all decisions from Session 2 are documented there. Use exact table and column names as documented
2. Open and read `design-handoffs/productivity/design_handoff_productivity_section/README.md` in full
3. Open `design-handoffs/productivity/design_handoff_productivity_section/Productivity App (interactive prototype).dc.html` in a browser and click through the Tasks page, Reading page, and Weekly Review modal before writing any code
4. Open `design-handoffs/productivity/design_handoff_productivity_section/Productivity Redesign (static mockups).dc.html` for the mobile layout reference for Tasks

The interactive prototype is the source of truth for behaviour. The static mockups are the source of truth for mobile layout.

---

## Tasks page redesign

The existing task manager has working tasks, recurring tasks, and a calendar. All of this functionality must be preserved — this is a layout restructure and feature addition, not a replacement.

### Layout change
Move from side-by-side calendar + task list to a full-width vertical stack:
- Calendar full-width on top
- Task list full-width below

This was changed from the original brief after design QA found the side-by-side felt cramped once the calendar became interactive. Match the prototype's stacked layout.

### Calendar
- Keep all existing calendar functionality intact
- Add working week navigation (‹ ›) using real date math — verify it correctly rolls over month boundaries. Check specifically for off-by-one bugs when navigating backward from the first week of a month (e.g. a bug was flagged during design QA where backward navigation showed "-1 Jul" instead of rolling into the previous month's last week)
- Calendar stays full-width

### Task list restructure
Add an **Overdue** section above the existing Today/Upcoming/Completed sections:
- Overdue: tasks with due date before today that are not done. Shown with red border/accent. Each overdue task has edit and delete controls
- Today, Upcoming, Completed: existing sections unchanged in functionality
- Recurring tasks: keep all existing recurring functionality intact

### What is removed from Tasks page
- Weekly goals section (moved to Habits & Goals in Session 2)
- Weekly review trigger (moved to Productivity Overview in Session 2)

The Tasks page is pure task and calendar management. Nothing else.

### Wiring up the Overview stubs
Once Tasks is built, wire the Overview page's "Today's Tasks" stub (built in Session 2) to show real today's task data and the correct overdue count.

---

## Reading page

Move the existing Reading tracker into its own Productivity sub-page. This is primarily a relocation — the Reading tracker is already well-built and does not need a significant redesign.

### What moves
Everything from the existing Reading implementation:
- Current book with progress tracking
- Reading queue (future books)
- Genre breakdown
- 26-week GitHub-style activity heatmap
- Book completion history

### What changes
1. **Remove purple entirely** — the existing Reading tracker uses purple as its accent colour. Replace every instance of purple with emerald, matching the rest of the app. This is a specific user request — do not leave any purple in the Reading implementation
2. **Add "Log 10 min reading" action** — a button that logs a reading session (10 minutes, today's date) and marks today's "Read 10 mins" habit as done if that habit exists in the habits table. Include an Undo button (visible for ~5 seconds after logging) in case of accidental taps. This is the concrete example of the cross-metric linking pattern — Reading → Habit. Implement it directly (not via the general linked_source mechanism, which is a future build) since it's a single known link
3. **Reading queue** — ensure edit and remove controls exist on queued books

### Wiring up the Overview stubs
Once Reading is built, wire the Overview page's Reading stub (built in Session 2) to show the real current book and books-this-year count.

---

## Weekly Review modal

The modal is triggered from the Overview page's Weekly Review card (button wired in Session 2 but modal not yet built). Build the full modal now.

### Modal content — six fields in this exact order
1. What went well this week? (textarea)
2. One challenge I overcame (textarea)
3. One thing I can improve next week (textarea)
4. One thing I am proud of (textarea)
5. Consistency score 1–10 (number input, integer only, 1–10 validation)
6. Anything else? (textarea, no prompt label — just an open space)

### Week selector
At the top of the modal, a week selector showing the current ISO week by default (e.g. "Week of 7 Jul 2026"). A ‹ › navigator allows selecting any past week for retrospective entry. The selected week determines which weekly_reviews row is read/written.

### Seal Week
A "Seal Week" button that:
- Validates all fields are filled (consistency score is required; text fields can be empty but warn if all are blank)
- Sets sealed = true and sealed_at = now() on the weekly_reviews row for the selected week
- Locks the entry — sealed entries are read-only, no further editing
- Triggers a streak recalculation on the Overview card
- Only available when viewing the current week or a past week that hasn't been sealed yet

### History view
Accessible from the Overview weekly review card ("View past reviews" link). Shows a list of past sealed weekly reviews in reverse chronological order — week label, consistency score, first line of "what went well." Clicking a row opens the review in read-only mode in the same modal (with the week navigator set to that week). Unsealed past weeks show as "Not completed" in the history list with a button to open and fill them in.

### Storage
Read/write to weekly_reviews table (created in Session 1). Use week_start (ISO Monday date — the table's actual unique key; do NOT use week_start_date, which is the weekly_goal_completions column) as the unique key per review. On opening the modal for a given week, check if a row exists — if yes load it, if no create an empty draft row. Save on every field blur (autosave draft), seal only on explicit "Seal Week" action.

### Visual states (same as Overview card)
- Draft/in progress: amber header accent
- Sealed: emerald header accent, read-only fields, "Sealed {date}" label replacing the Seal Week button

---

## Design system
- Remove purple from Reading — replace with emerald throughout
- Match existing app design tokens exactly
- Map design handoff tokens to existing Tailwind classes
- Use existing modal component for the Weekly Review modal — do not hand-roll a new modal pattern

## Cross-metric linking
The only cross-metric link to implement in this session is: "Log 10 min reading" → marks "Read 10 mins" habit as done. Implement this directly. Do not implement any other cross-metric links. The linked_source field on yearly_goals and long_term_goals remains unused in this build.

## Testing before calling this done
- Add a task, confirm it appears in correct section (Today/Upcoming/Overdue)
- Navigate calendar backward across a month boundary — confirm no date bugs
- Confirm recurring tasks still work exactly as before
- Confirm weekly goals and weekly review trigger are gone from the Tasks page
- Move to Reading page — confirm purple is fully gone, replaced with emerald
- Tap "Log 10 min reading" — confirm reading progress updates and "Read 10 mins" habit (if it exists) is marked done for today
- Open Weekly Review modal, fill in all six fields for current week, seal it — confirm Overview card flips to sealed state and streak increments
- Open modal for a past week, fill it in retrospectively, seal it — confirm it saves correctly
- Open history view — confirm past sealed reviews appear in correct order

## After this session
Update BRIEF.md to reflect: Full Productivity section redesign complete. Note the Reading→Habit cross-metric link implementation so the future general linking build knows what pattern was used. Note that Tasks, Reading, and Weekly Review are complete, and the Overview stubs are now wired to real data.
