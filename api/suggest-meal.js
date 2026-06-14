export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { remainingKcal = 0, remainingProtein = 0, remainingCarbs = 0, remainingFat = 0 } = req.body

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: 'You are a nutrition advisor. Suggest one practical, simple meal based on remaining daily macro targets. Give a concrete meal with a brief description and estimated macros. 3–4 sentences max.',
      messages: [{
        role: 'user',
        content: `Remaining today — Calories: ${remainingKcal} kcal, Protein: ${remainingProtein}g, Carbs: ${remainingCarbs}g, Fat: ${remainingFat}g. Suggest a meal.`,
      }],
    }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    return res.status(502).json({ error: 'Anthropic API error', detail: err })
  }

  const data = await resp.json()
  const suggestion = data.content?.[0]?.text || 'No suggestion available.'

  return res.status(200).json({ suggestion })
}
