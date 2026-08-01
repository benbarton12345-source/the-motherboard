// Finance — Net Worth taxonomy (single source of truth).
//
// Two-tier structure, confirmed with Ben:
//   Cash            (top-level group, single class)
//   Invested Assets (top-level group) → Investments · Pension · Property · Other
//
// The DB stores only the leaf `asset_class` on each account; the grouping,
// labels, and display order are derived from here so they can never drift out of
// sync with a denormalised column. Net Worth renders nested groups off this.

// Leaf classes → their group + display label. Order here is display order within
// a group.
export const ASSET_CLASSES = {
  cash:        { label: 'Cash',        group: 'cash' },
  investments: { label: 'Investments', group: 'invested' },
  pension:     { label: 'Pension',     group: 'invested' },
  property:    { label: 'Property',    group: 'invested' },
  other:       { label: 'Other',       group: 'invested' },
}

// Top-level groups, in display order. `classes` lists the leaf classes under each
// (also in display order). `defaultExpanded` seeds the Net Worth collapse state.
export const ASSET_GROUPS = [
  { key: 'cash',     label: 'Cash',            classes: ['cash'],                                  defaultExpanded: true },
  { key: 'invested', label: 'Invested Assets', classes: ['investments', 'pension', 'property', 'other'], defaultExpanded: true },
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
