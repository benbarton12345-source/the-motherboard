// Finance — Net Worth taxonomy (single source of truth).
//
// Two-tier structure, confirmed with Ben:
//   Cash            (top-level group, single class)
//   Invested Assets (top-level group) → Investments · Crypto · Pension · Property · Other
//
// `crypto` was promoted to its own leaf class on 11 Sept 2026. The 26 July
// restructure deliberately folded Crypto into `investments`; that call was
// reversed so the asset-class breakdown can report crypto exposure separately.
//
// The DB stores only the leaf `asset_class` on each account; the grouping,
// labels, and display order are derived from here so they can never drift out of
// sync with a denormalised column. Net Worth renders nested groups off this.

// Leaf classes → their group + display label. Order here is display order within
// a group.
export const ASSET_CLASSES = {
  cash:        { label: 'Cash',        group: 'cash' },
  investments: { label: 'Investments', group: 'invested' },
  crypto:      { label: 'Crypto',      group: 'invested' },
  pension:     { label: 'Pension',     group: 'invested' },
  property:    { label: 'Property',    group: 'invested' },
  other:       { label: 'Other',       group: 'invested' },
}

// Top-level groups, in display order. `classes` lists the leaf classes under each
// (also in display order). `defaultExpanded` seeds the Net Worth collapse state.
export const ASSET_GROUPS = [
  { key: 'cash',     label: 'Cash',            classes: ['cash'],                                  defaultExpanded: true },
  { key: 'invested', label: 'Invested Assets', classes: ['investments', 'crypto', 'pension', 'property', 'other'], defaultExpanded: true },
]

// Ordered flat list of classes (group order, then within-group order) — handy for
// iterating the whole taxonomy top-to-bottom.
export const ASSET_CLASS_ORDER = ASSET_GROUPS.flatMap(g => g.classes)

export const COUNTRIES = { UK: 'United Kingdom', AU: 'Australia' }
export const COUNTRY_KEYS = ['UK', 'AU']
export const CURRENCY_KEYS = ['GBP', 'AUD']

export function classLabel(assetClass) {
  return ASSET_CLASSES[assetClass]?.label ?? assetClass
}

export function groupOfClass(assetClass) {
  return ASSET_CLASSES[assetClass]?.group ?? 'invested'
}

// ── Targets / projection constants ──────────────────────────────────────────
export const NET_WORTH_TARGET_GBP = 1_500_000

// FI-pace / projection horizon. Overview's FI-pace and the Projections page MUST
// share this so they can never disagree on a crossing date (Overview previously
// projected 30y while Projections used 25y — aligned to 25y here).
export const FI_PROJECTION_YEARS = 25

// Accent colour per leaf asset class, for the asset-class breakdown donut
// (shared by the Net Worth page and the Home Assets card).
//
// Validated against the dark chart surface (#111827) with **all-pairs**
// separation, not just adjacent pairs: the breakdown is a RING, so the last
// segment wraps around to touch the first and any two classes can end up
// neighbours. An earlier emerald/teal pairing for cash/pension passed
// list-order adjacency but scored ΔE 4.9 normal-vision against a floor of 15 —
// the two greens were genuinely hard to tell apart on screen.
//
// The five real hues below pass the lightness band, chroma floor, normal-vision
// floor and contrast on all pairs. CVD separation sits at ΔE 7.3 (cash↔property)
// — inside the 6–8 band that is permitted only with secondary encoding, which
// this chart has: every segment is named in the legend with its own percentage
// and value, and carries an SVG <title> on hover.
//
// Tailwind steps: emerald-700, sky-600, amber-600, violet-600, rose-600.
export const ASSET_CLASS_COLOURS = {
  cash:        '#047857', // emerald-700
  investments: '#0284c7', // sky-600
  crypto:      '#d97706', // amber-600
  pension:     '#7c3aed', // violet-600
  property:    '#e11d48', // rose-600
  // `other` is the residual bucket, deliberately neutral rather than a sixth
  // hue: six chromatic classes cannot all clear the all-pairs floor inside the
  // dark lightness band. A grey reads as "everything else" and never competes
  // with a real class for identity.
  other:       '#64748b', // slate-500
}
