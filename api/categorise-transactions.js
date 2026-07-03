// Layer 3 (AI fallback) for statement import. Categorises the transactions that
// no keyword rule matched, in a single batched call. Follows the same pattern as
// api/estimate-meal.js — raw HTTP, server-side ANTHROPIC_API_KEY, claude-sonnet-4-6.
// The AI only suggests; every result still lands in Section C for Ben to confirm.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { merchants = [], categories = [] } = req.body || {}

  if (!Array.isArray(merchants) || merchants.length === 0) {
    return res.status(400).json({ error: 'merchants array is required' })
  }
  const allowed = Array.isArray(categories) && categories.length
    ? categories
    : ['Groceries', 'Eating Out', 'Transport', 'Subscriptions', 'Utilities',
       'Health & Wellness', 'Personal Care', 'Clothing & Retail', 'Entertainment', 'Vehicle', 'Miscellaneous']

  const systemPrompt = `You categorise Australian bank/credit-card transactions for a personal budget. ` +
    `Each input is a cleaned merchant description. Assign each to exactly one of these categories: ${allowed.join(', ')}. ` +
    `Use "Uncategorised" only if genuinely unclear. ` +
    `Return JSON only — a single array of category strings, one per input, in the SAME order and length as the input. ` +
    `No keys, no explanation, no markdown. Example for 2 inputs: ["Groceries","Eating Out"].`

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: JSON.stringify(merchants) }],
    }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    return res.status(502).json({ error: 'Anthropic API error', detail: err })
  }

  const data = await resp.json()
  const text = data.content?.[0]?.text?.trim() || '[]'

  try {
    let parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) parsed = []
    // Align to input length; anything missing or not in the allowed set → Uncategorised
    const result = merchants.map((_, i) => {
      const c = parsed[i]
      return typeof c === 'string' && allowed.includes(c) ? c : 'Uncategorised'
    })
    return res.status(200).json({ categories: result })
  } catch {
    return res.status(502).json({ error: 'Failed to parse model response', raw: text })
  }
}
