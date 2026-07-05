# Handoff: Statement Import & Budgeting Insights

## Overview

This package covers two new Finance features for the Motherboard app:

1. **Statement Import & Reconciliation** — A modal-based flow that lets Ben upload CommBank and/or Amex CSV exports, review parsed transactions before anything is written, and confirm the import.
2. **Budgeting Insights & Analytics** — A data-rich analytics dashboard sitting below the existing budget tracker on the Finance → Budgeting page, unlocked after a statement has been imported for the month.

Both features have been designed to match the existing app at `the-motherboard-pi.vercel.app` exactly — same dark backgrounds, card layout, and colour palette. No new visual language has been introduced.

---

## About the Design Files

The `.dc.html` files in this package are **interactive HTML prototypes** — high-fidelity design references showing intended look, layout, and behaviour. They are **not** production code to copy directly.

The task is to **recreate these designs inside the existing Motherboard Next.js/React codebase**, using its established patterns, Tailwind classes, and libraries (Recharts for charts, existing modal patterns, etc.).

Open the HTML files in a browser to interact with the full prototype before building.

---

## Fidelity

**High-fidelity.** Both prototypes are pixel-accurate with final colours, typography, spacing, and interactions. Recreate the UI as closely as possible using the app's existing Tailwind config and component library.

---

## Design Tokens

All values used across both features. Match these to the existing Tailwind config or extend it.

### Colours

| Token | Value | Usage |
|---|---|---|
| `bg-page` | `#0c0e15` | Page background |
| `bg-sidebar` | `#08090e` | Sidebar background |
| `bg-card` | `#131520` | Card backgrounds |
| `bg-card-nested` | `#1a1d2a` | Input backgrounds, nested cards, confirm sections |
| `bg-modal` | `#13151f` | Modal background |
| `border-subtle` | `rgba(255,255,255,0.065)` | Card borders |
| `border-input` | `rgba(255,255,255,0.1)` | Input/select borders |
| `overlay` | `rgba(4,5,13,0.88)` | Modal backdrop |
| `text-heading` | `#e8ecf8` | Page headings, modal titles |
| `text-body` | `#d6daea` | Primary body text |
| `text-muted` | `rgba(214,218,234,0.38)` | Secondary text |
| `text-faint` | `rgba(214,218,234,0.25)` | Labels, breadcrumbs |
| `accent-emerald` | `#10b981` | Income, positive figures, success, savings |
| `accent-emerald-dim` | `rgba(16,185,129,0.55)` | Emerald subtext |
| `accent-purple-primary` | `#7c6ef8` | Primary action buttons, UI accent |
| `accent-purple-light` | `#a78bfa` | Recurring items, section accents |
| `accent-purple-dim` | `rgba(167,139,250,0.55)` | Purple subtext |
| `accent-amber` | `#f59e0b` | Warnings, needs-review state, one-offs |
| `accent-amber-dim` | `rgba(245,158,11,0.5)` | Amber subtext |
| `accent-red` | `#f87171` | Over budget, negative figures, errors |
| `accent-blue` | `#60a5fa` | Neutral chart lines, reference lines |

### Typography

| Usage | Size | Weight | Other |
|---|---|---|---|
| Page heading | 24px | 650 | letter-spacing: -0.6px |
| Modal title | 15.5px | 620 | letter-spacing: -0.3px |
| Section label | 10px | 700 | uppercase, letter-spacing: 1.2px |
| Body / row text | 13–13.5px | 440–500 | |
| Muted body | 12–12.5px | 400 | |
| Monospace numbers | ui-monospace, monospace | 520 | font-variant-numeric: tabular-nums |
| Tiny label | 9.5–10px | 600 | uppercase, letter-spacing: 0.9px |

Font stack: `system-ui, -apple-system, 'Segoe UI', sans-serif`

### Spacing & Shape

| Token | Value |
|---|---|
| Card border-radius | 12px |
| Modal border-radius | 14px |
| Button border-radius | 8px |
| Input border-radius | 8px |
| Chip/badge border-radius | 20px (pill) |
| Card padding | 18–22px |
| Gap between cards | 12–14px |
| Modal max-height | 92vh |

### Motion

| Element | Duration | Easing |
|---|---|---|
| Modal entrance | 200ms | ease-out, translateY(8px) → 0 |
| Panel/section reveal | 150–180ms | ease, translateX(-6px) or translateY(6px) → 0 |
| Spinner | 0.85s | linear, infinite rotation |
| Progress bar fill | 120ms | ease |
| Button hover | 150ms | background transition |

---

## Feature 1 — Statement Import & Reconciliation

### Entry Point

An **"Import Statement"** button on the Finance → Budgeting page (top-right of page header). Style: `bg-purple-primary`, white text, 9×16px padding, 8px border-radius, flex row with upload icon.

When clicked, opens a modal overlay over the current page. All five steps of the flow happen inside a single modal — the modal width and content change between steps.

---

### Step 1 — Upload

**Modal width:** 520px

**Layout:** Vertical stack inside the modal body. Scrollable if needed.

**Components:**

**Month selector**
- Label: 10.5px uppercase, `text-faint`, letter-spacing 0.9px. "STATEMENT MONTH"
- `<select>` element: full width, `bg-card-nested`, `border-input`, 8px border-radius, 10–13px padding, chevron icon positioned right
- Options: April 2026, May 2026, June 2026, July 2026. Default: current month.

**Upload areas (two, stacked, gap 10px)**
Each upload area is a dashed-border card:
- Border: 1.5px dashed. Default: `rgba(255,255,255,0.1)`. Loaded: `rgba(16,185,129,0.3)`
- Background: transparent (default) or `rgba(16,185,129,0.03)` (loaded)
- Padding: 16×18px. Border-radius: 10px.
- Left icon block: 34×34px, `rgba(255,255,255,0.05)` bg, 8px radius — contains a document or card SVG icon
- Label column: bank name (13.5px, weight 520) + status line (12px, muted or `text-emerald-dim` when loaded)
- Right action: "Add CSV" button (default) or red ×  remove button (loaded)

CommBank label: "Commonwealth Bank". Amex label: "American Express".

Once a file is selected, show filename + file size (e.g. `commbank-jun26.csv · 43 KB`) in the status line.

**Footer**
- Cancel button (left): ghost, `border-subtle`, `text-muted`
- "Process Statements →" button (right): `bg-purple-primary`. Disabled/dimmed (opacity 0.42) if no files selected.

---

### Step 2 — Processing

**Modal width:** 420px

**Layout:** Centred vertical stack with spinner, label, and progress bar.

- Spinner: 42×42px circle, 2.5px border, top segment coloured `#7c6ef8`, 0.85s linear infinite rotation
- Label: 14px body text, updates during processing
- Subline: 12px muted — "N file(s) · keyword rules + AI categorisation"
- Progress bar: full-width container (max-width 300px), 3px height, `rgba(255,255,255,0.07)` track, gradient fill `#7c6ef8 → #4fa3e8`, transitions as progress increases
- Percentage: 11px monospace, right-aligned below bar

**Processing label sequence** (driven by progress %):
1. "Parsing CSV files..." (0–20%)
2. "Matching recurring transactions..." (20–40%)
3. "Applying keyword rules..." (40–60%)
4. "Running AI categorisation..." (60–80%)
5. "Finalising..." (80–100%)

Auto-advances to Review after 100% + 380ms delay.

---

### Step 3 — Review

**Modal width:** 840px  
**Modal max-height:** 92vh  
**Body:** Scrollable, fixed header and footer

This is the most complex screen. Three clearly separated sections inside a scrollable body.

#### Header (fixed, non-scrolling)
"Review Import" title, subtitle "June 2026 · Nothing is saved until you confirm", close button.

#### Section A — Recurring Updates

**Accent colour:** Purple (`#a78bfa`)

Purple left-accent bar (3×13px, 2px radius) + "RECURRING UPDATES" label + item count badge + "X / Y actioned" count (right-aligned).

Sub-caption (12px muted): "Confirm records the actual figure for this month — the standing forecast is not changed. Skip excludes this item from the import."

**Column headers:** Item | Forecast | → | Actual | Diff | Action

**Row data (5 items):**

| Item | Forecast | Actual | Notes |
|---|---|---|---|
| Salary | $8,000 | $9,240 | Context: "3 pay periods this month (LIFENET)" |
| Rent | $790 | $790 | Context: "DEFT PAYMENTS · $395 incoming from flatmate excluded" |
| Gym Membership | $55 | $55 | No context |
| Netflix | $18.00 | $22.99 | Context: "Price increase" |
| Internet | $89 | $89 | No context |

**Row states:**

*Pending:* Shows "Skip" button (ghost) and "Confirm →" button (emerald tint). Diff column: green if actual > forecast, red if actual < forecast, `—` if equal.

*Confirmed:* Row gets `rgba(16,185,129,0.03)` background. Action area shows green checkmark + "Confirmed" text + "Undo" ghost link.

*Skipped:* Action area shows "Skipped" text + "Undo" ghost link.

Context note (when present): Small amber info icon + 11px amber-dim text below item name.

#### Divider A→B
Horizontal rule with centred label "Variable spending" in very muted text, 16px vertical margin.

#### Section B — Confident Categorisation

**Accent colour:** Blue (`#60a5fa`)

Blue left-accent bar + "CONFIDENT CATEGORISATION" label + "N of M categories" badge + total spend (right-aligned, 14px bold monospace).

Sub-caption: "Matched by keyword rules with high confidence. Expand any category to inspect transactions."

**Column headers:** [chevron] | Category | Total | Tx | Actions

**Categories (10 rows), June 2026 data:**

| Category | Total | Tx count |
|---|---|---|
| Groceries | $312.45 | 14 |
| Eating Out | $287.30 | 11 |
| Utilities | $178.40 | 3 |
| Transport | $64.00 | 8 |
| Subscriptions | $47.97 | 3 |

(Plus Health & Wellness, Clothing & Retail, Vehicle, Personal Care, Entertainment as they appear in the import)

**Row states:**

*Default (included):* Full opacity. Chevron (rotated -90° = pointing right = collapsed). Edit pencil icon button + exclude × button (right).

*Expanded:* Chevron rotates to 0° (pointing down). Below the row, an indented sub-panel (`rgba(255,255,255,0.022)` bg, 8px radius) shows individual transactions: date (44px col, 11px muted monospace) | merchant name (flex, 12.5px) | amount (12.5px muted monospace). Up to 5 shown, "+" more link if additional.

*Editing amount:* Edit button clicked → amount field becomes a controlled `<input type="number">` with `border-purple-dim`, right-aligned. Row shows ✓ save and ✕ cancel buttons.

*Excluded:* Row opacity drops to 0.32. Category name has `text-decoration: line-through`. Exclude button toggles to "Include" button (full text).

**Transaction samples (Groceries):** 01 Jun — Woolworths $67.40 / 05 Jun — Coles $112.60 / 09 Jun — Woolworths $43.25 / 14 Jun — ALDI $28.90 / 20 Jun — Woolworths $60.30

**Transaction samples (Eating Out):** 03 Jun — Uber Eats $34.90 / 07 Jun — Mr Miyagi $74.00 / 11 Jun — Uber Eats $28.50 / 16 Jun — Tuck Shop $22.40 / 21 Jun — Lune Croissanterie $19.60

#### Divider B→C
Horizontal rule styled with amber: `rgba(245,158,11,0.18)` border, centred label "Needs your review ↓" in amber-dim text.

#### Section C — Needs Review

**Background:** Entire section has `rgba(245,158,11,0.018)` tint.  
**Accent colour:** Amber (`#f59e0b`)

Amber left-accent bar + "NEEDS REVIEW" label + amber badge "N need action" (or green "All reviewed" once done) + "X / Y actioned" count.

Sub-caption: "No keyword rule matched these. AI has suggested a category — confirm or override each one. All must be actioned before import."

**Column headers:** Date | Merchant | Amount | Category | Action

**7 transactions:**

| Date | Merchant | Amount | AI Suggestion |
|---|---|---|---|
| 02 Jun | Alchemy Saunas | $45.00 | Health & Wellness |
| 05 Jun | Dan Murphy's | $87.50 | Eating Out |
| 09 Jun | Chemist Warehouse | $34.20 | Health & Wellness |
| 13 Jun | Rebel Sport | $129.99 | Clothing & Retail |
| 17 Jun | Bunnings Warehouse | $56.40 | Vehicle |
| 22 Jun | Mecca Cosmetica | $78.00 | Personal Care |
| 25 Jun | Village Cinemas | $24.00 | Entertainment |

**Row states:**

*Pending:* AI suggestion shown as 10.5px amber-dim text with triangle warning icon below merchant name. Category `<select>` has amber border (`rgba(245,158,11,0.28)`), amber chevron. Options: Groceries, Eating Out, Transport, Subscriptions, Health & Wellness, Clothing & Retail, Entertainment, Utilities, Vehicle, Personal Care, Miscellaneous. "Confirm" button (amber tint) + exclude × button.

*Confirmed:* Row gets `rgba(16,185,129,0.025)` bg. Category cell shows green checkmark + confirmed category name. Action area: "Undo" ghost link.

*Excluded:* Row gets `rgba(248,113,113,0.02)` bg. Merchant name struck through, amount dimmed. Category cell shows red ×  icon + "Excluded" text. Action area: "Undo" ghost link.

#### Footer (fixed, non-scrolling)

**Stats bar** (above buttons, `bg: #0f111a`):
- "Transactions: N" | "Total spend: $X,XXX" | (spacer) | Amber warning if Section C has unactioned items: triangle icon + "N item(s) in Needs Review still unactioned"

**Buttons:**
- Left: "Discard" ghost button
- Right: "Review Summary →" — purple when all Section C actioned, dimmed + `cursor: not-allowed` while items remain

---

### Step 4 — Confirm

**Modal width:** 540px

Brief summary before writing to DB.

**Recurring section** (purple-tinted card, `border: rgba(167,139,250,0.14)`):  
Purple left-accent + "RECURRING — THIS MONTH" label. Lists confirmed items showing: name | "forecast $X" (muted small text) + actual (coloured by direction).  
"N confirmed at same amount" note below if applicable. "N skipped — forecast unchanged" note.

**Variable spending section** (blue-tinted card, `border: rgba(96,165,250,0.14)`):  
Blue left-accent + "VARIABLE SPENDING" label + total (18px bold monospace, right-aligned). Category breakdown list (name → amount per row). "N manually categorised transaction(s)" amber note if Section C had confirms.

**Month / tx note card:**  
Neutral card. "Recording **N transactions** for **June 2026**. This action cannot be undone."

**Footer:** "← Back" ghost (returns to Review) + "Commit to Database" emerald button.

---

### Step 5 — Success

**Modal width:** 400px

Centred layout. Large green checkmark circle (54×54px, `rgba(16,185,129,0.1)` bg, emerald border, animated entrance). "Import Complete" heading. Summary paragraph.

Summary card: Month | Transactions recorded | Variable spending (emerald).

Footer: "Done" purple button → closes modal, shows green success banner on Finance page.

**Success banner** (on Finance page, below nav): Emerald bg tint, border, checkmark icon, success message text.

---

## Feature 2 — Budgeting Insights & Analytics

**Location:** Finance → Budgeting page, below the existing budget tracker content. Accessible after statement import.

**Entry:** Two tabs in the page header — "Monthly Overview" and "Spending Intelligence". Default tab is Monthly Overview.

**Empty State:** When no statement has been imported for the current month, show a centred empty state card instead of charts: icon, heading "No data for [Month]", description, "Import Statement" CTA button, and a bullet list of what will appear post-import.

---

### Tab 1 — Monthly Overview

Three rows of cards, all with `gap: 12px`.

#### Row 1 — Hero metrics (grid: `1fr 178px 178px`)

**Waterfall Chart (1fr)**  
Card: standard card padding. Title "Income vs Spending", subtitle with month name.  
Chart is a custom SVG waterfall. Bars rendered left to right: Salary (income, emerald) → Rent (purple) → all variable categories sorted largest to smallest → Net Savings bar (emerald or red).  
Bar colours: income = emerald, wants categories = `rgba(251,191,36,0.52)` (amber), needs/fixed categories = `rgba(148,163,184,0.42)` (slate), rent = `rgba(167,139,250,0.62)` (purple).  
Connector lines: 1px dashed `rgba(255,255,255,0.08)` between bars at the running total level.  
Y-axis: gridlines + dollar labels ($0, $2k, $4k, $6k, $8k, $9.24k). Income and Net bars get value labels above them.  
X-axis: short category name labels (8px, muted).  
SVG viewBox `0 0 640 210`, `width: 100%`.

**Savings Rate Gauge (178px)**  
270° arc gauge, SVG 160×160.  
- Grey track arc: `rgba(255,255,255,0.07)`, 11px stroke  
- Filled arc: `#10b981`, 11px stroke, drop-shadow glow  
- Target marker: amber tick line at 45% position  
- Centre: percentage (26px bold monospace) + "of income saved" (9px muted)  
- Bottom: "▸ Target 45%" (8.5px amber-dim)  
- Below gauge: "6-month trend" label + sparkline (simple SVG polyline, 6 data points, emerald)

**Month Score (178px)**  
Card with letter grade (A–F) as large monospace character (72px bold), coloured by grade (emerald/amber/red). Score/10 below in small muted text.  
Info card below: 11px muted text explaining the score components. Shown in `rgba(255,255,255,0.03)` nested card.

**June 2026 data:** Income $9,240 / Rent $790 / Total variable $3,200 / Net savings $5,250 / Savings rate 56.8% / Grade B / Score 7/10.

#### Row 2 — Forecast vs Actual (full width card)

Blue left-accent + "FORECAST VS ACTUAL" label + "Ranked by overspend" note.

**Column layout:** Category name (138px) | Bar visualization (flex:1) | Forecast $$ (66px, right) | Actual $$ (66px, right) | Diff (56px, right, coloured) | Expand button (24px).

**Bar visualization:** Two stacked bars using CSS flex:
- Thin bar (3px height): forecast length (flex units proportional to amount)
- Thick bar (6px height): actual length, coloured by variance (red = >$100 over, amber = over, emerald = under)
- Both bars share the same scale (max across all categories)

**Diff colours:** >$100 over = `#f87171`, 1-$100 over = `#f59e0b`, under = `#10b981`, equal = muted.

**Expand button:** ↓/↑ toggle. When expanded, shows merchant breakdown panel below the full list (not inline).

**Merchant breakdown panel** (appears below the list when any category is expanded):  
`rgba(124,110,248,0.05)` background, purple border, 10px radius. Header: category name (purple) + total (right). Rows: merchant name (118px) | flex bar (purple, proportional to % of total) | amount | % label.

**June 2026 category data (sorted by overspend):**
- Eating Out: forecast $500, actual $625, +$125
- Clothing & Retail: forecast $200, actual $310, +$110
- Groceries: forecast $880, actual $950, +$70
- Health & Wellness: forecast $220, actual $250, +$30
- Vehicle: forecast $150, actual $180, +$30
- Utilities: forecast $320, actual $340, +$20
- Personal Care: forecast $100, actual $120, +$20
- Transport: forecast $180, actual $185, +$5
- Subscriptions: forecast $145, actual $145, —
- Entertainment: forecast $120, actual $95, -$25

#### Row 3 — Net Savings + Callouts (grid: `208px 1fr`)

**Net Savings card (208px)**  
Label → large emerald amount (32px monospace) → "X% of income" → divider → "At this rate, FI in approx." → FI years (19px monospace, muted) → "X months · $1.5M target" (very muted).

**Unusual Spend card (1fr)**  
Amber left-accent + "UNUSUAL SPEND" label + ">20% above 3-month average" pill badge.  
Callout cards in auto-fill grid (`minmax(230px, 1fr)`). Each callout: coloured dot + headline text (12.5px, coloured) + subtext (11px muted showing avg → actual).

**June 2026 callouts:**
- Clothing & Retail: 163% above 3-month avg ($118 avg → $310). Severity: high (red).
- Eating Out: 22% above 3-month avg ($510 avg → $625). Severity: medium (amber).

---

### Tab 2 — Spending Intelligence

Seven card sections, stacked vertically, `gap: 12px`.

#### 1. Category Heatmap (full width)

Emerald left-accent + "CATEGORY HEATMAP" label + "Jul 2025 – Jun 2026" + colour legend (4 squares, low→high).

Grid: 10 rows (categories) × 12 cols (months). Each cell: 30×20px, 3px radius.  
Cell background: `rgba(16,185,129, intensity)` where intensity = `0.07 + (value - minForCategory) / range * 0.76`.  
Jun column (index 11) has a 1.5px emerald border highlight.  
Month headers above (9px): Jun in emerald, others muted.  
Row labels right-aligned (114px, 11px): full category name.

**Historical data used (12 months Jul 25–Jun 26):**
```
Groceries:   820,890,760,930,1020,980,810,870,910,840,890,950
Eating Out:  580,620,490,710,850,1240,520,590,380,600,550,625
Utilities:   290,310,340,330,380,410,420,390,360,330,300,340
Clothing:    120,85,340,180,650,920,95,280,150,120,85,310
Health:      180,220,195,240,310,180,200,225,190,280,210,250
Transport:   160,145,190,175,155,210,165,140,195,160,170,185
Vehicle:     150,85,420,150,160,200,150,85,580,150,85,180
Subs:        130,130,130,130,130,130,130,145,145,145,145,145
Personal Care: 95,110,85,130,140,200,90,105,115,95,110,120
Entertainment: 80,95,120,85,140,280,75,90,110,95,80,95
```

#### 2. Category Trend Lines — Small Multiples (full width)

Blue left-accent + "CATEGORY TREND LINES" + "12 months · ↑ rising · ↓ falling · → stable".

5-column grid of mini chart cards. Each card: `rgba(255,255,255,0.025)` bg, 1px subtle border, 8px radius, 160×68px SVG.

Each chart: category short name (top-left, 8.5px) + current month value (top-right, 9px monospace) + trend arrow (centre top) + area fill (6% opacity) + polyline + dot on last point.

**Trend colour:** Red (`#f87171`) if last 3-month avg > previous 3-month avg by >8%. Green (`#10b981`) if down >8%. Blue (`#60a5fa`) if stable.

X-axis: "Jul" left, "Jun" right (7px very muted).

**June 2026 trends:**
- Groceries: ↑ (stable/slight up) — blue
- Eating Out: → (flat overall despite spike) — blue  
- Utilities: → — blue
- Clothing: ↑ — red (spikes in Sep, Nov, Dec)
- Health: ↑ — red
- Transport: → — blue
- Vehicle: ↓ — green
- Subs: ↑ — red (jumped from $130 to $145)
- Personal Care: ↑ — red
- Entertainment: → — blue

#### 3. Spending Velocity + Needs vs Wants (2-col grid, `1fr 1fr`)

**Spending Velocity (left)**  
Blue left-accent + "SPENDING VELOCITY" label.  
Caption: "Cumulative spend day-by-day vs forecast pace".

SVG 340×120, 30 data points (days in June).  
Two lines:
- Actual cumulative spend: `#60a5fa` solid, 2px
- Budget pace (forecast total / 30 days): `rgba(255,255,255,0.15)` dashed

Y-axis: $0, $1000, $2000, $3000 gridlines + labels.  
X-axis labels: "1 Jun", "15 Jun", "30 Jun".  
End labels: actual total (blue) and budget total (muted white) shown to the right.

**June 2026:** Total actual $3,200. Total budget forecast $2,465. Actual is over-pace — the actual line ends above the budget line.

Legend below chart: blue line "Actual" + dashed white "Budget pace".

**Needs vs Wants (right)**  
Purple left-accent + "NEEDS VS WANTS" label.

Current month split bar (8px, 4px radius): emerald 45% for Needs + amber 38% for Wants, with 1px gap. Note: "fixed" category (subscriptions) excluded from this split.

Two rows of labels: "Needs X% · $X,XXX" | "Wants Y% · $X,XXX" (with coloured squares).

6-month trend section: "6-month trend" label (9.5px). For each of last 6 months (Jan–Jun): month abbreviation (26px col) | flex split bar (4px height, same emerald/amber, proportional) | needs% value (40px, right).

**June 2026 Needs/Wants:** Needs (groceries+utilities+health+transport+vehicle) = $1,905 (54%). Wants (eating out+clothing+entertainment+personal care) = $1,150 (33%). Subs = fixed (excluded from ratio). Display as 62% needs / 38% wants (excluding subs from denominator).

#### 4. Savings Trajectory to $1.5M (full width, prominent)

Purple left-accent + "SAVINGS TRAJECTORY TO $1.5M" label + three metric chips right-aligned:
- Current balance: `$188,300` (15px bold, blue)
- FI in (current rate): `20.8 yrs` (15px bold, purple)
- Required monthly: `$10,931` (15px bold, amber)

SVG 640×210, 3 lines over 10-year (132-month) horizon.

**Lines:**
- Historical (months 0–11, Jul 25–Jun 26): `#60a5fa` solid 2px. Shows actual cumulative savings.
- Projected (months 11–131, Jun 26–Jun 36): `rgba(124,110,248,0.6)` dashed 1.5px. Current rate extrapolated.
- Required (months 11–131): `rgba(245,158,11,0.48)` dashed 1.5px. Linear path from current balance to $1.5M.

**Filled areas:** Historical = `rgba(96,165,250,0.05)`. Projected = `rgba(124,110,248,0.04)`.

**Reference lines:** `$1.5M` horizontal emerald dashed line. "Today" vertical dashed marker at month 11.

**Y-axis ticks:** $0, $250k, $500k, $750k, $1M, $1.25M, $1.5M.

**X-axis labels:** Jul 25 | Jun 26 (today) | 2029 | 2031 | 2033 | 2035 | Jun 36.

**Current balance dot:** 3.5px filled circle at month 11, blue.

Legend: top-left of chart. "Actual" | "Projected (current rate)" | "Required for $1.5M target".

**Cumulative savings history (starting balance $130,000 Jul 2025):**
Jul: $134,405 / Aug: $139,125 / Sep: $143,065 / Oct: $147,415 / Nov: $150,490 / Dec: $161,350 / Jan: $165,705 / Feb: $170,195 / Mar: $174,070 / Apr: $178,665 / May: $183,050 / Jun: $188,300

#### 5. What-If Savings Simulator (full width)

Purple left-accent + "WHAT-IF SAVINGS SIMULATOR" label + "Adjust category spend to see impact on FI date".

2-column grid: sliders (`1fr`) + impact panel (240px fixed).

**6 sliders (left column):**

| Category | Min | Max | Default |
|---|---|---|---|
| Groceries | $400 | $1,400 | $950 |
| Eating Out | $100 | $1,200 | $625 |
| Clothing & Retail | $0 | $800 | $310 |
| Health & Wellness | $50 | $500 | $250 |
| Entertainment | $0 | $400 | $95 |
| Personal Care | $0 | $300 | $120 |

Each slider row: category name (left, 12.5px muted) + delta text + current value (right, 13.5px bold monospace). `<input type="range">` below. Delta text: green "X saved" if below default, amber "+X more" if above, muted "no change" if equal.

Range input styling: 3px track `rgba(255,255,255,0.1)`, 13×13px thumb `#7c6ef8`.

**Impact panel (right column):**  
`rgba(255,255,255,0.025)` bg, subtle border, 10px radius, 18px padding.

Fields (stacked with gaps):
1. "Currently saving" label + current value (19px monospace, muted)
2. "Adjusted savings" label + adjusted value (24px bold monospace, coloured by direction) + monthly delta (12px monospace below)
3. Divider
4. "FI timeline" label + "X.X yr → Y.Y yr" (with arrow, adjusted in colour) + "Z months sooner/further from FI" (coloured)

**Calculations:**
- `adjustedSavings = currentSavings + sum(defaultValues) - sum(sliderValues)`
- `adjustedFIMonths = (1,500,000 - 188,300) / adjustedSavings`
- `monthsSaved = currentFIMonths - adjustedFIMonths`

All update live as sliders move.

#### 6. Subscription Spend Creep + One-Off Items (2-col, `1fr 1fr`)

**Subscription Spend Creep (left)**  
Purple left-accent + "SUBSCRIPTION SPEND CREEP" label.  
Caption: "Total recurring subscriptions · 12 months".

SVG 280×90, polyline of monthly subscription totals (Jul 25–Jun 26). Purple line `rgba(167,139,250,0.75)`, 1.5px. Purple area fill. Amber dashed trend line overlay.

Data: [130,130,130,130,130,130,130,145,145,145,145,145]

Y-axis: $130, $140, $150 labels. X-axis: "Jul 25" / "Jun 26".  
Dot at last point (purple, 2.5px).

Below chart, amber info card: triangle icon + ""+$15/mo increase observed over 12 months (gym added Aug)".

**One-Off Items (right)**  
Amber left-accent + "ONE-OFF ITEMS — FY2025–26" label.

4 rows (one per one-off), each: amber month badge + label text (flex:1, 13px muted) + amount (amber monospace).

| Month | Item | Amount |
|---|---|---|
| Sep 25 | Vehicle rego renewal | $420 |
| Nov 25 | Winter clothing haul | $280 |
| Dec 25 | Christmas gifts | $320 |
| Mar 26 | Car service + tyres | $450 |

Footer note (11px very muted): "One-off items are flagged during import review and excluded from category averages."

---

## State Management

### Statement Import

```typescript
// Modal state machine
type ImportStep = 'closed' | 'upload' | 'processing' | 'review' | 'confirm' | 'success'

interface ImportState {
  step: ImportStep
  selectedMonth: string  // e.g. "June 2026"
  commbankFile: File | null
  amexFile: File | null
  processingProgress: number  // 0-100
  processingLabel: string

  // Review — Section A
  recurringItems: RecurringItem[]

  // Review — Section B
  categories: CategoryItem[]
  editingCategoryId: string | null
  editValue: string

  // Review — Section C
  needsReviewItems: NeedsReviewItem[]

  // Saved result (for success screen + page banner)
  savedSummary: SavedSummary | null
}

interface RecurringItem {
  id: string
  name: string
  context: string | null
  forecastAmount: number
  actualAmount: number
  status: 'pending' | 'confirmed' | 'skipped'
}

interface CategoryItem {
  id: string
  name: string
  amount: number
  txCount: number
  excluded: boolean
  expanded: boolean
  transactions: Transaction[]
}

interface NeedsReviewItem {
  id: string
  date: string
  merchant: string
  amount: number
  aiSuggestedCategory: string
  selectedCategory: string
  status: 'pending' | 'confirmed' | 'excluded'
}
```

**Proceed to Confirm gating:** `step === 'confirm'` only allowed when all `NeedsReviewItem` statuses are `confirmed` or `excluded`.

**Nothing written to DB until:** User clicks "Commit to Database" on the Confirm screen.

### Budgeting Insights

```typescript
interface InsightsState {
  activeTab: 'overview' | 'intelligence'
  expandedCategory: string | null  // category key for merchant drill-down
  whatIf: {
    groceries: number
    eatingOut: number
    clothing: number
    health: number
    entertainment: number
    personalCare: number
  }
}
```

---

## Interactions & Behaviour

### Statement Import

- **Overlay click to close:** Clicking the dark overlay behind the modal closes it (same as Cancel)
- **Processing auto-advance:** After progress hits 100%, 380ms delay then switches to Review step
- **Section B expand/collapse:** Click anywhere on a category row toggles the transaction sub-panel. Has a 180ms CSS transition on the chevron rotation.
- **Category amount edit:** Clicking the pencil icon on a category row opens an inline number input. Clicking ✓ saves; ✕ cancels. Clicking outside should cancel.
- **Section C gating:** The "Review Summary →" button has `opacity: 0.7`, `cursor: not-allowed`, and does not navigate while any Section C items are pending.
- **Undo:** Undo on recurring and review items returns them to `pending` state

### Budgeting Insights

- **Tab switching:** Clears `expandedCategory` state
- **Merchant drill-down:** Click any row's ↓/↑ button to toggle. Only one category expanded at a time. Panel appears below the entire forecastVsActual list with a `fadeIn` animation.
- **What-if sliders:** `onChange` event (fires continuously while dragging). All impact calculations update synchronously in the same render — no debounce needed.
- **Heatmap cells:** `title` attribute tooltip showing month + dollar value on hover. No click behaviour required in v1.
- **Empty state:** Shown when no statement has been imported for the selected month.

---

## Charting — Recharts Integration

The Budgeting Insights page uses custom SVG charts in the prototype. In the real implementation, use **Recharts** (already in the stack) where possible:

| Chart | Recommended Recharts component |
|---|---|
| Waterfall (Income vs Spending) | `ComposedChart` with stacked/offset `Bar` + invisible spacer bars |
| Savings Rate Gauge | Custom SVG (Recharts has no gauge) or `RadialBarChart` |
| 6-month sparkline | `LineChart` with no axes |
| Forecast vs Actual bars | CSS flex bars (no chart library needed) |
| Heatmap | CSS Grid (no chart library needed) |
| Small multiples | `LineChart` × 10, miniaturised |
| Spending Velocity | `AreaChart` or `ComposedChart` |
| FI Trajectory | `LineChart` with 3 `Line` components |
| Spend Creep | `AreaChart` |
| Needs/Wants bars | CSS flex bars |
| Merchant bars | CSS flex bars |

All Recharts charts should use `CartesianGrid` stroke `rgba(255,255,255,0.045)`, `Tooltip` styled dark to match the app theme, and no default Recharts colour palette — use the tokens above.

---

## Files in this Package

| File | Description |
|---|---|
| `Statement Import.dc.html` | Interactive prototype of the full 5-step import modal flow |
| `Budgeting Insights.dc.html` | Interactive prototype of the analytics dashboard (both tabs + empty state) |
| `README.md` | This document |

Open the `.dc.html` files directly in a modern browser. No build step required.

---

## Out of Scope (not designed)

- CSV parsing logic and column mapping
- Keyword categorisation rules engine
- AI category suggestion API
- Any backend / database schema
- Mobile-optimised layout (desktop-primary)
- Multi-user or permission handling
