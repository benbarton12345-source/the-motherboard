import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import {
  LineChart, Line, XAxis, YAxis, ReferenceLine,
  ResponsiveContainer, Tooltip, CartesianGrid,
} from 'recharts'
import Modal from './Modal'

// ── Date helpers (local components only — no toISOString)
function localDate() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function localTime() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function shiftDate(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function stripMarkdown(text) {
  return text
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^\*\s+/gm, '- ')
    .trim()
}

function fmtShort(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function getWeekDatesForOffset(offset = 0) {
  const today = new Date()
  const dow = today.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  const monday = new Date(today)
  monday.setDate(today.getDate() + diff + offset * 7)
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { label, dateStr, dayLabel: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }
  })
}

function macroColorCls(logged, target) {
  if (!target || logged === 0) return 'text-gray-500'
  const r = logged / target
  if (r >= 0.9 && r <= 1.1) return 'text-emerald-400'
  if ((r >= 0.6 && r < 0.9) || (r > 1.1 && r <= 1.3)) return 'text-amber-400'
  return 'text-red-400'
}

function macroBgCls(logged, target) {
  if (!target || logged === 0) return 'bg-gray-700'
  const r = logged / target
  if (r >= 0.9 && r <= 1.1) return 'bg-emerald-400'
  if ((r >= 0.6 && r < 0.9) || (r > 1.1 && r <= 1.3)) return 'bg-amber-400'
  return 'bg-red-400'
}

function fmtDayTitle(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const day = dt.toLocaleDateString('en-GB', { weekday: 'short' })
  const mon = dt.toLocaleDateString('en-GB', { month: 'short' })
  return `${day} ${d} ${mon}`
}

const WEEK_DATES = getWeekDatesForOffset(0)

const DEFAULT_SETTINGS = {
  weight_target_kg: null,
  nutrition_mode: 'calories',
  kcal_target: 2000,
  protein_target_g: 150,
  carbs_target_g: 200,
  fat_target_g: 70,
  protein_pct: 30,
  carbs_pct: 40,
  fat_pct: 30,
}

const inputCls = 'bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400'

// ── Small inline gear icon
function GearIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
    </svg>
  )
}

function ConnectBadge() {
  return (
    <span className="text-xs text-gray-600 border border-gray-700 rounded px-1.5 py-0.5 tracking-wider uppercase">
      Apple Health
    </span>
  )
}

// ── Recharts custom tooltip
function WeightTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-xs">
      <div className="text-gray-400 mb-1">{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color }}>{p.name}: {p.value} kg</div>
      ))}
    </div>
  )
}

export default function HealthPage() {
  // ── Weight state
  const [weightLogs, setWeightLogs] = useState([])
  const [weightRange, setWeightRange] = useState('90D')
  const [showWeightModal, setShowWeightModal] = useState(false)
  const [showWeightTargetModal, setShowWeightTargetModal] = useState(false)
  const [showWeightHistoryModal, setShowWeightHistoryModal] = useState(false)
  const [weightForm, setWeightForm] = useState({ date: localDate(), weight_kg: '', notes: '' })
  const [weightSaving, setWeightSaving] = useState(false)
  const [targetWeightForm, setTargetWeightForm] = useState('')
  const [editingWeightId, setEditingWeightId] = useState(null)
  const [editWeightForm, setEditWeightForm] = useState({ date: '', weight_kg: '', notes: '' })
  const [editWeightSaving, setEditWeightSaving] = useState(false)

  // ── Health settings
  const [healthSettings, setHealthSettings] = useState(DEFAULT_SETTINGS)
  const [settingsId, setSettingsId] = useState(null)

  // ── Nutrition / Meals state
  const [mealLogs, setMealLogs] = useState([])
  const [showAddMealModal, setShowAddMealModal] = useState(false)
  const [showEditMealModal, setShowEditMealModal] = useState(false)
  const [showNutritionSettingsModal, setShowNutritionSettingsModal] = useState(false)
  const [mealInput, setMealInput] = useState('')
  const [mealEstimating, setMealEstimating] = useState(false)
  const [mealStep, setMealStep] = useState('input') // 'input' | 'review'
  const [mealForm, setMealForm] = useState({ description: '', kcal: '', protein_g: '', carbs_g: '', fat_g: '', logged_at: localTime() })
  const [mealSaving, setMealSaving] = useState(false)
  const [editingMealId, setEditingMealId] = useState(null)
  const [editMealForm, setEditMealForm] = useState({ description: '', kcal: '', protein_g: '', carbs_g: '', fat_g: '', logged_at: '' })
  const [editMealSaving, setEditMealSaving] = useState(false)
  const [mealSuggestion, setMealSuggestion] = useState('')
  const [mealSuggesting, setMealSuggesting] = useState(false)
  const [nutritionSettingsForm, setNutritionSettingsForm] = useState({ ...DEFAULT_SETTINGS })
  const [nutritionSettingsSaving, setNutritionSettingsSaving] = useState(false)

  // ── Weekly Nutrition state
  const [weekOffset, setWeekOffset] = useState(0)
  const [weekMeals, setWeekMeals] = useState([])
  const [showDayModal, setShowDayModal] = useState(false)
  const [dayModalDate, setDayModalDate] = useState(null)
  const [dayModalEditingId, setDayModalEditingId] = useState(null)
  const [dayModalEditStep, setDayModalEditStep] = useState('review')
  const [dayModalEditInput, setDayModalEditInput] = useState('')
  const [dayModalEditForm, setDayModalEditForm] = useState({ description: '', kcal: '', protein_g: '', carbs_g: '', fat_g: '', logged_at: '' })
  const [dayModalEditSaving, setDayModalEditSaving] = useState(false)
  const [dayModalEditEstimating, setDayModalEditEstimating] = useState(false)
  const [dayModalAdding, setDayModalAdding] = useState(false)

  // ── Fetch data on mount
  useEffect(() => {
    fetchWeightLogs()
    fetchMealLogs()
    fetchHealthSettings()
  }, [])

  useEffect(() => {
    fetchWeekMeals(weekOffset)
  }, [weekOffset])

  async function fetchWeightLogs() {
    const { data } = await supabase
      .from('weight_logs').select('*').order('date', { ascending: false })
    if (data) setWeightLogs(data)
  }

  async function fetchMealLogs() {
    const { data } = await supabase
      .from('meal_logs').select('*').eq('date', localDate()).order('time', { ascending: true })
    if (data) setMealLogs(data)
  }

  async function fetchHealthSettings() {
    const { data } = await supabase.from('health_settings').select('*').limit(1).maybeSingle()
    if (data) {
      setSettingsId(data.id)
      const merged = { ...DEFAULT_SETTINGS, ...data }
      setHealthSettings(merged)
      setNutritionSettingsForm(merged)
      if (data.weight_target_kg != null) setTargetWeightForm(String(data.weight_target_kg))
    }
  }

  async function fetchWeekMeals(offset) {
    const dates = getWeekDatesForOffset(offset)
    const start = dates[0].dateStr
    const end = dates[6].dateStr
    const { data } = await supabase
      .from('meal_logs')
      .select('*')
      .gte('date', start)
      .lte('date', end)
      .order('time', { ascending: true })
    if (data) setWeekMeals(data)
  }

  async function persistHealthSettings(updates) {
    const merged = { ...healthSettings, ...updates }
    const { id: _id, ...payload } = merged
    if (settingsId) {
      const { error } = await supabase.from('health_settings').update(payload).eq('id', settingsId)
      if (error) console.error('health_settings update error:', error)
    } else {
      const { data, error } = await supabase.from('health_settings').insert(payload).select('id').maybeSingle()
      if (error) console.error('health_settings insert error:', error)
      if (data?.id) setSettingsId(data.id)
    }
    setHealthSettings(merged)
    setNutritionSettingsForm(merged)
  }

  // ── Weight CRUD
  async function saveWeight() {
    if (!weightForm.weight_kg) return
    setWeightSaving(true)
    await supabase.from('weight_logs').insert({
      date: weightForm.date,
      weight_kg: parseFloat(weightForm.weight_kg),
      notes: weightForm.notes || null,
    })
    setWeightForm({ date: localDate(), weight_kg: '', notes: '' })
    setShowWeightModal(false)
    await fetchWeightLogs()
    setWeightSaving(false)
  }

  async function saveWeightTarget() {
    await persistHealthSettings({
      weight_target_kg: targetWeightForm ? parseFloat(targetWeightForm) : null,
    })
    setShowWeightTargetModal(false)
  }

  function closeWeightHistory() {
    if (editingWeightId) {
      setEditingWeightId(null)
    } else {
      setShowWeightHistoryModal(false)
    }
  }

  async function saveEditWeight() {
    if (!editWeightForm.weight_kg) return
    setEditWeightSaving(true)
    const { error } = await supabase.from('weight_logs').update({
      date: editWeightForm.date,
      weight_kg: parseFloat(editWeightForm.weight_kg),
      notes: editWeightForm.notes || null,
    }).eq('id', editingWeightId)
    if (error) console.error('weight_logs update error:', error)
    await fetchWeightLogs()
    setEditingWeightId(null)
    setEditWeightSaving(false)
  }

  async function deleteWeightLog(id) {
    await supabase.from('weight_logs').delete().eq('id', id)
    await fetchWeightLogs()
  }

  // ── Meal CRUD
  async function estimateMeal() {
    if (!mealInput.trim()) return
    setMealEstimating(true)
    try {
      const yesterday = shiftDate(localDate(), -1)
      const { data: yesterdayMeals } = await supabase.from('meal_logs').select('*').eq('date', yesterday)
      const resp = await fetch('/api/estimate-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: mealInput, previousMeals: yesterdayMeals || [] }),
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
      setMealForm({ description: mealInput, kcal: '', protein_g: '', carbs_g: '', fat_g: '', logged_at: localTime() })
    }
    setMealStep('review')
    setMealEstimating(false)
  }

  async function saveMeal() {
    if (!mealForm.description || !mealForm.kcal) return
    setMealSaving(true)
    const { error } = await supabase.from('meal_logs').insert({
      date: localDate(),
      time: mealForm.logged_at || localTime(),
      description: mealForm.description,
      kcal: parseFloat(mealForm.kcal),
      protein_g: parseFloat(mealForm.protein_g || 0),
      carbs_g: parseFloat(mealForm.carbs_g || 0),
      fat_g: parseFloat(mealForm.fat_g || 0),
    })
    if (error) {
      console.error('meal insert error:', error)
      setMealSaving(false)
      return
    }
    setShowAddMealModal(false)
    setMealInput('')
    setMealStep('input')
    setMealForm({ description: '', kcal: '', protein_g: '', carbs_g: '', fat_g: '', logged_at: localTime() })
    await fetchMealLogs()
    if (weekOffset === 0) await fetchWeekMeals(0)
    setMealSaving(false)
  }

  async function saveEditMeal() {
    if (!editMealForm.description || !editMealForm.kcal) return
    setEditMealSaving(true)
    await supabase.from('meal_logs').update({
      time: editMealForm.logged_at,
      description: editMealForm.description,
      kcal: parseFloat(editMealForm.kcal),
      protein_g: parseFloat(editMealForm.protein_g || 0),
      carbs_g: parseFloat(editMealForm.carbs_g || 0),
      fat_g: parseFloat(editMealForm.fat_g || 0),
    }).eq('id', editingMealId)
    setShowEditMealModal(false)
    setEditingMealId(null)
    await fetchMealLogs()
    if (weekOffset === 0) await fetchWeekMeals(0)
    setEditMealSaving(false)
  }

  async function deleteMeal(id) {
    await supabase.from('meal_logs').delete().eq('id', id)
    await fetchMealLogs()
    if (weekOffset === 0) await fetchWeekMeals(0)
  }

  async function suggestMeal() {
    setMealSuggesting(true)
    setMealSuggestion('')
    try {
      const resp = await fetch('/api/suggest-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remainingKcal: Math.max(0, nutritionKcalTarget - totalKcal),
          remainingProtein: Math.max(0, proteinTarget - totalProtein),
          remainingCarbs: Math.max(0, carbsTarget - totalCarbs),
          remainingFat: Math.max(0, fatTarget - totalFat),
        }),
      })
      const result = await resp.json()
      setMealSuggestion(stripMarkdown(result.suggestion || 'No suggestion available.'))
    } catch {
      setMealSuggestion('Could not fetch suggestion. Check your connection.')
    }
    setMealSuggesting(false)
  }

  async function saveNutritionSettings() {
    setNutritionSettingsSaving(true)
    const f = nutritionSettingsForm
    let updates = { nutrition_mode: f.nutrition_mode }
    if (f.nutrition_mode === 'calories') {
      updates.kcal_target = Number(f.kcal_target)
      updates.protein_pct = Number(f.protein_pct)
      updates.carbs_pct = Number(f.carbs_pct)
      updates.fat_pct = Number(f.fat_pct)
      updates.protein_target_g = Math.round((updates.kcal_target * updates.protein_pct / 100) / 4)
      updates.carbs_target_g = Math.round((updates.kcal_target * updates.carbs_pct / 100) / 4)
      updates.fat_target_g = Math.round((updates.kcal_target * updates.fat_pct / 100) / 9)
    } else {
      updates.protein_target_g = Number(f.protein_target_g)
      updates.carbs_target_g = Number(f.carbs_target_g)
      updates.fat_target_g = Number(f.fat_target_g)
      updates.kcal_target = Math.round(updates.protein_target_g * 4 + updates.carbs_target_g * 4 + updates.fat_target_g * 9)
    }
    await persistHealthSettings(updates)
    setShowNutritionSettingsModal(false)
    setNutritionSettingsSaving(false)
  }

  // ── Day modal functions
  async function estimateDayMeal() {
    if (!dayModalEditInput.trim()) return
    setDayModalEditEstimating(true)
    try {
      const yesterday = shiftDate(dayModalDate || localDate(), -1)
      const { data: yesterdayMeals } = await supabase.from('meal_logs').select('*').eq('date', yesterday)
      const resp = await fetch('/api/estimate-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: dayModalEditInput, previousMeals: yesterdayMeals || [] }),
      })
      const parsed = await resp.json()
      setDayModalEditForm(f => ({
        ...f,
        description: parsed.description || dayModalEditInput,
        kcal: parsed.kcal != null ? String(Math.round(parsed.kcal)) : '',
        protein_g: parsed.protein_g != null ? String(Math.round(parsed.protein_g)) : '',
        carbs_g: parsed.carbs_g != null ? String(Math.round(parsed.carbs_g)) : '',
        fat_g: parsed.fat_g != null ? String(Math.round(parsed.fat_g)) : '',
      }))
    } catch {
      setDayModalEditForm(f => ({ ...f, description: dayModalEditInput, kcal: '', protein_g: '', carbs_g: '', fat_g: '' }))
    }
    setDayModalEditStep('review')
    setDayModalEditEstimating(false)
  }

  async function saveDayEditMeal() {
    if (!dayModalEditForm.description || !dayModalEditForm.kcal) return
    setDayModalEditSaving(true)
    await supabase.from('meal_logs').update({
      time: dayModalEditForm.logged_at || null,
      description: dayModalEditForm.description,
      kcal: parseFloat(dayModalEditForm.kcal),
      protein_g: parseFloat(dayModalEditForm.protein_g || 0),
      carbs_g: parseFloat(dayModalEditForm.carbs_g || 0),
      fat_g: parseFloat(dayModalEditForm.fat_g || 0),
    }).eq('id', dayModalEditingId)
    setDayModalEditingId(null)
    setDayModalEditStep('review')
    await fetchWeekMeals(weekOffset)
    if (dayModalDate === localDate()) await fetchMealLogs()
    setDayModalEditSaving(false)
  }

  async function saveDayNewMeal() {
    if (!dayModalEditForm.description || !dayModalEditForm.kcal) return
    setDayModalEditSaving(true)
    await supabase.from('meal_logs').insert({
      date: dayModalDate,
      time: dayModalEditForm.logged_at || null,
      description: dayModalEditForm.description,
      kcal: parseFloat(dayModalEditForm.kcal),
      protein_g: parseFloat(dayModalEditForm.protein_g || 0),
      carbs_g: parseFloat(dayModalEditForm.carbs_g || 0),
      fat_g: parseFloat(dayModalEditForm.fat_g || 0),
    })
    setDayModalAdding(false)
    setDayModalEditStep('review')
    setDayModalEditForm({ description: '', kcal: '', protein_g: '', carbs_g: '', fat_g: '', logged_at: '' })
    setDayModalEditInput('')
    await fetchWeekMeals(weekOffset)
    if (dayModalDate === localDate()) await fetchMealLogs()
    setDayModalEditSaving(false)
  }

  async function deleteDayMeal(id) {
    const currentMeals = weekMealsByDate[dayModalDate] || []
    const isLastMeal = currentMeals.length === 1
    await supabase.from('meal_logs').delete().eq('id', id)
    await fetchWeekMeals(weekOffset)
    if (dayModalDate === localDate()) await fetchMealLogs()
    if (isLastMeal) {
      setShowDayModal(false)
      setDayModalDate(null)
    }
  }

  function closeDayModal() {
    if (dayModalAdding) {
      if (dayModalEditStep === 'review') {
        setDayModalEditStep('input')
        return
      }
      setDayModalAdding(false)
      setDayModalEditStep('review')
      return
    }
    if (dayModalEditingId) {
      if (dayModalEditStep === 'review') {
        setDayModalEditStep('input')
        return
      }
      setDayModalEditingId(null)
      setDayModalEditStep('review')
      return
    }
    setShowDayModal(false)
    setDayModalDate(null)
  }

  // ── Derived: weight chart data
  const filteredWeightLogs = useMemo(() => {
    const sorted = [...weightLogs].sort((a, b) => a.date.localeCompare(b.date))
    const cutoffs = { '30D': shiftDate(localDate(), -30), '90D': shiftDate(localDate(), -90) }
    return cutoffs[weightRange] ? sorted.filter(l => l.date >= cutoffs[weightRange]) : sorted
  }, [weightLogs, weightRange])

  const weightChartData = useMemo(() => {
    return filteredWeightLogs.map((log, i) => {
      const window = filteredWeightLogs.slice(Math.max(0, i - 6), i + 1)
      const ma = parseFloat((window.reduce((s, l) => s + l.weight_kg, 0) / window.length).toFixed(1))
      return { date: log.date, label: fmtShort(log.date), weight: log.weight_kg, ma }
    })
  }, [filteredWeightLogs])

  // ── Derived: weight stats
  const currentWeight = weightLogs[0]?.weight_kg ?? null
  const sevenDayAvg = useMemo(() => {
    const slice = [...weightLogs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7)
    return slice.length > 0
      ? parseFloat((slice.reduce((s, l) => s + l.weight_kg, 0) / slice.length).toFixed(1))
      : null
  }, [weightLogs])
  const toTarget = currentWeight != null && healthSettings.weight_target_kg != null
    ? parseFloat((currentWeight - healthSettings.weight_target_kg).toFixed(1))
    : null

  // ── Derived: nutrition
  const totalKcal = mealLogs.reduce((s, m) => s + (m.kcal || 0), 0)
  const totalProtein = mealLogs.reduce((s, m) => s + (m.protein_g || 0), 0)
  const totalCarbs = mealLogs.reduce((s, m) => s + (m.carbs_g || 0), 0)
  const totalFat = mealLogs.reduce((s, m) => s + (m.fat_g || 0), 0)
  const burntKcal = 0
  const netKcal = totalKcal - burntKcal
  const nutritionKcalTarget = healthSettings.kcal_target || 2000
  const proteinTarget = healthSettings.protein_target_g || 150
  const carbsTarget = healthSettings.carbs_target_g || 200
  const fatTarget = healthSettings.fat_target_g || 70

  // ── Derived: health score (0–100)
  const healthScore = useMemo(() => {
    let weightScore = 0
    if (currentWeight != null && healthSettings.weight_target_kg != null) {
      const diff = Math.abs(currentWeight - healthSettings.weight_target_kg)
      weightScore = Math.max(0, Math.min(100, 100 - diff * 8))
    }
    let nutritionScore = 0
    if (totalKcal > 0 && nutritionKcalTarget) {
      const ratio = totalKcal / nutritionKcalTarget
      nutritionScore = ratio >= 0.85 && ratio <= 1.15 ? 100 : ratio >= 0.7 && ratio <= 1.3 ? 60 : 20
    }
    return Math.round(0 * 0.30 + 0 * 0.20 + 0 * 0.20 + weightScore * 0.15 + nutritionScore * 0.15)
  }, [currentWeight, healthSettings.weight_target_kg, totalKcal, nutritionKcalTarget])

  // ── Derived: weekly nutrition
  const weekDates = useMemo(() => getWeekDatesForOffset(weekOffset), [weekOffset])
  const weekMealsByDate = useMemo(() => {
    const byDate = {}
    weekMeals.forEach(m => {
      if (!byDate[m.date]) byDate[m.date] = []
      byDate[m.date].push(m)
    })
    return byDate
  }, [weekMeals])
  const weekAvg = useMemo(() => {
    const loggedDays = weekDates.filter(d => (weekMealsByDate[d.dateStr] || []).length > 0)
    if (loggedDays.length === 0) return null
    const totals = loggedDays.reduce((acc, d) => {
      const meals = weekMealsByDate[d.dateStr] || []
      acc.kcal += meals.reduce((s, m) => s + (m.kcal || 0), 0)
      acc.protein += meals.reduce((s, m) => s + (m.protein_g || 0), 0)
      acc.carbs += meals.reduce((s, m) => s + (m.carbs_g || 0), 0)
      acc.fat += meals.reduce((s, m) => s + (m.fat_g || 0), 0)
      return acc
    }, { kcal: 0, protein: 0, carbs: 0, fat: 0 })
    const n = loggedDays.length
    return {
      kcal: Math.round(totals.kcal / n),
      protein: Math.round(totals.protein / n),
      carbs: Math.round(totals.carbs / n),
      fat: Math.round(totals.fat / n),
    }
  }, [weekDates, weekMealsByDate])

  const hasAnyData = weightLogs.length > 0 || mealLogs.length > 0
  const scoreColor = healthScore >= 70 ? 'text-emerald-400' : healthScore >= 40 ? 'text-amber-400' : 'text-red-400'
  const scoreBarColor = healthScore >= 70 ? 'bg-emerald-400' : healthScore >= 40 ? 'bg-amber-400' : 'bg-red-400'

  // ── Nutrition settings modal derived preview
  const nsf = nutritionSettingsForm
  const nsCalcKcal = nsf.nutrition_mode === 'macros'
    ? Math.round(Number(nsf.protein_target_g) * 4 + Number(nsf.carbs_target_g) * 4 + Number(nsf.fat_target_g) * 9)
    : Number(nsf.kcal_target)
  const nsPctSum = Number(nsf.protein_pct) + Number(nsf.carbs_pct) + Number(nsf.fat_pct)

  return (
    <div className="space-y-6">

      {/* ── Section 1: Summary cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Health Score */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-sm tracking-widests uppercase text-gray-400 mb-3">Health Score</h2>
          {!hasAnyData ? (
            <>
              <div className="text-4xl font-bold text-gray-600 mb-2">0</div>
              <div className="text-xs text-gray-600 mb-3">Add data to calculate your score</div>
            </>
          ) : (
            <>
              <div className={`text-4xl font-bold mb-2 ${scoreColor}`}>{healthScore}</div>
              <div className="w-full bg-gray-800 rounded-full h-1.5 mb-4">
                <div className={`h-1.5 rounded-full transition-all ${scoreBarColor}`} style={{ width: `${healthScore}%` }} />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            {[
              { label: 'Sleep', pct: 30, connected: false },
              { label: 'Steps', pct: 20, connected: false },
              { label: 'HRV', pct: 20, connected: false },
              { label: 'Weight trend', pct: 15, connected: currentWeight != null },
              { label: 'Nutrition', pct: 15, connected: totalKcal > 0 },
            ].map(({ label, pct, connected }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${connected ? 'bg-emerald-400' : 'bg-gray-700'}`} />
                  <span className="text-xs text-gray-500">{label}</span>
                </div>
                <span className="text-xs text-gray-600">{pct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Steps */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-sm tracking-widest uppercase text-gray-400 mb-3">Steps Today</h2>
          <div className="text-4xl font-bold text-gray-600 mb-1">—</div>
          <div className="text-xs text-gray-600 mb-3">Target: 10,000</div>
          <div className="w-full bg-gray-800 rounded-full h-1.5 mb-4">
            <div className="bg-gray-700 h-1.5 rounded-full" style={{ width: '0%' }} />
          </div>
          <ConnectBadge />
        </div>

        {/* Sleep */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-sm tracking-widest uppercase text-gray-400 mb-3">Sleep Last Night</h2>
          <div className="text-4xl font-bold text-gray-600 mb-1">—</div>
          <div className="text-xs text-gray-600 mb-3">Target: 8 hrs</div>
          <div className="w-full bg-gray-800 rounded-full h-1.5 mb-4">
            <div className="bg-gray-700 h-1.5 rounded-full" style={{ width: '0%' }} />
          </div>
          <ConnectBadge />
        </div>

        {/* HRV */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-sm tracking-widest uppercase text-gray-400 mb-3">HRV</h2>
          <div className="text-4xl font-bold text-gray-600 mb-1">—</div>
          <div className="text-xs text-gray-600 mb-3">7-day avg: —</div>
          <div className="w-full bg-gray-800 rounded-full h-1.5 mb-4">
            <div className="bg-gray-700 h-1.5 rounded-full" style={{ width: '0%' }} />
          </div>
          <ConnectBadge />
        </div>
      </div>

      {/* ── Section 2: Weight tracker ────────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm tracking-widest uppercase text-gray-400">Weight</h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-gray-800 rounded p-0.5">
              {['30D', '90D', 'All'].map(r => (
                <button
                  key={r}
                  onClick={() => setWeightRange(r)}
                  className={`px-3 py-1 text-xs tracking-widest uppercase rounded transition-colors ${weightRange === r ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <button
              onClick={() => { setEditingWeightId(null); setShowWeightHistoryModal(true) }}
              className="text-xs tracking-widest uppercase px-4 py-2 border border-gray-700 text-gray-400 rounded hover:border-gray-500 hover:text-white transition-colors"
            >
              View History
            </button>
            <button
              onClick={() => { setTargetWeightForm(healthSettings.weight_target_kg != null ? String(healthSettings.weight_target_kg) : ''); setShowWeightTargetModal(true) }}
              className="text-xs tracking-widest uppercase px-4 py-2 border border-gray-700 text-gray-400 rounded hover:border-emerald-400 hover:text-emerald-400 transition-colors"
            >
              Set Target
            </button>
            <button
              onClick={() => { setWeightForm({ date: localDate(), weight_kg: '', notes: '' }); setShowWeightModal(true) }}
              className="text-xs tracking-widest uppercase px-4 py-2 border border-emerald-400 text-emerald-400 rounded hover:bg-emerald-400 hover:text-gray-950 transition-colors"
            >
              + Log Weight
            </button>
          </div>
        </div>

        {/* Chart */}
        {weightChartData.length > 1 ? (
          <div className="mb-6">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={weightChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  domain={['dataMin - 1', 'dataMax + 1']}
                  width={40}
                  tickFormatter={v => `${v}`}
                />
                <Tooltip content={<WeightTooltip />} />
                {healthSettings.weight_target_kg != null && (
                  <ReferenceLine
                    y={healthSettings.weight_target_kg}
                    stroke="#6b7280"
                    strokeDasharray="4 4"
                    label={{ value: `Target ${healthSettings.weight_target_kg}kg`, fill: '#6b7280', fontSize: 10, position: 'insideTopRight' }}
                  />
                )}
                <Line type="monotone" dataKey="weight" stroke="#34d399" strokeWidth={2} dot={false} name="Weight" />
                <Line type="monotone" dataKey="ma" stroke="#6b7280" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="7-day avg" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : weightChartData.length === 1 ? (
          <div className="mb-6 text-xs text-gray-600">Log more entries to see the chart.</div>
        ) : (
          <div className="mb-6 text-sm text-gray-600">No weight entries yet. Log your first entry to start tracking.</div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Current</div>
            <div className="text-xl font-bold text-white">{currentWeight != null ? `${currentWeight} kg` : '—'}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">7-Day Avg</div>
            <div className="text-xl font-bold text-white">{sevenDayAvg != null ? `${sevenDayAvg} kg` : '—'}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Target</div>
            <div className="text-xl font-bold text-white">
              {healthSettings.weight_target_kg != null ? `${healthSettings.weight_target_kg} kg` : '—'}
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">To Target</div>
            <div className={`text-xl font-bold ${toTarget == null ? 'text-gray-600' : Math.abs(toTarget) < 0.5 ? 'text-emerald-400' : toTarget > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {toTarget != null ? `${toTarget > 0 ? '+' : ''}${toTarget} kg` : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 3: Nutrition ─────────────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm tracking-widest uppercase text-gray-400">Nutrition</h2>
            <button
              onClick={() => { setNutritionSettingsForm({ ...healthSettings }); setShowNutritionSettingsModal(true) }}
              className="text-gray-600 hover:text-white transition-colors"
              title="Nutrition targets"
            >
              <GearIcon />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={suggestMeal}
              disabled={mealSuggesting}
              className="text-xs tracking-widest uppercase px-3 py-1.5 border border-gray-700 text-gray-400 rounded hover:border-emerald-400 hover:text-emerald-400 transition-colors disabled:opacity-50"
            >
              {mealSuggesting ? 'Thinking...' : 'Suggest a Meal'}
            </button>
            <button
              onClick={() => { setMealInput(''); setMealStep('input'); setMealForm({ description: '', kcal: '', protein_g: '', carbs_g: '', fat_g: '', logged_at: localTime() }); setShowAddMealModal(true) }}
              className="text-xs tracking-widest uppercase px-3 py-1.5 border border-emerald-400 text-emerald-400 rounded hover:bg-emerald-400 hover:text-gray-950 transition-colors"
            >
              + Add Meal
            </button>
          </div>
        </div>

        {/* Macro summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">

          {/* Calories */}
          <div className="bg-gray-800 rounded-lg p-4 sm:col-span-1">
            <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Calories</div>
            <div className="text-xl font-bold text-amber-400">{Math.round(totalKcal)}</div>
            <div className="text-xs text-gray-500 mb-2">/ {nutritionKcalTarget} kcal</div>
            <div className="w-full bg-gray-700 rounded-full h-1 mb-2">
              <div className="bg-amber-400 h-1 rounded-full" style={{ width: `${Math.min(100, (totalKcal / nutritionKcalTarget) * 100)}%` }} />
            </div>
            <div className="text-xs text-gray-600">Burnt: {burntKcal} kcal</div>
            <div className={`text-xs ${netKcal > nutritionKcalTarget ? 'text-red-400' : 'text-gray-500'}`}>Net: {Math.round(netKcal)} kcal</div>
          </div>

          {/* Protein */}
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Protein</div>
            <div className="text-xl font-bold text-emerald-400">{Math.round(totalProtein)}g</div>
            <div className="text-xs text-gray-500 mb-2">/ {proteinTarget}g</div>
            <div className="w-full bg-gray-700 rounded-full h-1">
              <div className="bg-emerald-400 h-1 rounded-full" style={{ width: `${Math.min(100, (totalProtein / proteinTarget) * 100)}%` }} />
            </div>
          </div>

          {/* Carbs */}
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Carbs</div>
            <div className="text-xl font-bold text-blue-400">{Math.round(totalCarbs)}g</div>
            <div className="text-xs text-gray-500 mb-2">/ {carbsTarget}g</div>
            <div className="w-full bg-gray-700 rounded-full h-1">
              <div className="bg-blue-400 h-1 rounded-full" style={{ width: `${Math.min(100, (totalCarbs / carbsTarget) * 100)}%` }} />
            </div>
          </div>

          {/* Fat */}
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Fat</div>
            <div className="text-xl font-bold text-purple-400">{Math.round(totalFat)}g</div>
            <div className="text-xs text-gray-500 mb-2">/ {fatTarget}g</div>
            <div className="w-full bg-gray-700 rounded-full h-1">
              <div className="bg-purple-400 h-1 rounded-full" style={{ width: `${Math.min(100, (totalFat / fatTarget) * 100)}%` }} />
            </div>
          </div>
        </div>

        {/* Meal suggestion */}
        {mealSuggestion && (
          <div className="mb-4 p-4 bg-gray-800 rounded-lg border-l-2 border-emerald-400">
            <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">Meal Suggestion</div>
            <div className="text-sm text-gray-300">{mealSuggestion}</div>
          </div>
        )}

        {/* Meal log */}
        {mealLogs.length === 0 ? (
          <div className="text-sm text-gray-600">No meals logged today.</div>
        ) : (
          <div>
            {/* Header */}
            <div className="grid grid-cols-12 gap-2 pb-2 border-b border-gray-800 mb-1">
              <div className="col-span-1 text-xs text-gray-500 uppercase tracking-widest">Time</div>
              <div className="col-span-5 text-xs text-gray-500 uppercase tracking-widest">Meal</div>
              <div className="col-span-1 text-xs text-gray-500 uppercase tracking-widest text-right">kcal</div>
              <div className="col-span-1 text-xs text-gray-500 uppercase tracking-widest text-right">P</div>
              <div className="col-span-1 text-xs text-gray-500 uppercase tracking-widest text-right">C</div>
              <div className="col-span-1 text-xs text-gray-500 uppercase tracking-widest text-right">F</div>
              <div className="col-span-2" />
            </div>
            {mealLogs.map(meal => (
              <div key={meal.id} className="grid grid-cols-12 gap-2 py-2.5 border-b border-gray-800 last:border-0 items-center group">
                <div className="col-span-1 text-xs text-gray-500 truncate">{meal.time?.slice(0, 5) || '—'}</div>
                <div className="col-span-5 text-sm text-white truncate min-w-0">{meal.description}</div>
                <div className="col-span-1 text-xs text-amber-400 text-right">{Math.round(meal.kcal || 0)}</div>
                <div className="col-span-1 text-xs text-emerald-400 text-right">{Math.round(meal.protein_g || 0)}g</div>
                <div className="col-span-1 text-xs text-blue-400 text-right">{Math.round(meal.carbs_g || 0)}g</div>
                <div className="col-span-1 text-xs text-purple-400 text-right">{Math.round(meal.fat_g || 0)}g</div>
                <div className="col-span-2 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => {
                      setEditingMealId(meal.id)
                      setEditMealForm({
                        description: meal.description,
                        kcal: String(meal.kcal || ''),
                        protein_g: String(meal.protein_g || ''),
                        carbs_g: String(meal.carbs_g || ''),
                        fat_g: String(meal.fat_g || ''),
                        logged_at: meal.time?.slice(0, 5) || '',
                      })
                      setShowEditMealModal(true)
                    }}
                    className="text-xs text-gray-600 hover:text-white transition-colors uppercase tracking-widest"
                  >Edit</button>
                  <button
                    onClick={() => deleteMeal(meal.id)}
                    className="text-xs text-gray-600 hover:text-red-400 transition-colors uppercase tracking-widest"
                  >Del</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Weekly Nutrition card ─────────────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm tracking-widest uppercase text-gray-400">Weekly Nutrition</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekOffset(o => o - 1)}
              className="text-gray-500 hover:text-white transition-colors px-2 py-1 text-sm"
            >←</button>
            <span className="text-xs text-gray-500 min-w-[120px] text-center">
              {weekDates[0]?.dayLabel} – {weekDates[6]?.dayLabel}
            </span>
            <button
              onClick={() => setWeekOffset(o => o + 1)}
              disabled={weekOffset >= 0}
              className="text-gray-500 hover:text-white transition-colors px-2 py-1 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
            >→</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[580px]">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-xs text-gray-500 uppercase tracking-widest pb-2 pr-4 w-28 font-normal">Day</th>
                <th className="text-left text-xs text-gray-500 uppercase tracking-widest pb-2 pr-4 font-normal">Calories</th>
                <th className="text-left text-xs text-gray-500 uppercase tracking-widest pb-2 pr-4 font-normal">Protein</th>
                <th className="text-left text-xs text-gray-500 uppercase tracking-widest pb-2 pr-4 font-normal">Carbs</th>
                <th className="text-left text-xs text-gray-500 uppercase tracking-widest pb-2 pr-4 font-normal">Fat</th>
                <th className="pb-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {weekDates.map(({ label, dateStr, dayLabel }) => {
                const meals = weekMealsByDate[dateStr] || []
                const hasData = meals.length > 0
                const kcal = meals.reduce((s, m) => s + (m.kcal || 0), 0)
                const protein = meals.reduce((s, m) => s + (m.protein_g || 0), 0)
                const carbs = meals.reduce((s, m) => s + (m.carbs_g || 0), 0)
                const fat = meals.reduce((s, m) => s + (m.fat_g || 0), 0)
                const isToday = dateStr === localDate()

                return (
                  <tr key={dateStr} className={`border-b border-gray-800 last:border-0 ${isToday ? 'bg-gray-800/20' : ''}`}>
                    <td className="py-3 pr-4">
                      <div className="text-xs text-white">{label} <span className="text-gray-500">{dayLabel}</span></div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        {hasData ? `${meals.length} meal${meals.length !== 1 ? 's' : ''}` : '—'}
                      </div>
                    </td>
                    {hasData ? (
                      <>
                        <td className="py-3 pr-4 min-w-[100px]">
                          <div className={`text-xs ${macroColorCls(kcal, nutritionKcalTarget)}`}>
                            {Math.round(kcal)} <span className="text-gray-600">/ {nutritionKcalTarget}</span>
                          </div>
                          <div className="w-full bg-gray-800 rounded-full h-1 mt-1">
                            <div className={`${macroBgCls(kcal, nutritionKcalTarget)} h-1 rounded-full`} style={{ width: `${Math.min(100, (kcal / nutritionKcalTarget) * 100)}%` }} />
                          </div>
                        </td>
                        <td className="py-3 pr-4 min-w-[90px]">
                          <div className={`text-xs ${macroColorCls(protein, proteinTarget)}`}>
                            {Math.round(protein)}g <span className="text-gray-600">/ {proteinTarget}g</span>
                          </div>
                          <div className="w-full bg-gray-800 rounded-full h-1 mt-1">
                            <div className={`${macroBgCls(protein, proteinTarget)} h-1 rounded-full`} style={{ width: `${Math.min(100, (protein / proteinTarget) * 100)}%` }} />
                          </div>
                        </td>
                        <td className="py-3 pr-4 min-w-[90px]">
                          <div className={`text-xs ${macroColorCls(carbs, carbsTarget)}`}>
                            {Math.round(carbs)}g <span className="text-gray-600">/ {carbsTarget}g</span>
                          </div>
                          <div className="w-full bg-gray-800 rounded-full h-1 mt-1">
                            <div className={`${macroBgCls(carbs, carbsTarget)} h-1 rounded-full`} style={{ width: `${Math.min(100, (carbs / carbsTarget) * 100)}%` }} />
                          </div>
                        </td>
                        <td className="py-3 pr-4 min-w-[80px]">
                          <div className={`text-xs ${macroColorCls(fat, fatTarget)}`}>
                            {Math.round(fat)}g <span className="text-gray-600">/ {fatTarget}g</span>
                          </div>
                          <div className="w-full bg-gray-800 rounded-full h-1 mt-1">
                            <div className={`${macroBgCls(fat, fatTarget)} h-1 rounded-full`} style={{ width: `${Math.min(100, (fat / fatTarget) * 100)}%` }} />
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        {[0, 1, 2, 3].map(i => (
                          <td key={i} className="py-3 pr-4 text-xs text-gray-700">—</td>
                        ))}
                      </>
                    )}
                    <td className="py-3 text-right">
                      <button
                        onClick={() => {
                          if (!hasData) return
                          setDayModalDate(dateStr)
                          setDayModalEditingId(null)
                          setDayModalEditStep('review')
                          setShowDayModal(true)
                        }}
                        disabled={!hasData}
                        className={`text-xs tracking-widest uppercase px-3 py-1.5 border rounded transition-colors ${
                          hasData
                            ? 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
                            : 'border-gray-800 text-gray-700 cursor-not-allowed'
                        }`}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                )
              })}

              {/* Week average row */}
              {weekAvg && (
                <tr className="border-t-2 border-gray-700">
                  <td className="py-3 pr-4">
                    <div className="text-xs text-gray-500 uppercase tracking-widest">Avg</div>
                  </td>
                  <td className="py-3 pr-4">
                    <div className={`text-xs ${macroColorCls(weekAvg.kcal, nutritionKcalTarget)}`}>
                      {weekAvg.kcal} <span className="text-gray-600">/ {nutritionKcalTarget}</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-1 mt-1">
                      <div className={`${macroBgCls(weekAvg.kcal, nutritionKcalTarget)} h-1 rounded-full`} style={{ width: `${Math.min(100, (weekAvg.kcal / nutritionKcalTarget) * 100)}%` }} />
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <div className={`text-xs ${macroColorCls(weekAvg.protein, proteinTarget)}`}>
                      {weekAvg.protein}g <span className="text-gray-600">/ {proteinTarget}g</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-1 mt-1">
                      <div className={`${macroBgCls(weekAvg.protein, proteinTarget)} h-1 rounded-full`} style={{ width: `${Math.min(100, (weekAvg.protein / proteinTarget) * 100)}%` }} />
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <div className={`text-xs ${macroColorCls(weekAvg.carbs, carbsTarget)}`}>
                      {weekAvg.carbs}g <span className="text-gray-600">/ {carbsTarget}g</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-1 mt-1">
                      <div className={`${macroBgCls(weekAvg.carbs, carbsTarget)} h-1 rounded-full`} style={{ width: `${Math.min(100, (weekAvg.carbs / carbsTarget) * 100)}%` }} />
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <div className={`text-xs ${macroColorCls(weekAvg.fat, fatTarget)}`}>
                      {weekAvg.fat}g <span className="text-gray-600">/ {fatTarget}g</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-1 mt-1">
                      <div className={`${macroBgCls(weekAvg.fat, fatTarget)} h-1 rounded-full`} style={{ width: `${Math.min(100, (weekAvg.fat / fatTarget) * 100)}%` }} />
                    </div>
                  </td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Section 4: Weekly breakdown ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { title: 'Steps This Week', unit: 'steps', target: 10000 },
          { title: 'Sleep This Week', unit: 'hrs', target: 8 },
          { title: 'HRV This Week', unit: 'ms', target: 60 },
        ].map(({ title, unit, target }) => (
          <div key={title} className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm tracking-widest uppercase text-gray-400">{title}</h2>
              <ConnectBadge />
            </div>
            <div className="space-y-2">
              {WEEK_DATES.map(({ label, dayLabel }) => (
                <div key={label} className="flex items-center justify-between py-1 border-b border-gray-800 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 w-7">{label}</span>
                    <span className="text-xs text-gray-700">{dayLabel}</span>
                  </div>
                  <span className="text-xs text-gray-600">—</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Log Weight modal ──────────────────────────────────────────────────────── */}
      {showWeightModal && (
        <Modal
          title="Log Weight"
          onClose={() => setShowWeightModal(false)}
          onSave={saveWeight}
          saveLabel="Save"
          saveDisabled={weightSaving || !weightForm.weight_kg}
          saving={weightSaving}
        >
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

      {/* ── Set Weight Target modal ───────────────────────────────────────────────── */}
      {showWeightTargetModal && (
        <Modal
          title="Target Weight"
          onClose={() => setShowWeightTargetModal(false)}
          onSave={saveWeightTarget}
          saveLabel="Set Target"
        >
          <div>
            <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Target Weight (kg)</label>
            <input
              type="number"
              step="0.1"
              value={targetWeightForm}
              onChange={e => setTargetWeightForm(e.target.value)}
              placeholder="e.g. 78.0"
              className={`w-full ${inputCls}`}
            />
          </div>
        </Modal>
      )}

      {/* ── Weight History modal ─────────────────────────────────────────────────── */}
      {showWeightHistoryModal && (
        <Modal
          title={editingWeightId ? 'Edit Entry' : 'Weight History'}
          onClose={closeWeightHistory}
          onSave={editingWeightId ? saveEditWeight : () => setShowWeightHistoryModal(false)}
          saveLabel={editingWeightId ? 'Save' : 'Done'}
          cancelLabel={editingWeightId ? 'Back' : 'Close'}
          saving={editWeightSaving}
          saveDisabled={editingWeightId ? (!editWeightForm.weight_kg || editWeightSaving) : false}
          maxWidth="max-w-2xl"
        >
          {editingWeightId ? (
            <div className="space-y-3">
              <div>
                <label className="text-sm tracking-widests uppercase text-gray-400 block mb-1">Date</label>
                <input type="date" value={editWeightForm.date} onChange={e => setEditWeightForm(f => ({ ...f, date: e.target.value }))} className={`w-full ${inputCls}`} />
              </div>
              <div>
                <label className="text-sm tracking-widests uppercase text-gray-400 block mb-1">Weight (kg)</label>
                <input type="number" step="0.1" value={editWeightForm.weight_kg} onChange={e => setEditWeightForm(f => ({ ...f, weight_kg: e.target.value }))} placeholder="e.g. 82.5" className={`w-full ${inputCls}`} />
              </div>
              <div>
                <label className="text-sm tracking-widests uppercase text-gray-400 block mb-1">Notes</label>
                <input value={editWeightForm.notes} onChange={e => setEditWeightForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" className={`w-full ${inputCls}`} />
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
                    <button
                      onClick={() => {
                        setEditWeightForm({ date: log.date, weight_kg: String(log.weight_kg), notes: log.notes || '' })
                        setEditingWeightId(log.id)
                      }}
                      className="text-xs text-gray-500 hover:text-white transition-colors uppercase tracking-widest"
                    >Edit</button>
                    <button
                      onClick={() => deleteWeightLog(log.id)}
                      className="text-xs text-gray-500 hover:text-red-400 transition-colors uppercase tracking-widest"
                    >Del</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* ── Add Meal modal ────────────────────────────────────────────────────────── */}
      {showAddMealModal && (
        <Modal
          title="Add Meal"
          onClose={() => { setShowAddMealModal(false); setMealStep('input') }}
          onSave={mealStep === 'input' ? estimateMeal : saveMeal}
          saveLabel={mealStep === 'input' ? 'Estimate' : 'Save Meal'}
          saveDisabled={
            mealStep === 'input'
              ? mealEstimating || !mealInput.trim()
              : mealSaving || !mealForm.description || !mealForm.kcal
          }
          saving={mealStep === 'input' ? mealEstimating : mealSaving}
        >
          {mealStep === 'input' ? (
            <div>
              <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">What did you eat?</label>
              <textarea
                value={mealInput}
                onChange={e => setMealInput(e.target.value)}
                rows={3}
                placeholder="e.g. 'chicken breast with rice and broccoli, about 200g chicken' or 'same lunch as yesterday'"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm placeholder-gray-700 focus:outline-none focus:border-emerald-400 resize-none"
              />
              <div className="mt-2 text-xs text-gray-600">Claude will estimate the macros. You can review and adjust before saving.</div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-gray-500">Review and adjust the estimated values before saving.</div>
              <div>
                <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Description</label>
                <input value={mealForm.description} onChange={e => setMealForm(f => ({ ...f, description: e.target.value }))} className={`w-full ${inputCls}`} />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Time</label>
                  <input type="time" value={mealForm.logged_at} onChange={e => setMealForm(f => ({ ...f, logged_at: e.target.value }))} className={`w-full ${inputCls}`} />
                </div>
                <div className="flex-1">
                  <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Calories</label>
                  <input type="number" value={mealForm.kcal} onChange={e => setMealForm(f => ({ ...f, kcal: e.target.value }))} className={`w-full ${inputCls}`} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Protein (g)</label>
                  <input type="number" value={mealForm.protein_g} onChange={e => setMealForm(f => ({ ...f, protein_g: e.target.value }))} className={`w-full ${inputCls}`} />
                </div>
                <div>
                  <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Carbs (g)</label>
                  <input type="number" value={mealForm.carbs_g} onChange={e => setMealForm(f => ({ ...f, carbs_g: e.target.value }))} className={`w-full ${inputCls}`} />
                </div>
                <div>
                  <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Fat (g)</label>
                  <input type="number" value={mealForm.fat_g} onChange={e => setMealForm(f => ({ ...f, fat_g: e.target.value }))} className={`w-full ${inputCls}`} />
                </div>
              </div>
              <button onClick={() => setMealStep('input')} className="text-xs text-gray-500 hover:text-white tracking-widest uppercase transition-colors">← Back</button>
            </div>
          )}
        </Modal>
      )}

      {/* ── Edit Meal modal ───────────────────────────────────────────────────────── */}
      {showEditMealModal && (
        <Modal
          title="Edit Meal"
          onClose={() => { setShowEditMealModal(false); setEditingMealId(null) }}
          onSave={saveEditMeal}
          saveLabel="Save"
          saveDisabled={editMealSaving || !editMealForm.description || !editMealForm.kcal}
          saving={editMealSaving}
        >
          <div className="space-y-3">
            <div>
              <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Description</label>
              <input value={editMealForm.description} onChange={e => setEditMealForm(f => ({ ...f, description: e.target.value }))} className={`w-full ${inputCls}`} />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Time</label>
                <input type="time" value={editMealForm.logged_at} onChange={e => setEditMealForm(f => ({ ...f, logged_at: e.target.value }))} className={`w-full ${inputCls}`} />
              </div>
              <div className="flex-1">
                <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Calories</label>
                <input type="number" value={editMealForm.kcal} onChange={e => setEditMealForm(f => ({ ...f, kcal: e.target.value }))} className={`w-full ${inputCls}`} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Protein (g)</label>
                <input type="number" value={editMealForm.protein_g} onChange={e => setEditMealForm(f => ({ ...f, protein_g: e.target.value }))} className={`w-full ${inputCls}`} />
              </div>
              <div>
                <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Carbs (g)</label>
                <input type="number" value={editMealForm.carbs_g} onChange={e => setEditMealForm(f => ({ ...f, carbs_g: e.target.value }))} className={`w-full ${inputCls}`} />
              </div>
              <div>
                <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Fat (g)</label>
                <input type="number" value={editMealForm.fat_g} onChange={e => setEditMealForm(f => ({ ...f, fat_g: e.target.value }))} className={`w-full ${inputCls}`} />
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Nutrition Settings modal ──────────────────────────────────────────────── */}
      {showNutritionSettingsModal && (
        <Modal
          title="Nutrition Targets"
          onClose={() => setShowNutritionSettingsModal(false)}
          onSave={saveNutritionSettings}
          saveLabel="Save"
          saveDisabled={nutritionSettingsSaving || (nsf.nutrition_mode === 'calories' && nsPctSum !== 100)}
          saving={nutritionSettingsSaving}
        >
          <div className="space-y-4">
            {/* Mode toggle */}
            <div>
              <label className="text-sm tracking-widest uppercase text-gray-400 block mb-2">Mode</label>
              <div className="flex items-center bg-gray-800 rounded p-0.5 w-fit">
                {['calories', 'macros'].map(mode => (
                  <button
                    key={mode}
                    onClick={() => setNutritionSettingsForm(f => ({ ...f, nutrition_mode: mode }))}
                    className={`px-4 py-1.5 text-xs tracking-widest uppercase rounded transition-colors ${nsf.nutrition_mode === mode ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {nsf.nutrition_mode === 'calories' ? (
              <>
                <div>
                  <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Daily Calorie Target</label>
                  <input
                    type="number"
                    value={nsf.kcal_target}
                    onChange={e => setNutritionSettingsForm(f => ({ ...f, kcal_target: e.target.value }))}
                    placeholder="2000"
                    className={`w-full ${inputCls}`}
                  />
                </div>
                <div>
                  <label className="text-sm tracking-widest uppercase text-gray-400 block mb-2">Macro Split %</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'protein_pct', label: 'Protein' },
                      { key: 'carbs_pct', label: 'Carbs' },
                      { key: 'fat_pct', label: 'Fat' },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <div className="text-xs text-gray-500 mb-1">{label}</div>
                        <input
                          type="number"
                          value={nsf[key]}
                          onChange={e => setNutritionSettingsForm(f => ({ ...f, [key]: e.target.value }))}
                          placeholder="0"
                          className={`w-full ${inputCls}`}
                        />
                      </div>
                    ))}
                  </div>
                  <div className={`text-xs mt-1 ${nsPctSum === 100 ? 'text-emerald-400' : 'text-red-400'}`}>
                    Total: {nsPctSum}% {nsPctSum !== 100 && '(must equal 100%)'}
                  </div>
                </div>
                <div className="text-xs text-gray-500 space-y-0.5">
                  <div>Protein: ~{Math.round((nsCalcKcal * Number(nsf.protein_pct) / 100) / 4)}g</div>
                  <div>Carbs: ~{Math.round((nsCalcKcal * Number(nsf.carbs_pct) / 100) / 4)}g</div>
                  <div>Fat: ~{Math.round((nsCalcKcal * Number(nsf.fat_pct) / 100) / 9)}g</div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'protein_target_g', label: 'Protein (g)' },
                    { key: 'carbs_target_g', label: 'Carbs (g)' },
                    { key: 'fat_target_g', label: 'Fat (g)' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">{label}</label>
                      <input
                        type="number"
                        value={nsf[key]}
                        onChange={e => setNutritionSettingsForm(f => ({ ...f, [key]: e.target.value }))}
                        className={`w-full ${inputCls}`}
                      />
                    </div>
                  ))}
                </div>
                <div className="text-xs text-gray-500">
                  Calculated kcal: ~{nsCalcKcal}
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* ── Day Nutrition modal ───────────────────────────────────────────────────── */}
      {showDayModal && dayModalDate && (
        <Modal
          title={fmtDayTitle(dayModalDate)}
          onClose={closeDayModal}
          onSave={
            (dayModalAdding || dayModalEditingId)
              ? (dayModalEditStep === 'input'
                  ? estimateDayMeal
                  : (dayModalAdding ? saveDayNewMeal : saveDayEditMeal))
              : () => { setShowDayModal(false); setDayModalDate(null) }
          }
          saveLabel={
            (dayModalAdding || dayModalEditingId)
              ? (dayModalEditStep === 'input' ? 'Estimate' : 'Save Meal')
              : 'Done'
          }
          cancelLabel={(dayModalAdding || dayModalEditingId) ? 'Back' : 'Close'}
          saveDisabled={
            (dayModalAdding || dayModalEditingId)
              ? (dayModalEditStep === 'input'
                  ? (!dayModalEditInput.trim() || dayModalEditEstimating)
                  : (!dayModalEditForm.description || !dayModalEditForm.kcal || dayModalEditSaving))
              : false
          }
          saving={(dayModalAdding || dayModalEditingId)
            ? (dayModalEditStep === 'input' ? dayModalEditEstimating : dayModalEditSaving)
            : false
          }
          headerAction={
            !(dayModalAdding || dayModalEditingId) ? (
              <button
                onClick={() => {
                  setDayModalAdding(true)
                  setDayModalEditStep('input')
                  setDayModalEditInput('')
                  setDayModalEditForm({ description: '', kcal: '', protein_g: '', carbs_g: '', fat_g: '', logged_at: localTime() })
                }}
                className="text-xs tracking-widest uppercase px-3 py-1.5 border border-emerald-400 text-emerald-400 rounded hover:bg-emerald-400 hover:text-gray-950 transition-colors"
              >
                + Add Meal
              </button>
            ) : null
          }
          maxWidth="max-w-2xl"
        >
          {(dayModalAdding || dayModalEditingId) ? (
            dayModalEditStep === 'input' ? (
              <div>
                <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">What did you eat?</label>
                <textarea
                  value={dayModalEditInput}
                  onChange={e => setDayModalEditInput(e.target.value)}
                  rows={3}
                  placeholder={dayModalAdding ? "e.g. 'chicken breast with rice and broccoli, about 200g chicken'" : "Describe the meal to re-estimate macros..."}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm placeholder-gray-700 focus:outline-none focus:border-emerald-400 resize-none"
                />
                <div className="mt-2 text-xs text-gray-600">Claude will estimate the macros. You can review and adjust before saving.</div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-gray-500">Review and adjust the values before saving.</div>
                <div>
                  <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Description</label>
                  <input value={dayModalEditForm.description} onChange={e => setDayModalEditForm(f => ({ ...f, description: e.target.value }))} className={`w-full ${inputCls}`} />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Time</label>
                    <input type="time" value={dayModalEditForm.logged_at} onChange={e => setDayModalEditForm(f => ({ ...f, logged_at: e.target.value }))} className={`w-full ${inputCls}`} />
                  </div>
                  <div className="flex-1">
                    <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Calories</label>
                    <input type="number" value={dayModalEditForm.kcal} onChange={e => setDayModalEditForm(f => ({ ...f, kcal: e.target.value }))} className={`w-full ${inputCls}`} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Protein (g)</label>
                    <input type="number" value={dayModalEditForm.protein_g} onChange={e => setDayModalEditForm(f => ({ ...f, protein_g: e.target.value }))} className={`w-full ${inputCls}`} />
                  </div>
                  <div>
                    <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Carbs (g)</label>
                    <input type="number" value={dayModalEditForm.carbs_g} onChange={e => setDayModalEditForm(f => ({ ...f, carbs_g: e.target.value }))} className={`w-full ${inputCls}`} />
                  </div>
                  <div>
                    <label className="text-sm tracking-widest uppercase text-gray-400 block mb-1">Fat (g)</label>
                    <input type="number" value={dayModalEditForm.fat_g} onChange={e => setDayModalEditForm(f => ({ ...f, fat_g: e.target.value }))} className={`w-full ${inputCls}`} />
                  </div>
                </div>
              </div>
            )
          ) : (
            /* Meal list for the selected day */
            (weekMealsByDate[dayModalDate] || []).length === 0 ? (
              <div className="text-sm text-gray-600 py-4 text-center">No meals logged for this day.</div>
            ) : (
              <div>
                <div className="grid grid-cols-12 gap-2 pb-2 border-b border-gray-800 mb-1">
                  <div className="col-span-1 text-xs text-gray-500 uppercase tracking-widest">Time</div>
                  <div className="col-span-5 text-xs text-gray-500 uppercase tracking-widest">Meal</div>
                  <div className="col-span-1 text-xs text-gray-500 uppercase tracking-widest text-right">kcal</div>
                  <div className="col-span-1 text-xs text-gray-500 uppercase tracking-widest text-right">P</div>
                  <div className="col-span-1 text-xs text-gray-500 uppercase tracking-widest text-right">C</div>
                  <div className="col-span-1 text-xs text-gray-500 uppercase tracking-widest text-right">F</div>
                  <div className="col-span-2" />
                </div>
                {(weekMealsByDate[dayModalDate] || []).map(meal => (
                  <div key={meal.id} className="grid grid-cols-12 gap-2 py-2.5 border-b border-gray-800 last:border-0 items-center group">
                    <div className="col-span-1 text-xs text-gray-500 truncate">{meal.time?.slice(0, 5) || '—'}</div>
                    <div className="col-span-5 text-sm text-white truncate min-w-0">{meal.description}</div>
                    <div className="col-span-1 text-xs text-amber-400 text-right">{Math.round(meal.kcal || 0)}</div>
                    <div className="col-span-1 text-xs text-emerald-400 text-right">{Math.round(meal.protein_g || 0)}g</div>
                    <div className="col-span-1 text-xs text-blue-400 text-right">{Math.round(meal.carbs_g || 0)}g</div>
                    <div className="col-span-1 text-xs text-purple-400 text-right">{Math.round(meal.fat_g || 0)}g</div>
                    <div className="col-span-2 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          setDayModalEditingId(meal.id)
                          setDayModalEditInput(meal.description)
                          setDayModalEditForm({
                            description: meal.description,
                            kcal: String(meal.kcal || ''),
                            protein_g: String(meal.protein_g || ''),
                            carbs_g: String(meal.carbs_g || ''),
                            fat_g: String(meal.fat_g || ''),
                            logged_at: meal.time?.slice(0, 5) || '',
                          })
                          setDayModalEditStep('review')
                        }}
                        className="text-xs text-gray-600 hover:text-white transition-colors uppercase tracking-widest"
                      >Edit</button>
                      <button
                        onClick={() => deleteDayMeal(meal.id)}
                        className="text-xs text-gray-600 hover:text-red-400 transition-colors uppercase tracking-widest"
                      >Del</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </Modal>
      )}

    </div>
  )
}
