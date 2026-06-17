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
    // ── Step count: deduplicate per-minute samples across overlapping sources
    const stepMetrics = metrics.filter(m => (m.name || '').toLowerCase() === 'step_count')
    if (stepMetrics.length > 0) {
      const stepSamples = []
      for (const metric of stepMetrics) {
        console.log('health-sync step metric:', JSON.stringify({ name: metric.name, entryCount: metric.data?.length }))
        for (const entry of metric.data || []) {
          const date = dateKey(entry.date)
          if (!date || entry.qty == null) continue
          const source = entry.source ?? entry.sourceName ?? entry.device ?? ''
          const qty = Math.round(entry.qty)
          console.log('health-sync step sample:', JSON.stringify({ date, timestamp: entry.date, qty, source }))
          stepSamples.push({ date, timestamp: String(entry.date), qty, source })
        }
      }

      if (stepSamples.length > 0) {
        // Deduplicate within this payload: for each (date, timestamp), keep max qty across sources.
        // The table has unique(date, timestamp) so we can only store one row per minute.
        const sampleMap = {}
        for (const s of stepSamples) {
          const key = `${s.date}|${s.timestamp}`
          if (!sampleMap[key] || s.qty > sampleMap[key].qty) sampleMap[key] = s
        }
        const dedupedSamples = Object.values(sampleMap)

        const { error: sampleErr } = await supabase
          .from('apple_health_step_samples')
          .upsert(dedupedSamples, { onConflict: 'date,timestamp' })
        if (sampleErr) console.error('health-sync step_samples upsert error:', sampleErr)

        // Recompute daily total from the full samples table — one row per timestamp, so direct sum is correct
        const affectedDates = [...new Set(stepSamples.map(s => s.date))]
        for (const date of affectedDates) {
          const { data: allSamples, error: fetchErr } = await supabase
            .from('apple_health_step_samples')
            .select('qty')
            .eq('date', date)
          if (fetchErr) { console.error('health-sync step_samples fetch error:', fetchErr); continue }

          const total = Math.round((allSamples || []).reduce((sum, s) => sum + s.qty, 0))
          console.log('health-sync step daily total:', JSON.stringify({ date, sampleCount: allSamples?.length, total }))
          ;(byDate[date] ||= {}).steps = total
        }
      }
    }

    // ── All other metrics (sleep, HRV, resting HR, active calories)
    for (const metric of metrics) {
      const name = (metric.name || '').toLowerCase()
      if (name === 'step_count') continue

      const isSleep = name.includes('sleep')
      if (isSleep) {
        console.log('health-sync sleep metric:', JSON.stringify({ name: metric.name, units: metric.units, data: metric.data }))
      }

      for (const entry of metric.data || []) {
        const date = dateKey(entry.date)
        if (!date) continue

        const row = (byDate[date] ||= {})

        if (isSleep) {
          if (entry.totalSleep != null) {
            row.sleep_minutes = Math.round(entry.totalSleep * 60)
          }
        } else if (name.includes('heart_rate_variability') || name.includes('hrv')) {
          if (entry.qty != null) row.hrv_ms = entry.qty
        } else if (name.includes('resting_heart_rate')) {
          if (entry.qty != null) row.resting_hr = entry.qty
        } else if (name.includes('active_energy') || name.includes('active_calorie')) {
          if (entry.qty != null) row.active_calories = (row.active_calories || 0) + entry.qty
        }
      }
    }
  }

  if (Array.isArray(stateOfMind)) {
    for (const entry of stateOfMind) {
      const date = dateKey(entry.start || entry.end || entry.date)
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
