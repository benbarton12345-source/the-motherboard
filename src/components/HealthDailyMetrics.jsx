// ── Daily Metrics ───────────────────────────────────────────────────────────
// Passive-metric detail framed against Ben's own rolling baseline (not a fixed
// "normal range"). Defaults to a 7-day trend with drill-down to 30 days. The
// Weight card carries over from the old page with its own independent window.
import { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip, CartesianGrid,
} from 'recharts'
import { supabase } from '../supabase'
import Modal from './Modal'
import {
  C, fmtShort, fmtHm, localDate, shiftDate, rollingBaseline,
} from '../utils/healthHelpers'
import { HCard, Eyebrow, CardTitle, PillToggle, NoData, StatTile } from './HealthUI'

const inputCls = 'bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400'

// Ascending {date,label,v} series for a field within the last `days` days.
function windowSeries(rowsDesc, field, days, transform = v => v) {
  const cutoff = shiftDate(localDate(), -(days - 1))
  return rowsDesc
    .filter(r => r.date >= cutoff && r[field] != null)
    .map(r => ({ date: r.date, label: fmtShort(r.date), v: transform(r[field]) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function MetricTooltip({ active, payload, unit }) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 9px', fontSize: 11 }}>
      <div style={{ color: C.label }}>{p.payload.label}</div>
      <div style={{ color: C.text }}>{p.payload.display ?? `${p.value} ${unit}`}</div>
    </div>
  )
}

// One passive-metric card: value, delta-vs-baseline badge, line chart with a
// dashed baseline reference line, and a window/baseline caption.
function MetricCard({ def, rowsDesc, windowDays }) {
  const series = useMemo(
    () => windowSeries(rowsDesc, def.field, windowDays, def.transform),
    [rowsDesc, def, windowDays],
  )
  // Baseline is always the 30-day personal average, regardless of the view.
  const baseline = useMemo(() => {
    const b = rollingBaseline(rowsDesc, def.field, 30)
    return b == null ? null : def.transform(b)
  }, [rowsDesc, def])

  const today = series.length ? series[series.length - 1].v : null
  const delta = today != null && baseline != null ? today - baseline : null
  const favorable = delta == null ? null : (def.goodIsUp ? delta >= 0 : delta <= 0)

  const chartData = series.map(s => ({ ...s, display: def.formatValue(s.v) }))
  const yVals = [...series.map(s => s.v), ...(baseline != null ? [baseline] : [])]
  const yMin = Math.min(...yVals), yMax = Math.max(...yVals)
  const pad = (yMax - yMin) * 0.15 || 1

  return (
    <HCard style={{ padding: '18px 20px' }}>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 2 }}>
        <Eyebrow style={{ fontSize: 11 }}>{def.label}</Eyebrow>
        {delta != null && (
          <span className="font-semibold" style={{ fontSize: 12, color: favorable ? C.emerald : C.amber }}>
            {def.formatDelta(delta)} vs 30d avg
          </span>
        )}
      </div>
      <div className="font-bold" style={{ fontSize: 26, color: C.text, marginBottom: 10 }}>
        {today != null ? def.formatValue(today) : '—'}
      </div>
      {series.length >= 2 ? (
        <ResponsiveContainer width="100%" height={90}>
          <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <YAxis hide domain={[yMin - pad, yMax + pad]} />
            <XAxis dataKey="label" hide />
            <Tooltip content={<MetricTooltip unit={def.unit} />} cursor={{ stroke: C.border }} />
            {baseline != null && (
              <ReferenceLine y={baseline} stroke="#2a3242" strokeDasharray="4 4" />
            )}
            <Line type="monotone" dataKey="v" stroke={C.emerald} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <NoData height={90} />
      )}
      <div style={{ fontSize: 11.5, color: C.label, marginTop: 4 }}>
        {windowDays === 7 ? '7-day view' : '30-day view'}
        {baseline != null && ` · 30d personal baseline ${def.formatValue(baseline)}`}
      </div>
    </HCard>
  )
}

const METRIC_DEFS = [
  {
    label: 'HRV', field: 'hrv_ms', unit: 'ms', goodIsUp: true,
    transform: v => v,
    formatValue: v => `${Math.round(v)} ms`,
    formatDelta: d => `${d >= 0 ? '+' : '−'}${Math.abs(Math.round(d))} ms`,
  },
  {
    label: 'Resting HR', field: 'resting_hr', unit: 'bpm', goodIsUp: false,
    transform: v => v,
    formatValue: v => `${Math.round(v)} bpm`,
    formatDelta: d => `${d >= 0 ? '+' : '−'}${Math.abs(Math.round(d))} bpm`,
  },
  {
    label: 'Steps', field: 'steps', unit: '', goodIsUp: true,
    transform: v => v,
    formatValue: v => Math.round(v).toLocaleString(),
    formatDelta: d => `${d >= 0 ? '+' : '−'}${Math.abs(Math.round(d)).toLocaleString()}`,
  },
  {
    label: 'Sleep', field: 'sleep_minutes', unit: '', goodIsUp: true,
    transform: v => v, // minutes
    formatValue: v => fmtHm(v),
    formatDelta: d => `${d >= 0 ? '+' : '−'}${Math.abs(Math.round(d))}m`,
  },
]

// Active calories sits below the 2×2 as a full-width card — activity output,
// same baseline/trend framing. Also feeds the Insights maintenance estimator.
const ACTIVE_CAL_DEF = {
  label: 'Active Calories', field: 'active_calories', unit: 'kcal', goodIsUp: true,
  transform: v => v,
  formatValue: v => `${Math.round(v).toLocaleString()} kcal`,
  formatDelta: d => `${d >= 0 ? '+' : '−'}${Math.abs(Math.round(d)).toLocaleString()} kcal`,
}

function WeightTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 11 }}>
      <div style={{ color: C.label, marginBottom: 2 }}>{label}</div>
      {payload.map(p => <div key={p.dataKey} style={{ color: p.color }}>{p.name}: {p.value} kg</div>)}
    </div>
  )
}

export default function HealthDailyMetrics({ appleHealthLogs, weightLogs, settings, saveSettings, refetchWeight }) {
  const [windowDays, setWindowDays] = useState(7)
  const [weightRange, setWeightRange] = useState('90D')

  // ── Weight modals + form state (ported from the old page) ─────────────────
  const [showWeightModal, setShowWeightModal] = useState(false)
  const [showTargetModal, setShowTargetModal] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [weightForm, setWeightForm] = useState({ date: localDate(), weight_kg: '', notes: '' })
  const [weightSaving, setWeightSaving] = useState(false)
  const [targetForm, setTargetForm] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ date: '', weight_kg: '', notes: '' })
  const [editSaving, setEditSaving] = useState(false)

  async function saveWeight() {
    if (!weightForm.weight_kg) return
    setWeightSaving(true)
    await supabase.from('weight_logs').insert({
      date: weightForm.date, weight_kg: parseFloat(weightForm.weight_kg), notes: weightForm.notes || null,
    })
    setWeightForm({ date: localDate(), weight_kg: '', notes: '' })
    setShowWeightModal(false)
    await refetchWeight()
    setWeightSaving(false)
  }
  async function saveTarget() {
    await saveSettings({ weight_target_kg: targetForm ? parseFloat(targetForm) : null })
    setShowTargetModal(false)
  }
  async function saveEdit() {
    if (!editForm.weight_kg) return
    setEditSaving(true)
    await supabase.from('weight_logs').update({
      date: editForm.date, weight_kg: parseFloat(editForm.weight_kg), notes: editForm.notes || null,
    }).eq('id', editingId)
    await refetchWeight()
    setEditingId(null)
    setEditSaving(false)
  }
  async function deleteWeight(id) {
    await supabase.from('weight_logs').delete().eq('id', id)
    await refetchWeight()
  }
  function closeHistory() { editingId ? setEditingId(null) : setShowHistoryModal(false) }

  // ── Derived weight chart + stats ──────────────────────────────────────────
  const filteredWeight = useMemo(() => {
    const sorted = [...weightLogs].sort((a, b) => a.date.localeCompare(b.date))
    const cutoffs = { '30D': shiftDate(localDate(), -30), '90D': shiftDate(localDate(), -90) }
    return cutoffs[weightRange] ? sorted.filter(l => l.date >= cutoffs[weightRange]) : sorted
  }, [weightLogs, weightRange])

  const weightChartData = useMemo(() => filteredWeight.map((log, i) => {
    const win = filteredWeight.slice(Math.max(0, i - 6), i + 1)
    const ma = parseFloat((win.reduce((s, l) => s + l.weight_kg, 0) / win.length).toFixed(1))
    return { date: log.date, label: fmtShort(log.date), weight: log.weight_kg, ma }
  }), [filteredWeight])

  const currentWeight = weightLogs[0]?.weight_kg ?? null
  const sevenDayAvg = useMemo(() => {
    const slice = [...weightLogs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7)
    return slice.length ? parseFloat((slice.reduce((s, l) => s + l.weight_kg, 0) / slice.length).toFixed(1)) : null
  }, [weightLogs])
  const target = settings.weight_target_kg
  const toTarget = currentWeight != null && target != null
    ? parseFloat((currentWeight - target).toFixed(1)) : null

  // ── Sleep stages (last night) ─────────────────────────────────────────────
  const lastSleep = appleHealthLogs.find(r => r.sleep_minutes != null) || null
  const stages = [
    { label: 'Deep', field: 'sleep_deep_minutes' },
    { label: 'Core', field: 'sleep_core_minutes' },
    { label: 'REM', field: 'sleep_rem_minutes', highlight: true },
    { label: 'Awake', field: 'sleep_awake_minutes' },
  ]
  const hasStages = lastSleep && stages.some(s => lastSleep[s.field] != null)

  const windowOptions = [{ value: 7, label: '7D' }, { value: 30, label: '30D' }]
  const rangeOptions = [{ value: '30D', label: '30D' }, { value: '90D', label: '90D' }, { value: 'All', label: 'ALL' }]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Page-level window toggle */}
      <div className="flex justify-end">
        <PillToggle options={windowOptions} value={windowDays} onChange={setWindowDays} />
      </div>

      {/* 2×2 metric grid */}
      <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
        {METRIC_DEFS.map(def => (
          <MetricCard key={def.field} def={def} rowsDesc={appleHealthLogs} windowDays={windowDays} />
        ))}
      </div>

      {/* Active calories (full width) */}
      <MetricCard def={ACTIVE_CAL_DEF} rowsDesc={appleHealthLogs} windowDays={windowDays} />

      {/* Sleep stages */}
      <HCard style={{ padding: '18px 20px' }}>
        <Eyebrow style={{ fontSize: 11, marginBottom: 14 }}>Sleep stages — last night</Eyebrow>
        {hasStages ? (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 16 }}>
            {stages.map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>{s.label}</div>
                <div className="font-semibold" style={{ fontSize: 17, color: s.highlight ? C.emerald : C.text }}>
                  {lastSleep[s.field] != null ? fmtHm(lastSleep[s.field]) : '—'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <NoData height={40} label="No sleep-stage data yet" />
        )}
      </HCard>

      {/* Weight card */}
      <HCard style={{ padding: '18px 20px' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <CardTitle>Weight</CardTitle>
          <div className="flex items-center gap-2">
            <PillToggle options={rangeOptions} value={weightRange} onChange={setWeightRange} size="sm" />
            <button
              onClick={() => { setEditingId(null); setShowHistoryModal(true) }}
              className="rounded-lg transition-colors" style={{ border: `1px solid ${C.border}`, color: C.text3, fontSize: 11.5, padding: '5px 12px' }}
            >History</button>
            <button
              onClick={() => { setTargetForm(target != null ? String(target) : ''); setShowTargetModal(true) }}
              className="rounded-lg transition-colors" style={{ border: `1px solid ${C.border}`, color: C.text3, fontSize: 11.5, padding: '5px 12px' }}
            >Target</button>
            <button
              onClick={() => { setWeightForm({ date: localDate(), weight_kg: '', notes: '' }); setShowWeightModal(true) }}
              className="rounded-lg font-semibold transition-colors" style={{ background: C.emerald, color: '#06120c', fontSize: 11.5, padding: '5px 12px' }}
            >+ Log</button>
          </div>
        </div>

        {weightChartData.length > 1 ? (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={weightChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={C.divider} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: C.faint, fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={40} />
              <YAxis tick={{ fill: C.faint, fontSize: 10 }} tickLine={false} axisLine={false} domain={['dataMin - 1', 'dataMax + 1']} width={38} />
              <Tooltip content={<WeightTooltip />} />
              {target != null && (
                <ReferenceLine y={target} stroke={C.amber} strokeDasharray="6 4" label={{ value: `Target ${target}kg`, fill: C.amber, fontSize: 10, position: 'insideTopRight' }} />
              )}
              <Line type="monotone" dataKey="weight" stroke={C.emerald} strokeWidth={2.5} dot={false} name="Weight" isAnimationActive={false} />
              <Line type="monotone" dataKey="ma" stroke={C.label} strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="7-day avg" isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <NoData height={120} label={weightChartData.length === 1 ? 'Log more entries to see the chart.' : 'No weight entries yet.'} />
        )}

        <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))', marginTop: 18 }}>
          <StatTile label="Current" value={currentWeight != null ? `${currentWeight} kg` : '—'} />
          <StatTile label="7-day avg" value={sevenDayAvg != null ? `${sevenDayAvg} kg` : '—'} />
          <StatTile label="Target" value={target != null ? `${target} kg` : '—'} />
          <StatTile
            label="To target"
            value={toTarget != null ? `${toTarget > 0 ? '+' : ''}${toTarget} kg` : '—'}
            valueColor={toTarget == null ? C.text : Math.abs(toTarget) < 0.5 ? C.emerald : C.amber}
          />
        </div>
      </HCard>

      {/* ── Weight modals ──────────────────────────────────────────────────── */}
      {showWeightModal && (
        <Modal title="Log Weight" onClose={() => setShowWeightModal(false)} onSave={saveWeight}
          saveLabel="Save" saveDisabled={weightSaving || !weightForm.weight_kg} saving={weightSaving}>
          <div className="space-y-3">
            <div>
              <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Date</label>
              <input type="date" value={weightForm.date} onChange={e => setWeightForm(f => ({ ...f, date: e.target.value }))} className={`w-full ${inputCls}`} />
            </div>
            <div>
              <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Weight (kg)</label>
              <input type="number" step="0.1" value={weightForm.weight_kg} onChange={e => setWeightForm(f => ({ ...f, weight_kg: e.target.value }))} placeholder="e.g. 82.5" className={`w-full ${inputCls}`} />
            </div>
            <div>
              <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Notes</label>
              <input value={weightForm.notes} onChange={e => setWeightForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" className={`w-full ${inputCls}`} />
            </div>
          </div>
        </Modal>
      )}

      {showTargetModal && (
        <Modal title="Target Weight" onClose={() => setShowTargetModal(false)} onSave={saveTarget} saveLabel="Set Target">
          <div>
            <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Target Weight (kg)</label>
            <input type="number" step="0.1" value={targetForm} onChange={e => setTargetForm(e.target.value)} placeholder="e.g. 78.0" className={`w-full ${inputCls}`} />
          </div>
        </Modal>
      )}

      {showHistoryModal && (
        <Modal
          title={editingId ? 'Edit Entry' : 'Weight History'}
          onClose={closeHistory}
          onSave={editingId ? saveEdit : () => setShowHistoryModal(false)}
          saveLabel={editingId ? 'Save' : 'Done'}
          cancelLabel={editingId ? 'Back' : 'Close'}
          saving={editSaving}
          saveDisabled={editingId ? (!editForm.weight_kg || editSaving) : false}
          maxWidth="max-w-2xl"
        >
          {editingId ? (
            <div className="space-y-3">
              <div>
                <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Date</label>
                <input type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} className={`w-full ${inputCls}`} />
              </div>
              <div>
                <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Weight (kg)</label>
                <input type="number" step="0.1" value={editForm.weight_kg} onChange={e => setEditForm(f => ({ ...f, weight_kg: e.target.value }))} className={`w-full ${inputCls}`} />
              </div>
              <div>
                <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Notes</label>
                <input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" className={`w-full ${inputCls}`} />
              </div>
            </div>
          ) : weightLogs.length === 0 ? (
            <div className="text-sm text-gray-600 py-4 text-center">No weight entries yet.</div>
          ) : (
            <div>
              <div className="grid grid-cols-12 gap-3 pb-2 border-b border-gray-700">
                <div className="col-span-3 text-xs text-gray-500 uppercase tracking-widest">Date</div>
                <div className="col-span-2 text-xs text-gray-500 uppercase tracking-widest text-right">Weight</div>
                <div className="col-span-5 text-xs text-gray-500 uppercase tracking-widest">Notes</div>
                <div className="col-span-2" />
              </div>
              {weightLogs.map(log => (
                <div key={log.id} className="grid grid-cols-12 gap-3 py-2.5 border-b border-gray-800 last:border-0 items-center group">
                  <div className="col-span-3 text-sm text-white">{fmtShort(log.date)}</div>
                  <div className="col-span-2 text-sm text-emerald-400 text-right font-medium">{log.weight_kg} kg</div>
                  <div className="col-span-5 text-sm text-gray-400 truncate">{log.notes || '—'}</div>
                  <div className="col-span-2 flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditForm({ date: log.date, weight_kg: String(log.weight_kg), notes: log.notes || '' }); setEditingId(log.id) }}
                      className="text-xs text-gray-500 hover:text-white transition-colors uppercase tracking-widest">Edit</button>
                    <button onClick={() => deleteWeight(log.id)}
                      className="text-xs text-gray-500 hover:text-red-400 transition-colors uppercase tracking-widest">Del</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
