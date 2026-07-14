// ── Nutrition ───────────────────────────────────────────────────────────────
// Meal logging, macro tracking, and the new planning/history tools:
// backdated logging, macro adherence badges, a macro trend chart, a lightweight
// maintenance-calorie signal, the meal prep calculator (ingredient library +
// saved plans), and a full searchable meal library across all dates.
import { useState, useMemo, useEffect, useCallback } from 'react'
import { LineChart, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip } from 'recharts'
import { supabase } from '../supabase'
import Modal from './Modal'
import {
  C, localDate, localTime, shiftDate, fmtShort, fmtLongDate, stripMarkdown,
  mealTotals, macroTargets, macroBadge, MACRO_KIND, STATUS_COLOR, STATUS_TINT,
  lastNDates, getWeekDatesForOffset,
} from '../utils/healthHelpers'
import { HCard, Eyebrow, CardTitle, PillToggle, Sparkline, NoData, EmeraldButton, OutlineButton } from './HealthUI'

const inputCls = 'bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400'

// Emerald-tinted focus ring for the meal-library search (design handoff).
const searchCls = 'rounded-lg text-sm outline-none transition-shadow'
function focusRing(e) { e.target.style.borderColor = C.emerald; e.target.style.boxShadow = '0 0 0 3px rgba(16,185,129,0.25)' }
function blurRing(e) { e.target.style.borderColor = C.border; e.target.style.boxShadow = 'none' }

const EMPTY_MEAL = { description: '', kcal: '', protein_g: '', carbs_g: '', fat_g: '', logged_at: localTime() }

export default function HealthNutrition({ meals, settings, saveSettings, refetchMeals, weightLogs, onOpenSub }) {
  const targets = macroTargets(settings)
  const [selectedDate, setSelectedDate] = useState(localDate())

  // Meals for the selected (possibly back-dated) logging date.
  const dayMeals = useMemo(
    () => meals.filter(m => m.date === selectedDate).sort((a, b) => (a.time || '').localeCompare(b.time || '')),
    [meals, selectedDate],
  )
  const totals = useMemo(() => mealTotals(dayMeals), [dayMeals])

  // ── Meal modal state (add / edit / settings / suggest) ────────────────────
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [mealMode, setMealMode] = useState('ai')       // ai | manual | recent
  const [mealStep, setMealStep] = useState('input')     // input | review
  const [mealInput, setMealInput] = useState('')
  const [mealForm, setMealForm] = useState(EMPTY_MEAL)
  const [mealEstimating, setMealEstimating] = useState(false)
  const [mealSaving, setMealSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_MEAL)
  const [editSaving, setEditSaving] = useState(false)
  const [recentMeals, setRecentMeals] = useState([])
  const [recentLoading, setRecentLoading] = useState(false)
  const [suggestion, setSuggestion] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  const [nsForm, setNsForm] = useState({ ...settings })
  const [nsSaving, setNsSaving] = useState(false)

  async function fetchRecent() {
    setRecentLoading(true)
    const since = shiftDate(localDate(), -7)
    const { data } = await supabase.from('meal_logs').select('*')
      .gte('date', since).order('date', { ascending: false }).order('time', { ascending: false })
    if (data) {
      const seen = new Set(); const out = []
      for (const m of data) {
        const key = (m.description || '').toLowerCase().trim()
        if (!seen.has(key)) { seen.add(key); out.push(m) }
      }
      setRecentMeals(out)
    }
    setRecentLoading(false)
  }

  async function estimateMeal() {
    if (!mealInput.trim()) return
    setMealEstimating(true)
    try {
      const yesterday = shiftDate(selectedDate, -1)
      const { data: prev } = await supabase.from('meal_logs').select('*').eq('date', yesterday)
      const resp = await fetch('/api/estimate-meal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: mealInput, previousMeals: prev || [] }),
      })
      const parsed = await resp.json()
      setMealForm({
        description: parsed.description || mealInput,
        kcal: parsed.kcal != null ? String(Math.round(parsed.kcal)) : '',
        protein_g: parsed.protein_g != null ? String(Math.round(parsed.protein_g)) : '',
        carbs_g: parsed.carbs_g != null ? String(Math.round(parsed.carbs_g)) : '',
        fat_g: parsed.fat_g != null ? String(Math.round(parsed.fat_g)) : '',
        logged_at: localTime(),
      })
    } catch {
      setMealForm({ ...EMPTY_MEAL, description: mealInput })
    }
    setMealStep('review')
    setMealEstimating(false)
  }

  async function saveMeal() {
    if (!mealForm.description || !mealForm.kcal) return
    setMealSaving(true)
    await supabase.from('meal_logs').insert({
      date: selectedDate,
      time: mealForm.logged_at || localTime(),
      description: mealForm.description,
      kcal: parseFloat(mealForm.kcal),
      protein_g: parseFloat(mealForm.protein_g || 0),
      carbs_g: parseFloat(mealForm.carbs_g || 0),
      fat_g: parseFloat(mealForm.fat_g || 0),
    })
    setShowAdd(false); setMealInput(''); setMealStep('input'); setMealMode('ai'); setMealForm(EMPTY_MEAL)
    await refetchMeals()
    setMealSaving(false)
  }

  async function saveEditMeal() {
    if (!editForm.description || !editForm.kcal) return
    setEditSaving(true)
    await supabase.from('meal_logs').update({
      time: editForm.logged_at || null,
      description: editForm.description,
      kcal: parseFloat(editForm.kcal),
      protein_g: parseFloat(editForm.protein_g || 0),
      carbs_g: parseFloat(editForm.carbs_g || 0),
      fat_g: parseFloat(editForm.fat_g || 0),
    }).eq('id', editingId)
    setShowEdit(false); setEditingId(null)
    await refetchMeals()
    setEditSaving(false)
  }

  async function deleteMeal(id) {
    await supabase.from('meal_logs').delete().eq('id', id)
    await refetchMeals()
  }

  async function suggestMeal() {
    setSuggesting(true); setSuggestion('')
    try {
      const resp = await fetch('/api/suggest-meal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remainingKcal: Math.max(0, targets.kcal - totals.kcal),
          remainingProtein: Math.max(0, targets.protein - totals.protein),
          remainingCarbs: Math.max(0, targets.carbs - totals.carbs),
          remainingFat: Math.max(0, targets.fat - totals.fat),
        }),
      })
      const result = await resp.json()
      setSuggestion(stripMarkdown(result.suggestion || 'No suggestion available.'))
    } catch {
      setSuggestion('Could not fetch suggestion. Check your connection.')
    }
    setSuggesting(false)
  }

  async function saveNutritionSettings() {
    setNsSaving(true)
    const f = nsForm
    const updates = { nutrition_mode: f.nutrition_mode }
    if (f.nutrition_mode === 'calories') {
      updates.kcal_target = Number(f.kcal_target)
      updates.protein_pct = Number(f.protein_pct); updates.carbs_pct = Number(f.carbs_pct); updates.fat_pct = Number(f.fat_pct)
      updates.protein_target_g = Math.round((updates.kcal_target * updates.protein_pct / 100) / 4)
      updates.carbs_target_g = Math.round((updates.kcal_target * updates.carbs_pct / 100) / 4)
      updates.fat_target_g = Math.round((updates.kcal_target * updates.fat_pct / 100) / 9)
    } else {
      updates.protein_target_g = Number(f.protein_target_g); updates.carbs_target_g = Number(f.carbs_target_g); updates.fat_target_g = Number(f.fat_target_g)
      updates.kcal_target = Math.round(updates.protein_target_g * 4 + updates.carbs_target_g * 4 + updates.fat_target_g * 9)
    }
    await saveSettings(updates)
    setShowSettings(false); setNsSaving(false)
  }

  const nsPctSum = Number(nsForm.protein_pct) + Number(nsForm.carbs_pct) + Number(nsForm.fat_pct)

  // ── Macro tiles ───────────────────────────────────────────────────────────
  const macroTileDefs = [
    { key: 'kcal', label: 'Calories', value: Math.round(totals.kcal), target: targets.kcal, suffix: ' kcal' },
    { key: 'protein', label: 'Protein', value: Math.round(totals.protein), target: targets.protein, suffix: 'g' },
    { key: 'carbs', label: 'Carbs', value: Math.round(totals.carbs), target: targets.carbs, suffix: 'g' },
    { key: 'fat', label: 'Fat', value: Math.round(totals.fat), target: targets.fat, suffix: 'g' },
  ]

  // ── Macro trend chart ─────────────────────────────────────────────────────
  const [macroView, setMacroView] = useState('protein')
  const macroViewMeta = useMemo(() => ({
    protein: { field: 'protein_g', target: targets.protein, label: 'Protein', unit: 'g' },
    carbs: { field: 'carbs_g', target: targets.carbs, label: 'Carbs', unit: 'g' },
    fat: { field: 'fat_g', target: targets.fat, label: 'Fat', unit: 'g' },
    calories: { field: 'kcal', target: targets.kcal, label: 'Calories', unit: ' kcal' },
  }), [targets])
  const byDate = useMemo(() => {
    const map = {}
    for (const m of meals) {
      const t = (map[m.date] ||= { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })
      t.kcal += m.kcal || 0; t.protein_g += m.protein_g || 0; t.carbs_g += m.carbs_g || 0; t.fat_g += m.fat_g || 0
    }
    return map
  }, [meals])
  const macroTrendData = useMemo(() => {
    const meta = macroViewMeta[macroView]
    return lastNDates(14).map(d => ({
      label: fmtShort(d),
      v: byDate[d] ? Math.round(byDate[d][meta.field]) : null,
    }))
  }, [byDate, macroView, macroViewMeta])
  const macroTrendHasData = macroTrendData.some(d => d.v != null)

  // ── Maintenance signal sparklines (14d) ───────────────────────────────────
  const calSpark = useMemo(() => lastNDates(14).map(d => byDate[d] ? Math.round(byDate[d].kcal) : null).filter(v => v != null), [byDate])
  const weightSpark = useMemo(() => {
    const cutoff = shiftDate(localDate(), -14)
    return [...weightLogs].filter(l => l.date >= cutoff).sort((a, b) => a.date.localeCompare(b.date)).map(l => l.weight_kg)
  }, [weightLogs])

  // Jump the top logger to a given day (from the weekly view's "View").
  function viewDay(dateStr) {
    setSelectedDate(dateStr)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Meal library (all dates, searchable, collapsible) ─────────────────────
  const [query, setQuery] = useState('')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const library = useMemo(() => {
    const q = query.trim().toLowerCase()
    return meals.filter(m => !q || (m.description || '').toLowerCase().includes(q))
  }, [meals, query])

  const dateLabel = fmtLongDate(selectedDate)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header: backdating date picker + actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <label
          className="flex items-center gap-2 rounded-lg cursor-pointer"
          style={{ background: C.card, border: `1px solid ${C.border}`, padding: '8px 12px', fontSize: 12.5, color: C.text3 }}
        >
          Logging for:
          <span className="font-semibold" style={{ color: C.text }}>{dateLabel}</span>
          <input
            type="date" value={selectedDate} max={localDate()}
            onChange={e => e.target.value && setSelectedDate(e.target.value)}
            className="bg-transparent outline-none cursor-pointer"
            style={{ color: C.text3, fontSize: 12, colorScheme: 'dark' }}
          />
        </label>
        <div className="flex items-center gap-2.5">
          <button onClick={() => { setNsForm({ ...settings }); setShowSettings(true) }} className="rounded-lg transition-colors"
            style={{ border: `1px solid ${C.border}`, color: C.text3, fontSize: 13, padding: '8px 12px' }}>Targets</button>
          <OutlineButton onClick={suggestMeal} disabled={suggesting}>{suggesting ? 'Thinking…' : 'Suggest a meal'}</OutlineButton>
          <EmeraldButton onClick={() => { setMealInput(''); setMealStep('input'); setMealMode('ai'); setMealForm(EMPTY_MEAL); fetchRecent(); setShowAdd(true) }}>+ Add meal</EmeraldButton>
        </div>
      </div>

      {suggestion && (
        <HCard style={{ padding: '14px 18px', borderLeft: `2px solid ${C.emerald}` }}>
          <Eyebrow style={{ marginBottom: 6 }}>Meal suggestion</Eyebrow>
          <div style={{ fontSize: 13, color: C.text2, whiteSpace: 'pre-line' }}>{suggestion}</div>
        </HCard>
      )}

      {/* Macro tiles */}
      <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        {macroTileDefs.map(m => {
          const badge = macroBadge(m.value, m.target, MACRO_KIND[m.key])
          const barPct = m.target ? Math.min(100, (m.value / m.target) * 100) : 0
          return (
            <HCard key={m.key} style={{ padding: 16 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <Eyebrow>{m.label}</Eyebrow>
                <span className="font-bold" style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 5, color: STATUS_COLOR[badge.status], background: STATUS_TINT[badge.status] }}>
                  {badge.pct}%
                </span>
              </div>
              <div className="font-bold" style={{ fontSize: 20, color: C.text }}>
                {m.value}<span style={{ fontSize: 13, color: C.label, fontWeight: 500 }}> / {m.target}{m.suffix}</span>
              </div>
              <div style={{ height: 5, background: '#1c2432', borderRadius: 3, marginTop: 10, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${barPct}%`, background: STATUS_COLOR[badge.status] }} />
              </div>
            </HCard>
          )
        })}
      </div>

      {/* Today's / selected day's meal log */}
      <HCard style={{ padding: '6px 20px' }}>
        <div className="grid" style={{ gridTemplateColumns: '70px 1fr 70px 50px 50px 50px', padding: '14px 0 8px', borderBottom: `1px solid ${C.border}` }}>
          {['Time', 'Meal', 'Kcal', 'P', 'C', 'F'].map(h => <Eyebrow key={h} style={{ fontSize: 10.5 }}>{h}</Eyebrow>)}
        </div>
        {dayMeals.length === 0 ? (
          <div style={{ padding: '18px 0', fontSize: 13, color: C.label }}>No meals logged for {dateLabel.toLowerCase()}.</div>
        ) : dayMeals.map(meal => (
          <div key={meal.id} className="grid items-center group" style={{ gridTemplateColumns: '70px 1fr 70px 50px 50px 50px', padding: '12px 0', borderBottom: `1px solid ${C.divider}`, fontSize: 13, position: 'relative' }}>
            <span style={{ color: C.label }}>{meal.time?.slice(0, 5) || '—'}</span>
            <span style={{ color: C.text }} className="truncate pr-2">{meal.description}</span>
            <span style={{ color: C.text2 }}>{Math.round(meal.kcal || 0)}</span>
            <span style={{ color: C.emerald }}>{Math.round(meal.protein_g || 0)}g</span>
            <span style={{ color: C.text2 }}>{Math.round(meal.carbs_g || 0)}g</span>
            <span style={{ color: C.text2 }} className="relative">
              {Math.round(meal.fat_g || 0)}g
              <span className="absolute right-0 top-1/2 -translate-y-1/2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: C.card, paddingLeft: 8 }}>
                <button onClick={() => { setEditingId(meal.id); setEditForm({ description: meal.description, kcal: String(meal.kcal || ''), protein_g: String(meal.protein_g || ''), carbs_g: String(meal.carbs_g || ''), fat_g: String(meal.fat_g || ''), logged_at: meal.time?.slice(0, 5) || '' }); setShowEdit(true) }}
                  className="uppercase tracking-widest" style={{ fontSize: 10, color: C.text3 }}>Edit</button>
                <button onClick={() => deleteMeal(meal.id)} className="uppercase tracking-widest" style={{ fontSize: 10, color: C.text3 }}>Del</button>
              </span>
            </span>
          </div>
        ))}
      </HCard>

      {/* Weekly nutrition */}
      <WeeklyNutrition meals={meals} targets={targets} onViewDay={viewDay} />

      {/* Two-up: macro trend + maintenance signal */}
      <div className="grid gap-3.5" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
        <HCard style={{ padding: '18px 20px' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
            <CardTitle>Protein &amp; macro trend</CardTitle>
            <PillToggle size="sm" value={macroView}
              onChange={setMacroView}
              options={[{ value: 'protein', label: 'Protein' }, { value: 'carbs', label: 'Carbs' }, { value: 'fat', label: 'Fat' }, { value: 'calories', label: 'Calories' }]} />
          </div>
          {macroTrendHasData ? (
            <>
              <ResponsiveContainer width="100%" height={130}>
                <LineChart data={macroTrendData} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                  <XAxis dataKey="label" tick={{ fill: C.faint, fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={30} />
                  <YAxis hide domain={['dataMin - 10', 'dataMax + 10']} />
                  <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11 }} labelStyle={{ color: C.label }} />
                  <ReferenceLine y={macroViewMeta[macroView].target} stroke={C.amber} strokeDasharray="5 4" />
                  <Line type="monotone" dataKey="v" stroke={C.emerald} strokeWidth={2.5} dot={false} connectNulls name={macroViewMeta[macroView].label} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
              <div style={{ fontSize: 11.5, color: C.label, marginTop: 6 }}>
                Dashed line = daily target ({macroViewMeta[macroView].target}{macroViewMeta[macroView].unit})
              </div>
            </>
          ) : <NoData height={130} label="No meals logged yet — trend appears once you log a few days" />}
        </HCard>

        <HCard style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <CardTitle>Maintenance calorie signal</CardTitle>
          <div>
            <div style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>Calories in — 14d</div>
            <Sparkline data={calSpark} color={C.amber} height={40} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>Weight trend — 14d</div>
            <Sparkline data={weightSpark} color={C.emerald} height={40} />
          </div>
          <div style={{ fontSize: 11.5, color: C.label }}>
            Full cross-referenced maintenance estimate on{' '}
            <button onClick={() => onOpenSub?.('insights')} style={{ color: C.emeraldLink }}>Insights →</button>
          </div>
        </HCard>
      </div>

      {/* Meal prep calculator */}
      <MealPrepCalculator targets={targets} />

      {/* Meal library (collapsible) */}
      <HCard style={{ padding: '18px 20px' }}>
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => setLibraryOpen(o => !o)} className="flex items-center gap-2" style={{ color: C.text }}>
            <span style={{ fontSize: 11, color: C.text3, transform: libraryOpen ? 'rotate(90deg)' : 'none', transition: 'transform 150ms', display: 'inline-block' }}>▸</span>
            <CardTitle>Meal library</CardTitle>
            <span style={{ fontSize: 11.5, color: C.faint }}>· {meals.length} meal{meals.length === 1 ? '' : 's'}</span>
          </button>
          {libraryOpen && (
            <input
              value={query} onChange={e => setQuery(e.target.value)} placeholder="Search meals…"
              className={searchCls} onFocus={focusRing} onBlur={blurRing}
              style={{ background: C.cardNested, border: `1px solid ${C.border}`, padding: '7px 12px', color: C.text, width: 220 }}
            />
          )}
        </div>
        {libraryOpen && (
          <div style={{ marginTop: 12 }}>
            <div className="grid" style={{ gridTemplateColumns: '80px 1fr 70px 50px 50px 50px', padding: '0 0 8px', borderBottom: `1px solid ${C.border}` }}>
              {['Date', 'Meal', 'Kcal', 'P', 'C', 'F'].map(h => <Eyebrow key={h} style={{ fontSize: 10.5 }}>{h}</Eyebrow>)}
            </div>
            {library.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12.5, color: C.label }}>
                {query ? `No meals match "${query}"` : 'No meals logged yet.'}
              </div>
            ) : library.slice(0, 200).map(m => (
              <div key={m.id} className="grid items-center" style={{ gridTemplateColumns: '80px 1fr 70px 50px 50px 50px', padding: '10px 0', borderBottom: `1px solid ${C.divider}`, fontSize: 13 }}>
                <span style={{ color: C.label }}>{fmtShort(m.date)}</span>
                <span style={{ color: C.text }} className="truncate pr-2">{m.description}</span>
                <span style={{ color: C.text2 }}>{Math.round(m.kcal || 0)}</span>
                <span style={{ color: C.emerald }}>{Math.round(m.protein_g || 0)}g</span>
                <span style={{ color: C.text2 }}>{Math.round(m.carbs_g || 0)}g</span>
                <span style={{ color: C.text2 }}>{Math.round(m.fat_g || 0)}g</span>
              </div>
            ))}
          </div>
        )}
      </HCard>

      {/* ── Add meal modal ─────────────────────────────────────────────────── */}
      {showAdd && (
        <Modal
          title={`Add Meal · ${dateLabel}`}
          onClose={() => { setShowAdd(false); setMealStep('input'); setMealMode('ai') }}
          onSave={mealMode === 'ai' ? (mealStep === 'input' ? estimateMeal : saveMeal) : mealMode === 'manual' ? saveMeal : undefined}
          saveLabel={mealMode === 'ai' ? (mealStep === 'input' ? 'Estimate' : 'Save Meal') : 'Save Meal'}
          saveDisabled={mealMode === 'ai' ? (mealStep === 'input' ? (mealEstimating || !mealInput.trim()) : (mealSaving || !mealForm.description || !mealForm.kcal)) : mealSaving || !mealForm.description || !mealForm.kcal}
          saving={mealMode === 'ai' ? (mealStep === 'input' ? mealEstimating : mealSaving) : mealSaving}
          hideSave={mealMode === 'recent'}
          cancelLabel={mealMode === 'recent' ? 'Close' : 'Cancel'}
        >
          {!(mealMode === 'ai' && mealStep === 'review') && (
            <div className="flex items-center bg-gray-800 rounded p-0.5">
              {[{ key: 'ai', label: 'AI Estimate' }, { key: 'manual', label: 'Manual' }, { key: 'recent', label: 'Recent' }].map(({ key, label }) => (
                <button key={key} onClick={() => { setMealMode(key); if (key === 'ai') setMealStep('input'); if (key === 'manual') setMealForm(EMPTY_MEAL) }}
                  className={`flex-1 px-3 py-1.5 text-xs tracking-widest uppercase rounded transition-colors ${mealMode === key ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'}`}>{label}</button>
              ))}
            </div>
          )}
          {mealMode === 'ai' && (mealStep === 'input' ? (
            <div>
              <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">What did you eat?</label>
              <textarea value={mealInput} onChange={e => setMealInput(e.target.value)} rows={3}
                placeholder="e.g. 'chicken breast with rice and broccoli, about 200g chicken' or 'same lunch as yesterday'"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm placeholder-gray-700 focus:outline-none focus:border-emerald-400 resize-none" />
              <div className="mt-2 text-xs text-gray-600">Claude will estimate the macros. You can review and adjust before saving.</div>
            </div>
          ) : (
            <MealFields form={mealForm} setForm={setMealForm} onBack={() => setMealStep('input')} />
          ))}
          {mealMode === 'manual' && <MealFields form={mealForm} setForm={setMealForm} manual />}
          {mealMode === 'recent' && (
            recentLoading ? <div className="text-sm text-gray-600 py-2">Loading recent meals…</div>
              : recentMeals.length === 0 ? <div className="text-sm text-gray-600 py-2">No meals logged in the last 7 days.</div>
                : (
                  <div className="space-y-1">
                    <div className="text-xs text-gray-600 mb-3">Select a meal to pre-fill the manual form.</div>
                    {recentMeals.map(meal => (
                      <button key={meal.id} onClick={() => { setMealForm({ description: meal.description, kcal: String(meal.kcal || ''), protein_g: String(meal.protein_g || ''), carbs_g: String(meal.carbs_g || ''), fat_g: String(meal.fat_g || ''), logged_at: localTime() }); setMealMode('manual') }}
                        className="w-full text-left px-3 py-2.5 bg-gray-800 hover:bg-gray-700 rounded transition-colors">
                        <div className="text-sm text-white truncate">{meal.description}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {meal.kcal != null && `${Math.round(meal.kcal)} kcal`}{meal.protein_g != null && ` · ${Math.round(meal.protein_g)}g protein`}
                        </div>
                      </button>
                    ))}
                  </div>
                )
          )}
        </Modal>
      )}

      {/* ── Edit meal modal ────────────────────────────────────────────────── */}
      {showEdit && (
        <Modal title="Edit Meal" onClose={() => { setShowEdit(false); setEditingId(null) }} onSave={saveEditMeal}
          saveLabel="Save" saveDisabled={editSaving || !editForm.description || !editForm.kcal} saving={editSaving}>
          <MealFields form={editForm} setForm={setEditForm} manual />
        </Modal>
      )}

      {/* ── Nutrition targets modal ────────────────────────────────────────── */}
      {showSettings && (
        <Modal title="Nutrition Targets" onClose={() => setShowSettings(false)} onSave={saveNutritionSettings}
          saveLabel="Save" saveDisabled={nsSaving || (nsForm.nutrition_mode === 'calories' && nsPctSum !== 100)} saving={nsSaving}>
          <div className="space-y-4">
            <div>
              <label className="text-sm tracking-widest uppercase text-gray-400 block mb-2">Mode</label>
              <div className="flex items-center bg-gray-800 rounded p-0.5 w-fit">
                {['calories', 'macros'].map(mode => (
                  <button key={mode} onClick={() => setNsForm(f => ({ ...f, nutrition_mode: mode }))}
                    className={`px-4 py-1.5 text-xs tracking-widest uppercase rounded transition-colors ${nsForm.nutrition_mode === mode ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'}`}>{mode}</button>
                ))}
              </div>
            </div>
            {nsForm.nutrition_mode === 'calories' ? (
              <>
                <div>
                  <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Daily Calorie Target</label>
                  <input type="number" value={nsForm.kcal_target} onChange={e => setNsForm(f => ({ ...f, kcal_target: e.target.value }))} className={`w-full ${inputCls}`} />
                </div>
                <div>
                  <label className="text-sm tracking-widest uppercase text-gray-400 block mb-2">Macro Split %</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[{ key: 'protein_pct', label: 'Protein' }, { key: 'carbs_pct', label: 'Carbs' }, { key: 'fat_pct', label: 'Fat' }].map(({ key, label }) => (
                      <div key={key}>
                        <div className="text-xs text-gray-500 mb-1">{label}</div>
                        <input type="number" value={nsForm[key]} onChange={e => setNsForm(f => ({ ...f, [key]: e.target.value }))} className={`w-full ${inputCls}`} />
                      </div>
                    ))}
                  </div>
                  <div className={`text-xs mt-1 ${nsPctSum === 100 ? 'text-emerald-400' : 'text-red-400'}`}>Total: {nsPctSum}% {nsPctSum !== 100 && '(must equal 100%)'}</div>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {[{ key: 'protein_target_g', label: 'Protein (g)' }, { key: 'carbs_target_g', label: 'Carbs (g)' }, { key: 'fat_target_g', label: 'Fat (g)' }].map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">{label}</label>
                    <input type="number" value={nsForm[key]} onChange={e => setNsForm(f => ({ ...f, [key]: e.target.value }))} className={`w-full ${inputCls}`} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

// Shared macro input fields used by add (review) / manual / edit.
function MealFields({ form, setForm, manual, onBack }) {
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  return (
    <div className="space-y-3">
      {!manual && <div className="text-xs text-gray-500">Review and adjust the estimated values before saving.</div>}
      <div>
        <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Description</label>
        <input value={form.description} onChange={e => set('description', e.target.value)} className={`w-full ${inputCls}`} />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Time</label>
          <input type="time" value={form.logged_at} onChange={e => set('logged_at', e.target.value)} className={`w-full ${inputCls}`} />
        </div>
        <div className="flex-1">
          <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Calories</label>
          <input type="number" value={form.kcal} onChange={e => set('kcal', e.target.value)} className={`w-full ${inputCls}`} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[{ k: 'protein_g', l: 'Protein (g)' }, { k: 'carbs_g', l: 'Carbs (g)' }, { k: 'fat_g', l: 'Fat (g)' }].map(({ k, l }) => (
          <div key={k}>
            <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">{l}</label>
            <input type="number" value={form[k]} onChange={e => set(k, e.target.value)} className={`w-full ${inputCls}`} />
          </div>
        ))}
      </div>
      {onBack && <button onClick={onBack} className="text-xs text-gray-500 hover:text-white tracking-widest uppercase transition-colors">← Back</button>}
    </div>
  )
}

// ── Weekly nutrition (carried over from the old flat page) ──────────────────
// Mon–Sun macro table with per-day adherence bars and a week average, derived
// from the shared meal list. "View" jumps the top logger to that day.
function WeekMacroCell({ value, target, kind, suffix }) {
  const badge = macroBadge(value, target, kind)
  const color = STATUS_COLOR[badge.status]
  const w = target ? Math.min(100, (value / target) * 100) : 0
  return (
    <div>
      <div style={{ fontSize: 12.5, color }}>
        {Math.round(value)}{suffix} <span style={{ color: C.faint }}>/ {target}{suffix}</span>
      </div>
      <div style={{ height: 4, background: '#1c2432', borderRadius: 2, marginTop: 5, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${w}%`, background: color }} />
      </div>
    </div>
  )
}

const WEEK_COLS = '128px 1fr 1fr 1fr 1fr 62px'
const WEEK_MACROS = [
  { key: 'kcal', target: 'kcal', kind: 'max', suffix: '' },
  { key: 'protein', target: 'protein', kind: 'min', suffix: 'g' },
  { key: 'carbs', target: 'carbs', kind: 'min', suffix: 'g' },
  { key: 'fat', target: 'fat', kind: 'max', suffix: 'g' },
]

function WeeklyNutrition({ meals, targets, onViewDay }) {
  const [offset, setOffset] = useState(0)
  const week = useMemo(() => getWeekDatesForOffset(offset), [offset])
  const byDate = useMemo(() => {
    const map = {}
    for (const m of meals) (map[m.date] ||= []).push(m)
    return map
  }, [meals])

  const rows = week.map(d => ({ ...d, meals: byDate[d.dateStr] || [], totals: mealTotals(byDate[d.dateStr] || []) }))
  const logged = rows.filter(r => r.meals.length > 0)
  const weekAvg = logged.length
    ? logged.reduce((a, r) => ({ kcal: a.kcal + r.totals.kcal / logged.length, protein: a.protein + r.totals.protein / logged.length, carbs: a.carbs + r.totals.carbs / logged.length, fat: a.fat + r.totals.fat / logged.length }), { kcal: 0, protein: 0, carbs: 0, fat: 0 })
    : null
  const today = localDate()

  return (
    <HCard style={{ padding: '18px 20px' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
        <CardTitle>Weekly nutrition</CardTitle>
        <div className="flex items-center gap-2" style={{ color: C.text3 }}>
          <button onClick={() => setOffset(o => o - 1)} style={{ fontSize: 15, padding: '0 6px' }}>←</button>
          <span style={{ fontSize: 12, minWidth: 118, textAlign: 'center' }}>{week[0].dayLabel} – {week[6].dayLabel}</span>
          <button onClick={() => setOffset(o => o + 1)} disabled={offset >= 0} className="disabled:opacity-30" style={{ fontSize: 15, padding: '0 6px' }}>→</button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: WEEK_COLS, padding: '0 0 8px', borderBottom: `1px solid ${C.border}` }}>
        {['Day', 'Calories', 'Protein', 'Carbs', 'Fat', ''].map((h, i) => <Eyebrow key={i} style={{ fontSize: 10.5 }}>{h}</Eyebrow>)}
      </div>

      {rows.map(r => (
        <div key={r.dateStr} className="grid items-center" style={{ gridTemplateColumns: WEEK_COLS, padding: '11px 0', borderBottom: `1px solid ${C.divider}`, background: r.dateStr === today ? 'rgba(16,185,129,0.04)' : 'transparent' }}>
          <div>
            <div style={{ fontSize: 12.5, color: C.text }}>{r.label} <span style={{ color: C.label }}>{r.dayLabel.split(' ')[0]}</span></div>
            <div style={{ fontSize: 10.5, color: C.faint, marginTop: 1 }}>{r.meals.length ? `${r.meals.length} meal${r.meals.length === 1 ? '' : 's'}` : '—'}</div>
          </div>
          {r.meals.length ? (
            WEEK_MACROS.map(m => (
              <div key={m.key} style={{ paddingRight: 14 }}>
                <WeekMacroCell value={r.totals[m.key]} target={targets[m.target]} kind={m.kind} suffix={m.suffix} />
              </div>
            ))
          ) : (
            [0, 1, 2, 3].map(i => <span key={i} style={{ fontSize: 12.5, color: C.faint }}>—</span>)
          )}
          <div className="flex justify-end">
            <button onClick={() => r.meals.length && onViewDay(r.dateStr)} disabled={!r.meals.length}
              className="rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ border: `1px solid ${C.border}`, color: C.text3, fontSize: 11, padding: '4px 10px' }}>View</button>
          </div>
        </div>
      ))}

      {weekAvg && (
        <div className="grid items-center" style={{ gridTemplateColumns: WEEK_COLS, padding: '12px 0 2px', borderTop: `1px solid ${C.border}`, marginTop: 4 }}>
          <Eyebrow style={{ fontSize: 10.5 }}>Avg</Eyebrow>
          {WEEK_MACROS.map(m => (
            <div key={m.key} style={{ paddingRight: 14 }}>
              <WeekMacroCell value={weekAvg[m.key]} target={targets[m.target]} kind={m.kind} suffix={m.suffix} />
            </div>
          ))}
          <span />
        </div>
      )}
    </HCard>
  )
}

// ── Meal prep calculator ────────────────────────────────────────────────────
// Ingredient rows scale a per-100 (g/ml) or per-unit macro lookup. Totals and a
// colour-coded gap-to-target row update live. Ingredient library + saved plans
// persist to Supabase (meal_prep.sql); degrades to a clean notice until then.
const gramFactor = (unit, qty) => (unit === 'unit' ? qty : qty / 100)
function rowMacros(row) {
  const f = gramFactor(row.unit, Number(row.qty) || 0)
  return {
    kcal: (Number(row.kcal_per_100) || 0) * f,
    p: (Number(row.protein_per_100) || 0) * f,
    c: (Number(row.carbs_per_100) || 0) * f,
    fat: (Number(row.fat_per_100) || 0) * f,
  }
}
const gapColor = (total, target) => {
  if (!target) return C.label
  const r = total / target
  if (r >= 0.92 && r <= 1.08) return C.emerald
  if (r < 0.92) return C.amber
  return C.red
}

function MealPrepCalculator({ targets }) {
  const [available, setAvailable] = useState(true)
  const [library, setLibrary] = useState([])
  const [plans, setPlans] = useState([])
  const [planId, setPlanId] = useState(null)
  const [planName, setPlanName] = useState('')
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [addTab, setAddTab] = useState('library')
  const [addQuery, setAddQuery] = useState('')
  const [newIng, setNewIng] = useState({ name: '', unit: 'g', kcal_per_100: '', protein_per_100: '', carbs_per_100: '', fat_per_100: '' })

  const loadPlanItems = useCallback(async (id) => {
    const { data } = await supabase.from('meal_prep_plan_items').select('*').eq('plan_id', id).order('sort_order')
    setItems((data || []).map(r => ({ ...r, qty: r.qty })))
  }, [])

  const load = useCallback(async () => {
    const [{ data: lib, error: e1 }, { data: pl }] = await Promise.all([
      supabase.from('ingredient_library').select('*').order('name'),
      supabase.from('meal_prep_plans').select('*').order('updated_at', { ascending: false }),
    ])
    if (e1) { setAvailable(false); return }
    setLibrary(lib || [])
    setPlans(pl || [])
    if (pl && pl.length) { setPlanId(pl[0].id); setPlanName(pl[0].name); loadPlanItems(pl[0].id) }
  }, [loadPlanItems])

  useEffect(() => { load() }, [load])

  const totals = items.reduce((a, r) => {
    const m = rowMacros(r)
    return { kcal: a.kcal + m.kcal, p: a.p + m.p, c: a.c + m.c, fat: a.fat + m.fat }
  }, { kcal: 0, p: 0, c: 0, fat: 0 })

  function addFromLibrary(ing) {
    setItems(prev => [...prev, {
      tempId: crypto.randomUUID(), ingredient_id: ing.id, name: ing.name, unit: ing.unit,
      qty: ing.unit === 'unit' ? 1 : 100,
      kcal_per_100: ing.kcal_per_100, protein_per_100: ing.protein_per_100, carbs_per_100: ing.carbs_per_100, fat_per_100: ing.fat_per_100,
    }])
    setShowAdd(false); setAddQuery('')
  }
  async function createIngredient() {
    if (!newIng.name.trim()) return
    const payload = {
      name: newIng.name.trim(), unit: newIng.unit,
      kcal_per_100: Number(newIng.kcal_per_100) || 0, protein_per_100: Number(newIng.protein_per_100) || 0,
      carbs_per_100: Number(newIng.carbs_per_100) || 0, fat_per_100: Number(newIng.fat_per_100) || 0,
    }
    const { data, error } = await supabase.from('ingredient_library').insert(payload).select().single()
    if (error) { setAvailable(false); return }
    setLibrary(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    addFromLibrary(data)
    setNewIng({ name: '', unit: 'g', kcal_per_100: '', protein_per_100: '', carbs_per_100: '', fat_per_100: '' })
  }
  const updateQty = (i, qty) => setItems(prev => prev.map((r, idx) => idx === i ? { ...r, qty } : r))
  const removeRow = i => setItems(prev => prev.filter((_, idx) => idx !== i))

  async function savePlan() {
    setSaving(true)
    const name = planName.trim() || 'Untitled plan'
    let id = planId
    if (id) {
      await supabase.from('meal_prep_plans').update({ name, updated_at: new Date().toISOString() }).eq('id', id)
      await supabase.from('meal_prep_plan_items').delete().eq('plan_id', id)
    } else {
      const { data } = await supabase.from('meal_prep_plans').insert({ name }).select().single()
      id = data?.id; setPlanId(id)
    }
    if (id) {
      const rows = items.map((r, idx) => ({
        plan_id: id, ingredient_id: r.ingredient_id ?? null, name: r.name, unit: r.unit, qty: Number(r.qty) || 0,
        kcal_per_100: r.kcal_per_100, protein_per_100: r.protein_per_100, carbs_per_100: r.carbs_per_100, fat_per_100: r.fat_per_100, sort_order: idx,
      }))
      if (rows.length) await supabase.from('meal_prep_plan_items').insert(rows)
      const { data: pl } = await supabase.from('meal_prep_plans').select('*').order('updated_at', { ascending: false })
      setPlans(pl || [])
    }
    setSaving(false)
  }
  function newPlan() { setPlanId(null); setPlanName(''); setItems([]) }
  function selectPlan(id) {
    const p = plans.find(x => x.id === id)
    if (!p) { newPlan(); return }
    setPlanId(p.id); setPlanName(p.name); loadPlanItems(p.id)
  }

  const filteredLib = library.filter(i => !addQuery.trim() || i.name.toLowerCase().includes(addQuery.trim().toLowerCase()))
  const cols = '1.4fr 84px 60px 56px 56px 56px 28px'

  if (!available) {
    return (
      <HCard style={{ padding: '18px 20px' }}>
        <CardTitle>Meal prep calculator</CardTitle>
        <div style={{ fontSize: 12.5, color: C.label, marginTop: 8 }}>
          Run the <span style={{ color: C.text2 }}>sql/meal_prep.sql</span> migration in Supabase to enable the ingredient
          library and saved plans. Once the tables exist this calculator activates automatically.
        </div>
      </HCard>
    )
  }

  return (
    <HCard style={{ padding: '18px 20px' }}>
      <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginBottom: 4 }}>
        <CardTitle>Meal prep calculator</CardTitle>
        <div className="flex items-center gap-2">
          {plans.length > 0 && (
            <select value={planId || ''} onChange={e => selectPlan(e.target.value)}
              className="rounded-lg" style={{ background: C.cardNested, border: `1px solid ${C.border}`, color: C.text2, fontSize: 12, padding: '5px 8px' }}>
              <option value="">New plan…</option>
              {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <input value={planName} onChange={e => setPlanName(e.target.value)} placeholder="Plan name"
            className="rounded-lg" onFocus={focusRing} onBlur={blurRing}
            style={{ background: C.cardNested, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, padding: '5px 10px', width: 140 }} />
          <button onClick={newPlan} className="rounded-lg" style={{ border: `1px solid ${C.border}`, color: C.text3, fontSize: 12, padding: '5px 10px' }}>New</button>
          <button onClick={savePlan} disabled={saving} className="rounded-lg font-semibold disabled:opacity-50" style={{ background: C.emerald, color: '#06120c', fontSize: 12, padding: '5px 12px' }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      <div style={{ fontSize: 12, color: C.label, marginBottom: 14 }}>
        Target: {targets.protein}g P / {targets.carbs}g C / {targets.fat}g F · {targets.kcal} kcal
      </div>

      <div className="grid" style={{ gridTemplateColumns: cols, padding: '0 0 8px', borderBottom: `1px solid ${C.border}` }}>
        {['Ingredient', 'Qty', 'Kcal', 'P', 'C', 'F', ''].map((h, i) => <Eyebrow key={i} style={{ fontSize: 10.5 }}>{h}</Eyebrow>)}
      </div>

      {items.length === 0 ? (
        <div style={{ padding: '16px 0', fontSize: 12.5, color: C.label }}>No ingredients yet — add one to start planning.</div>
      ) : items.map((row, i) => {
        const m = rowMacros(row)
        return (
          <div key={row.id || row.tempId} className="grid items-center" style={{ gridTemplateColumns: cols, padding: '9px 0', borderBottom: `1px solid ${C.divider}`, fontSize: 13 }}>
            <span style={{ color: C.text }} className="truncate pr-2">{row.name}</span>
            <span className="flex items-center gap-1">
              <input type="number" value={row.qty} onChange={e => updateQty(i, e.target.value)}
                className="rounded" style={{ width: 52, background: C.cardNested, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, padding: '3px 6px' }} />
              <span style={{ color: C.faint, fontSize: 11 }}>{row.unit}</span>
            </span>
            <span style={{ color: C.text2 }}>{Math.round(m.kcal)}</span>
            <span style={{ color: C.text2 }}>{Math.round(m.p)}</span>
            <span style={{ color: C.text2 }}>{Math.round(m.c)}</span>
            <span style={{ color: C.text2 }}>{Math.round(m.fat)}</span>
            <button onClick={() => removeRow(i)} style={{ color: C.faint, fontSize: 14 }}>×</button>
          </div>
        )
      })}

      <button onClick={() => { setShowAdd(true); setAddTab('library') }} className="mt-3" style={{ color: C.emeraldLink, fontSize: 12.5 }}>+ Add ingredient</button>

      {/* Totals + remaining-vs-target */}
      <div className="grid items-center" style={{ gridTemplateColumns: cols, padding: '12px 0 4px', fontSize: 13, fontWeight: 700, borderTop: `1px solid ${C.border}`, marginTop: 8 }}>
        <span style={{ color: C.text }}>Totals</span><span />
        <span style={{ color: C.text }}>{Math.round(totals.kcal)}</span>
        <span style={{ color: C.text }}>{Math.round(totals.p)}</span>
        <span style={{ color: C.text }}>{Math.round(totals.c)}</span>
        <span style={{ color: C.text }}>{Math.round(totals.fat)}</span><span />
      </div>
      <div className="grid items-center" style={{ gridTemplateColumns: cols, padding: '4px 0 0', fontSize: 12.5, fontWeight: 600 }}>
        <span style={{ color: C.label }}>Remaining vs target</span><span />
        <span style={{ color: gapColor(totals.kcal, targets.kcal) }}>{Math.round(targets.kcal - totals.kcal)}</span>
        <span style={{ color: gapColor(totals.p, targets.protein) }}>{Math.round(targets.protein - totals.p)}</span>
        <span style={{ color: gapColor(totals.c, targets.carbs) }}>{Math.round(targets.carbs - totals.c)}</span>
        <span style={{ color: gapColor(totals.fat, targets.fat) }}>{Math.round(targets.fat - totals.fat)}</span><span />
      </div>

      {/* Add ingredient modal */}
      {showAdd && (
        <Modal title="Add Ingredient" onClose={() => setShowAdd(false)} hideSave cancelLabel="Close">
          <div className="flex items-center bg-gray-800 rounded p-0.5">
            {[{ k: 'library', l: 'From Library' }, { k: 'new', l: 'New Ingredient' }].map(({ k, l }) => (
              <button key={k} onClick={() => setAddTab(k)} className={`flex-1 px-3 py-1.5 text-xs tracking-widest uppercase rounded transition-colors ${addTab === k ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'}`}>{l}</button>
            ))}
          </div>
          {addTab === 'library' ? (
            <div className="mt-3">
              <input value={addQuery} onChange={e => setAddQuery(e.target.value)} placeholder="Search ingredients…" className={`w-full ${inputCls} mb-2`} />
              {filteredLib.length === 0 ? (
                <div className="text-sm text-gray-600 py-3 text-center">No ingredients yet — add one on the New tab.</div>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {filteredLib.map(ing => (
                    <button key={ing.id} onClick={() => addFromLibrary(ing)} className="w-full text-left px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded transition-colors">
                      <div className="text-sm text-white">{ing.name}</div>
                      <div className="text-xs text-gray-500">per 100{ing.unit === 'unit' ? ' unit' : ing.unit}: {ing.kcal_per_100} kcal · {ing.protein_per_100}P {ing.carbs_per_100}C {ing.fat_per_100}F</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <div>
                <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Name</label>
                <input value={newIng.name} onChange={e => setNewIng(f => ({ ...f, name: e.target.value }))} className={`w-full ${inputCls}`} placeholder="e.g. Chicken breast (raw)" />
              </div>
              <div>
                <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Unit</label>
                <div className="flex items-center bg-gray-800 rounded p-0.5 w-fit">
                  {['g', 'ml', 'unit'].map(u => (
                    <button key={u} onClick={() => setNewIng(f => ({ ...f, unit: u }))} className={`px-4 py-1.5 text-xs uppercase rounded transition-colors ${newIng.unit === u ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'}`}>{u}</button>
                  ))}
                </div>
                <div className="text-xs text-gray-600 mt-1">Macros are per 100{newIng.unit === 'unit' ? ' — enter per single unit' : newIng.unit}.</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[{ k: 'kcal_per_100', l: 'Kcal' }, { k: 'protein_per_100', l: 'Protein (g)' }, { k: 'carbs_per_100', l: 'Carbs (g)' }, { k: 'fat_per_100', l: 'Fat (g)' }].map(({ k, l }) => (
                  <div key={k}>
                    <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">{l}</label>
                    <input type="number" value={newIng[k]} onChange={e => setNewIng(f => ({ ...f, [k]: e.target.value }))} className={`w-full ${inputCls}`} />
                  </div>
                ))}
              </div>
              <button onClick={createIngredient} disabled={!newIng.name.trim()} className="w-full px-4 py-2 bg-emerald-400 text-gray-950 text-xs font-bold tracking-widest uppercase rounded hover:bg-emerald-300 transition-colors disabled:opacity-50">Add to plan &amp; library</button>
            </div>
          )}
        </Modal>
      )}
    </HCard>
  )
}
