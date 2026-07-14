// ── Health Overview (landing) ───────────────────────────────────────────────
// Full health picture at a glance, then routes to the detail pages. Light data
// only: snapshot tiles, a 7-day directional trend strip, a needs-attention
// panel (every flag conditional), and four navigation cards.
import { useMemo } from 'react'
import {
  C, avgField, mealTotals, macroTargets, blendedMacroPct, macroBadge,
  trendDirection, rollingBaseline, fmtHm,
} from '../utils/healthHelpers'
import { HCard, Eyebrow, Sparkline, NoData, Dot } from './HealthUI'

// First non-null value of a field scanning newest→oldest.
function latestVal(rowsDesc, field) {
  const row = rowsDesc.find(r => r?.[field] != null)
  return row ? row[field] : null
}

// The N most-recent non-null values of a field, oldest→newest (for sparklines).
function recentSeries(rowsDesc, field, n) {
  const vals = []
  for (const r of rowsDesc) {
    if (r?.[field] != null) vals.push(r[field])
    if (vals.length >= n) break
  }
  return vals.reverse()
}

const STATUS_TEXT = { good: C.emerald, warn: C.amber }

export default function HealthOverview({ appleHealthLogs, weightLogs, todayMeals, settings, onOpenSub }) {
  const targets = macroTargets(settings)

  const derived = useMemo(() => {
    const hrv = latestVal(appleHealthLogs, 'hrv_ms')
    const rhr = latestVal(appleHealthLogs, 'resting_hr')
    const sleepMin = latestVal(appleHealthLogs, 'sleep_minutes')
    const steps = latestVal(appleHealthLogs, 'steps')
    const weight = weightLogs[0]?.weight_kg ?? null

    const last7 = appleHealthLogs.slice(0, 7)
    const hrv7 = avgField(last7, 'hrv_ms')
    const rhr7 = avgField(last7, 'resting_hr')

    const totals = mealTotals(todayMeals)
    const macroPct = blendedMacroPct(totals, targets)

    return { hrv, rhr, sleepMin, steps, weight, hrv7, rhr7, totals, macroPct }
  }, [appleHealthLogs, weightLogs, todayMeals, targets])

  const { hrv, rhr, sleepMin, steps, weight, hrv7, rhr7, totals, macroPct } = derived
  const sleepTargetH = settings.sleep_target_hours || 8
  const stepsTarget = settings.steps_target || 10000

  // ── Snapshot tiles (6) ────────────────────────────────────────────────────
  const snapshotTiles = [
    {
      label: 'HRV',
      value: hrv != null ? `${Math.round(hrv)} ms` : null,
      sub: hrv7 != null ? `7d avg ${Math.round(hrv7)} ms` : 'Awaiting sync',
      color: hrv != null && hrv7 != null && hrv >= hrv7 ? C.emerald : C.text,
    },
    {
      label: 'Resting HR',
      value: rhr != null ? `${Math.round(rhr)} bpm` : null,
      sub: rhr7 != null ? `7d avg ${Math.round(rhr7)} bpm` : 'Awaiting sync',
      color: rhr != null && rhr7 != null && rhr <= rhr7 ? C.emerald : C.text,
    },
    {
      label: 'Sleep',
      value: sleepMin != null ? fmtHm(sleepMin) : null,
      sub: `Target ${sleepTargetH}h`,
      color: sleepMin == null ? C.text
        : sleepMin >= sleepTargetH * 60 ? C.emerald
          : C.amber,
    },
    {
      label: 'Steps',
      value: steps != null ? Math.round(steps).toLocaleString() : null,
      sub: `Target ${stepsTarget.toLocaleString()}`,
      color: steps != null && steps >= stepsTarget ? C.emerald : C.text,
    },
    {
      label: 'Weight',
      value: weight != null ? `${weight} kg` : null,
      sub: settings.weight_target_kg != null ? `Target ${settings.weight_target_kg} kg` : 'No target set',
      color: weight != null && settings.weight_target_kg != null
        && Math.abs(weight - settings.weight_target_kg) < 0.5 ? C.emerald : C.text,
    },
    {
      label: 'Macro status',
      value: macroPct != null ? `${macroPct}%` : null,
      sub: 'to today’s targets',
      color: macroPct == null ? C.text : macroPct >= 90 ? C.emerald : C.amber,
    },
  ]

  // ── 7-day trend strip (5) ─────────────────────────────────────────────────
  const trendDefs = [
    { label: 'HRV', field: 'hrv_ms', unit: 'ms', goodIsUp: true, source: 'ah' },
    { label: 'RHR', field: 'resting_hr', unit: 'bpm', goodIsUp: false, source: 'ah' },
    { label: 'Sleep', field: 'sleep_minutes', unit: '', goodIsUp: true, source: 'ah' },
    { label: 'Steps', field: 'steps', unit: '', goodIsUp: true, source: 'ah' },
    { label: 'Weight', field: 'weight_kg', unit: 'kg', goodIsUp: false, source: 'w' },
  ]
  const trendTiles = trendDefs.map(def => {
    const rows = def.source === 'w' ? weightLogs : appleHealthLogs
    const series = recentSeries(rows, def.field, 7)
    const dir = trendDirection(series, def.goodIsUp)
    const today = series[series.length - 1]
    let note = 'No data yet'
    if (today != null) {
      if (def.field === 'sleep_minutes') note = `${fmtHm(today)} today`
      else if (def.field === 'steps') note = `${Math.round(today).toLocaleString()} today`
      else note = `${Math.round(today * 10) / 10} ${def.unit} today`
    }
    const color = dir.status === 'none' ? C.text3 : STATUS_TEXT[dir.status]
    return { ...def, series, dir, note, color }
  })

  // ── Needs-attention flags (all conditional) ───────────────────────────────
  const flags = useMemo(() => {
    const out = []

    // 1. Sleep below target two nights running.
    const sleepNights = appleHealthLogs.filter(r => r.sleep_minutes != null).slice(0, 2)
    if (sleepNights.length === 2 && sleepNights.every(r => r.sleep_minutes < sleepTargetH * 60)) {
      out.push({ status: 'warn', text: `Sleep below your ${sleepTargetH}h target two nights running` })
    }

    // 2. Resting heart rate elevated vs 30-day baseline (>5% over).
    const rhrBaseline = rollingBaseline(appleHealthLogs, 'resting_hr', 30)
    if (rhr != null && rhrBaseline != null && rhr > rhrBaseline * 1.05) {
      out.push({ status: 'warn', text: `Resting heart rate running above your 30-day baseline (${Math.round(rhr)} vs ${Math.round(rhrBaseline)} bpm)` })
    }

    // 3. Carbs under target today (only once something's been logged).
    if (todayMeals.length > 0) {
      const carbBadge = macroBadge(totals.carbs, targets.carbs, 'min')
      if (carbBadge.status !== 'good') {
        out.push({ status: 'warn', text: `Carbs under target today — ${carbBadge.pct}% so far` })
      }
      // 4. Fat over target today (>108%, matching the adherence-badge threshold).
      if (targets.fat && totals.fat / targets.fat > 1.08) {
        out.push({ status: 'warn', text: `Fat intake over target today — ${Math.round((totals.fat / targets.fat) * 100)}%` })
      }
    }

    return out
  }, [appleHealthLogs, rhr, sleepTargetH, todayMeals, totals, targets])

  // ── Navigation card summaries (dynamic) ───────────────────────────────────
  const proteinPct = targets.protein ? Math.round((totals.protein / targets.protein) * 100) : null
  const navCards = [
    {
      sub: 'daily-metrics',
      title: 'Daily Metrics',
      summary: hrv != null || rhr != null
        ? `HRV ${hrv != null ? Math.round(hrv) : '—'} ms · resting HR ${rhr != null ? Math.round(rhr) : '—'} bpm`
        : 'Awaiting Apple Health sync',
    },
    {
      sub: 'nutrition',
      title: 'Nutrition',
      summary: todayMeals.length > 0
        ? `Protein at ${proteinPct}% of target so far`
        : 'No meals logged yet today',
    },
    { sub: 'mood', title: 'Mood', summary: 'State of Mind tracking — coming soon' },
    { sub: 'insights', title: 'Insights', summary: 'Maintenance, recovery & weekly consistency' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Snapshot row */}
      <div className="grid gap-3.5 grid-cols-2 lg:grid-cols-3">
        {snapshotTiles.map(t => (
          <HCard key={t.label} style={{ padding: '22px 24px 24px' }}>
            <Eyebrow style={{ fontSize: 11.5, marginBottom: 14 }}>{t.label}</Eyebrow>
            {t.value != null ? (
              <>
                <div className="font-bold" style={{ fontSize: 36, lineHeight: 1.05, color: t.color }}>{t.value}</div>
                <div style={{ fontSize: 12.5, color: C.label, marginTop: 8 }}>{t.sub}</div>
              </>
            ) : (
              <div style={{ paddingTop: 10 }}><NoData /></div>
            )}
          </HCard>
        ))}
      </div>

      {/* 7-day trend strip */}
      <Eyebrow style={{ fontSize: 11.5, margin: '24px 0 10px 2px' }}>7-day trend</Eyebrow>
      <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(5, minmax(0,1fr))' }}>
        {trendTiles.map(t => (
          <HCard key={t.label} style={{ padding: '14px 16px' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: C.text3, fontWeight: 500 }}>{t.label}</span>
              <span className="font-semibold" style={{ fontSize: 11, color: t.color }}>{t.dir.arrow}</span>
            </div>
            <Sparkline data={t.series} color={t.color} height={32} />
            <div style={{ fontSize: 11, color: C.label, marginTop: 6 }}>{t.note}</div>
          </HCard>
        ))}
      </div>

      {/* Needs attention */}
      <HCard style={{ padding: '18px 20px', margin: '24px 0' }}>
        <div className="font-semibold" style={{ fontSize: 13, color: C.text, marginBottom: 12 }}>
          Needs attention
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {flags.length === 0 ? (
            <div className="flex items-start" style={{ gap: 10 }}>
              <Dot color={C.emerald} style={{ marginTop: 5 }} />
              <span style={{ fontSize: 13, color: C.text2 }}>
                Nothing needs attention — all metrics within normal range.
              </span>
            </div>
          ) : (
            flags.map((f, i) => (
              <div key={i} className="flex items-start" style={{ gap: 10 }}>
                <Dot color={f.status === 'warn' ? C.amber : C.emerald} style={{ marginTop: 5 }} />
                <span style={{ fontSize: 13, color: C.text2 }}>{f.text}</span>
              </div>
            ))
          )}
        </div>
      </HCard>

      {/* Navigation cards */}
      <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        {navCards.map(nc => (
          <HCard
            key={nc.sub}
            hoverable
            onClick={() => onOpenSub?.(nc.sub)}
            style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            <div className="font-semibold" style={{ fontSize: 14, color: C.text }}>{nc.title}</div>
            <div style={{ fontSize: 12.5, color: C.text3, lineHeight: 1.5 }}>{nc.summary}</div>
            <div className="font-medium" style={{ fontSize: 12, color: C.emeraldLink, marginTop: 6 }}>View →</div>
          </HCard>
        ))}
      </div>
    </div>
  )
}
