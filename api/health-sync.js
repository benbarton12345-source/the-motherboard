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
  if (!Array.isArray(metrics)) {
    console.error('health-sync: no metrics array in payload', req.body)
    return res.status(400).json({ error: 'Invalid payload' })
  }

  const byDate = {}

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
      } else if (name.includes('sleep')) {
        row.sleep_minutes = (row.sleep_minutes || 0) + qty * unitToMinutes
      } else if (name.includes('heart_rate_variability') || name.includes('hrv')) {
        row.hrv_ms = qty
      } else if (name.includes('resting_heart_rate')) {
        row.resting_heart_rate = qty
      } else if (name.includes('active_energy') || name.includes('active_calorie')) {
        row.active_calories = (row.active_calories || 0) + qty
      }
    }
  }

  const dates = Object.keys(byDate)
  if (dates.length === 0) {
    console.error('health-sync: no recognised metrics in payload', req.body)
    return res.status(400).json({ error: 'No recognised metrics in payload' })
  }

  const rows = dates.map(date => ({ date, ...byDate[date], updated_at: new Date().toISOString() }))

  const { error } = await supabase.from('apple_health_logs').upsert(rows, { onConflict: 'date' })
  if (error) {
    console.error('health-sync upsert error:', error)
    return res.status(500).json({ error: 'Database error' })
  }

  return res.status(200).json({ ok: true })
}
