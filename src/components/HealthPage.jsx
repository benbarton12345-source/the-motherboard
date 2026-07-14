// ── Health section shell / router ───────────────────────────────────────────
// Owns the shared Health data (Apple Health logs, weight logs, meal logs,
// nutrition/target settings) so it's fetched once and survives navigation
// between the sub-pages, then routes to the active sub-screen. The five screens
// (Overview / Daily Metrics / Nutrition / Mood / Insights) are separate files;
// this replaces the old single flat Health page.
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../supabase'
import { DEFAULT_SETTINGS, localDate } from '../utils/healthHelpers'
import HealthOverview from './HealthOverview'
import HealthDailyMetrics from './HealthDailyMetrics'
import HealthNutrition from './HealthNutrition'
import HealthMood from './HealthMood'
import HealthInsights from './HealthInsights'

// How far back to pull passive metrics. Covers 30-day baselines, the 21-day
// maintenance window and 14-day insight cards with headroom to spare.
const APPLE_HEALTH_DAYS = 180

export default function HealthPage({ subItem, onOpenSub }) {
  const screen = subItem || 'overview'

  const [appleHealthLogs, setAppleHealthLogs] = useState([])
  const [weightLogs, setWeightLogs] = useState([])
  const [meals, setMeals] = useState([])
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [settingsId, setSettingsId] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchAppleHealth = useCallback(async () => {
    const { data } = await supabase
      .from('apple_health_logs')
      .select('*')
      .order('date', { ascending: false })
      .limit(APPLE_HEALTH_DAYS)
    if (data) setAppleHealthLogs(data)
  }, [])

  const fetchWeight = useCallback(async () => {
    const { data } = await supabase
      .from('weight_logs').select('*').order('date', { ascending: false })
    if (data) setWeightLogs(data)
  }, [])

  // All meals across all dates — powers today's log, trend windows, the full
  // meal library and the Insights adherence cards. Single-user app, so the row
  // count stays small enough to fetch wholesale.
  const fetchMeals = useCallback(async () => {
    const { data } = await supabase
      .from('meal_logs')
      .select('*')
      .order('date', { ascending: false })
      .order('time', { ascending: true })
    if (data) setMeals(data)
  }, [])

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase.from('health_settings').select('*').limit(1).maybeSingle()
    if (data) {
      setSettingsId(data.id)
      setSettings({ ...DEFAULT_SETTINGS, ...data })
    }
  }, [])

  useEffect(() => {
    Promise.all([fetchAppleHealth(), fetchWeight(), fetchMeals(), fetchSettings()])
      .finally(() => setLoading(false))
  }, [fetchAppleHealth, fetchWeight, fetchMeals, fetchSettings])

  // Persist (upsert) nutrition/target settings and reflect locally.
  const saveSettings = useCallback(async (updates) => {
    const merged = { ...settings, ...updates }
    const payload = { ...merged }
    delete payload.id
    if (settingsId) {
      const { error } = await supabase.from('health_settings').update(payload).eq('id', settingsId)
      if (error) console.error('health_settings update error:', error)
    } else {
      const { data, error } = await supabase.from('health_settings').insert(payload).select('id').maybeSingle()
      if (error) console.error('health_settings insert error:', error)
      if (data?.id) setSettingsId(data.id)
    }
    setSettings(merged)
  }, [settings, settingsId])

  // Today's meals, derived from the full set.
  const todayMeals = useMemo(
    () => meals.filter(m => m.date === localDate()),
    [meals],
  )

  const shared = {
    loading,
    appleHealthLogs,
    weightLogs,
    meals,
    todayMeals,
    settings,
    saveSettings,
    refetchAppleHealth: fetchAppleHealth,
    refetchWeight: fetchWeight,
    refetchMeals: fetchMeals,
    onOpenSub,
  }

  switch (screen) {
    case 'daily-metrics': return <HealthDailyMetrics {...shared} />
    case 'nutrition': return <HealthNutrition {...shared} />
    case 'mood': return <HealthMood />
    case 'insights': return <HealthInsights {...shared} />
    case 'overview':
    default: return <HealthOverview {...shared} />
  }
}
