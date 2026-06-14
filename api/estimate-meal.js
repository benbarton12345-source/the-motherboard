export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { description, previousMeals = [] } = req.body

  if (!description) {
    return res.status(400).json({ error: 'description is required' })
  }

  const systemPrompt = `You are a nutrition estimator. The user describes what they ate. Yesterday's meals for reference: ${JSON.stringify(previousMeals)}. Return JSON only — exactly these keys: description, kcal, protein_g, carbs_g, fat_g. Numbers only for the macro fields. No markdown, no explanation.`

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
      system: systemPrompt,
      messages: [{ role: 'user', content: description }],
    }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    return res.status(502).json({ error: 'Anthropic API error', detail: err })
  }

  const data = await resp.json()
  const text = data.content?.[0]?.text?.trim() || '{}'

  try {
    const parsed = JSON.parse(text)
    return res.status(200).json({
      description: parsed.description || description,
      kcal: parsed.kcal ?? null,
      protein_g: parsed.protein_g ?? null,
      carbs_g: parsed.carbs_g ?? null,
      fat_g: parsed.fat_g ?? null,
    })
  } catch {
    return res.status(502).json({ error: 'Failed to parse model response', raw: text })
  }
}
