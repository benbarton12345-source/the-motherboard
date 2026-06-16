import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

function dateKey(raw) {
  return String(raw).slice(0, 10)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const metrics = req.body?.data?.metrics
  const stateOfMind = req.body?.data?.stateOfMind

  if (!Array.isArray(metrics) && !Array.isArray(stateOfMind)) {
    console.error('health-sync: no recognised data in payload', req.body)
    return res.status(400).json({ error: 'Invalid payload' })
  }

  const byDate = {}
  const moodCounts = {}

  if (Array.isArray(metrics)) {
    for (const metric of metrics) {
      const name = (metric.name || '').toLowerCase()
      const unitToMinutes = metric.units === 'min' ? 1 : 60

      for (const entry of metric.data || []) {
        const date = dateKey(entry.date)
        const qty = entry.qty ?? entry.asleep ?? null
        if (!date || qty == null) continue

        const row = (byDate[date] ||= {})

        if (name.includes('step')) {
          row.steps = (row.steps || 0) + qty
        } else if (name.includes('sleep') || name.includes('sleepanalysis')) {
          row.sleep_minutes = (row.sleep_minutes || 0) + qty * unitToMinutes
        } else if (name.includes('heart_rate_variability') || name.includes('hrv')) {
          row.hrv_ms = qty
        } else if (name.includes('resting_heart_rate')) {
          row.resting_hr = qty
        } else if (name.includes('active_energy') || name.includes('active_calorie')) {
          row.active_calories = (row.active_calories || 0) + qty
        }
      }
    }
  }

  if (Array.isArray(stateOfMind)) {
    for (const entry of stateOfMind) {
      const date = dateKey(entry.date || entry.start || entry.end)
      const value = entry.valence ?? entry.value ?? entry.qty ?? entry.score
      if (!date || value == null) continue

      const row = (byDate[date] ||= {})
      const n = (moodCounts[date] || 0) + 1
      row.mood_score = ((row.mood_score || 0) * (n - 1) + value) / n
      moodCounts[date] = n
    }
  }

  const dates = Object.keys(byDate)
  if (dates.length === 0) {
    console.error('health-sync: no recognised metrics in payload', req.body)
    return res.status(400).json({ error: 'No recognised metrics in payload' })
  }

  const rows = dates.map(date => {
    const row = { date, ...byDate[date] }
    if (row.steps != null) row.steps = Math.round(row.steps)
    if (row.active_calories != null) row.active_calories = Math.round(row.active_calories)
    if (row.resting_hr != null) row.resting_hr = Math.round(row.resting_hr)
    if (row.mood_score != null) row.mood_score = Math.round(((row.mood_score + 1) / 2) * 9 + 1)
    return row
  })

  const { error } = await supabase.from('apple_health_logs').upsert(rows, { onConflict: 'date' })
  if (error) {
    console.error('health-sync upsert error:', error)
    return res.status(500).json({ error: 'Database error' })
  }

  return res.status(200).json({ ok: true })
}
