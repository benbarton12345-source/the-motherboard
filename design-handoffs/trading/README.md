# Handoff: Trading Analytics page (The Motherboard)

## Overview
A read-only analytics page for closed trades synced from IG's API. It interprets trade outcomes into performance analytics: net P&L for a selected period, win rate against a personal target, profit factor, average return, risk:reward against target, max drawdown, a P&L trend line, and markets ranked by P&L with a drill-down into any single instrument.

It is not a trade journal. There is no manual entry, no strategy/setup/notes fields, no live prices, no open-position management, and no alerts or warnings.

## About the Design Files
`Trading Analytics.dc.html` in this bundle is a **design reference built in HTML** — a working prototype of the intended layout, hierarchy and behaviour. It is not production code to copy. Recreate it inside The Motherboard's existing codebase using that app's established framework, component library and conventions.

Fake trade data is generated in the prototype's logic class from a seeded RNG purely so the charts and lists have something plausible to render. Replace all of it with real IG-synced data.

## Fidelity
**Hi-fi on structure and behaviour, deliberately loose on styling.**

Match the existing app for all visual tokens — fonts, exact greens/reds/greys, card background, border colour, radii, shadows, label casing and letter-spacing. The prototype approximates them from screenshots of the Finance page; **the app's own values win in every conflict**. Do not port hex values or font stacks out of the HTML.

What *is* hi-fi and should be followed closely: the information hierarchy, the order and grouping of metrics, the responsive behaviour, and the drill-down flow.

## Screens / Views

### 1. Analytics overview (default)

Purpose: answer "how am I doing this month" in one glance.

Layout, top to bottom:

1. **Page chrome** — same shell as every other page: left icon rail on desktop, hidden on phone; top bar with the page title ("Trading"). The top bar's right side carries a small sync indicator (dot + `IG · SYNCED 09:14`) in the same slot the Finance page uses for its FX rate.
2. **Period control** — a segmented control: `MONTH` / `ALL TIME` / `CUSTOM`.
   - `MONTH` (default) additionally shows a `‹ Sep 2026 ›` stepper beside it, clamped to the range of available data.
   - `CUSTOM` swaps the stepper for two date inputs (`from → to`).
   - `ALL TIME` shows neither.
   - Controls wrap onto a second line at phone width; tab labels must not wrap internally.
3. **Hero card** — mirrors the Finance page's net-worth hero. Two columns on wide screens, stacked on phone:
   - Left: small uppercase label `NET P&L · SEPTEMBER 2026`; the net P&L as the largest number on the page (fluid, roughly 38–64px, tight tracking, green when positive / red when negative, subtle glow); beneath it the month-over-month delta — **keep this, it was explicitly confirmed**: `▼ £6,904 vs August` (green when up, red when down); beneath that a quiet mono line `34 trades · 21W / 13L`. For non-month periods the delta line falls back to `N closed trades · 01 Jan – 15 Sep`.
   - Right: cumulative P&L trend chart for the period — same treatment as the net-worth trend line (single glowing line, soft gradient area fill, no gridlines), plus a dashed zero baseline and five date labels underneath.
4. **Stat row** — five cards, in this priority order: **Win rate**, **Profit factor**, **Avg return / trade**, **Risk : reward**, **Max drawdown**. Each card: tiny uppercase mono label, large value, then one supporting line.
   - Win rate and Risk:reward each carry a thin progress track (fill = actual against target) and a footer row: signed delta on the left (`+2 pts`, `−0.2`), `target 60%` / `target 2 : 1` on the right, delta coloured green when at/above target, red when below. That is the whole "how am I tracking" treatment — no separate targets section, no explanatory copy.
   - Max drawdown is a plain stat: value plus `peak 12 Sep → trough 19 Sep`. No warning colour, icon or emphasis.
5. **Markets by P&L** — card with the header `MARKETS BY P&L` and a right-aligned hint `tap to drill in`. One row per instrument, sorted by net P&L descending: name, trade count (desktop only), a horizontal bar scaled to the largest absolute P&L in the period (green positive / red negative), signed P&L, chevron. Whole row is tappable with a subtle hover background.

### 2. Instrument drill-down

Opened by tapping a row in Markets by P&L. Replaces the overview in place (not a modal). Same period selection carries over.

1. `‹ ALL MARKETS` back control, with the active period label beside it.
2. Header card: instrument name, then `NET P&L` and the scoped net figure, `N trades · NW / NL`, and that instrument's own equity curve (same chart treatment, shorter) with first/last close dates under it.
3. Three stat cards scoped to the instrument: **Win rate** (`14 of 22 · target 60%`), **Avg return / trade**, **Profit factor** (`£4,120 in · £1,980 out`).
4. **Trade history** — one row per closed trade, newest first: close date, direction (`BUY`/`SELL`), `open → close` price with instrument-appropriate decimal places, R multiple (`+2.1R`), signed P&L (green/red). The prototype caps the list at 24 rows and prints `+ N earlier trades`; in production paginate or lazy-load instead.

## Interactions & Behavior
- Period tabs: set period, reset any drill-down selection.
- Month stepper: ±1 month, clamped to available data.
- Custom range: two date inputs, filter by **close date** inclusive.
- Market row click: open drill-down for that instrument, scoped to the current period.
- Back: return to the overview with period preserved.
- Hover: subtle background lift on market rows only. No animations beyond the app's existing transitions.
- Empty period: metrics should render zeroes and the chart should collapse to a flat zero baseline rather than disappearing — worth handling explicitly.

### Responsive behaviour (mobile-first, and the part most likely to be got wrong)
- Phone first: single column, cards stack, hero stacks label/number above chart.
- The stat row must **not** use a fixed column count. Use wrapping flex items with a ~150px basis that stretch to fill: 5-up on wide desktop, 3-up around tablet, 2-up on a phone, with the final wrapped row always stretched so Max drawdown never sits alone in an empty row.
- The icon rail and the trade-count column appear only above ~900px, via media queries. **Do not gate layout on a JS-measured width** — that was tried in the prototype and produced a wrong first paint every time.
- Chart height is fluid (`clamp`), chart geometry is a fixed viewBox scaled with `preserveAspectRatio="none"` and non-scaling strokes.

## State Management
Client state is small: `period` (`month | all | custom`), `monthIndex`, `customFrom` / `customTo`, `selectedInstrument | null`.

Everything else derives from one array of closed trades. Per trade the page needs: instrument name, direction, open price, close price, price decimal places, open date, close date, realised P&L, and (for the R column) risk or R multiple. If IG does not return risk, either compute R from stop distance or drop the R column.

Derived per period (and again per instrument): net P&L, gross profit, gross loss, win/loss counts, win rate, profit factor, average return, risk:reward as average win ÷ average loss, max drawdown as the largest peak-to-trough fall of the cumulative P&L curve (record the peak and trough dates for the supporting line), and the cumulative curve points for the chart.

Fetching: one server-side query per period is enough; all metrics are aggregations over the same trade set, so compute them together rather than as separate endpoints.

## Design Tokens
Take every token from the existing app — this page introduces none. It relies on: page background, card background, card border, primary/secondary/tertiary text, the positive green and negative red, the mono label style (uppercase, small, letter-spaced), the display number style (heavy, tight tracking), card radius, and the standard card padding and grid gap. The two targets (win rate 60%, risk:reward 2:1) are fixed personal values and belong in config, not hard-coded in the view.

## Assets
None. Rail glyphs in the prototype are placeholders for the app's existing nav icons; charts are inline SVG paths generated from data.

## Files
- `Trading Analytics.dc.html` — the full prototype: overview, period controls, charts, stat cards with targets, markets list, and instrument drill-down. Its logic class also contains the metric maths (`stats()`, `curve()`), which is worth reading as a spec for the calculations.
