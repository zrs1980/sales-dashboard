import Anthropic from '@anthropic-ai/sdk'

export const config = { maxDuration: 60 }

function getStageProb(stage) {
  const map = {
    'New Deal': 0.1, 'Req. Analysis': 0.2, 'Demo Booked': 0.3,
    'Demo Complete': 0.4, "Add'l Education": 0.5, 'Negotiation': 0.7,
    'Contract Sent': 0.85,
  }
  return map[stage] || 0.2
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { deals, stageMap, pipeline } = req.body || {}
  if (!deals || !Array.isArray(deals)) return res.status(400).json({ error: 'deals required' })

  const pipelineName = pipeline === 'ceba' ? 'CEBA (NS Net New)' : 'Loop ERP'
  const now = Date.now()

  const summaries = deals.map(d => {
    const p = d.properties || {}
    const stage = (stageMap && stageMap[p.dealstage]) || p.dealstage || 'Unknown'
    const amount = parseFloat(p.amount || 0)

    let closeStr = 'no close date'
    let daysUntilClose = null
    if (p.closedate) {
      const s = String(p.closedate)
      const cd = /^\d+$/.test(s) ? new Date(parseInt(s)) : new Date(s)
      if (!isNaN(cd.getTime())) {
        closeStr = cd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
        daysUntilClose = Math.floor((cd.getTime() - now) / 86400000)
        closeStr += daysUntilClose < 0
          ? ` (${Math.abs(daysUntilClose)}d overdue)`
          : ` (${daysUntilClose}d away)`
      }
    }

    let daysInStage = null
    if (p.hs_lastmodifieddate) {
      const s = String(p.hs_lastmodifieddate)
      const d2 = /^\d+$/.test(s) ? new Date(parseInt(s)) : new Date(s)
      if (!isNaN(d2.getTime())) daysInStage = Math.floor((now - d2.getTime()) / 86400000)
    }

    return `- ${p.dealname || 'Unnamed'}: ${stage}, $${amount.toLocaleString()}, closes ${closeStr}` +
      (daysInStage !== null ? `, ${daysInStage}d in stage` : '') +
      `, ${p.num_notes || 0} notes`
  }).join('\n')

  const total = deals.reduce((s, d) => s + parseFloat(d.properties?.amount || 0), 0)
  const weighted = deals.reduce((s, d) => {
    const p = d.properties || {}
    const stage = (stageMap && stageMap[p.dealstage]) || p.dealstage || ''
    const amt = parseFloat(p.amount || 0)
    const prob = parseFloat(p.hs_deal_stage_probability || getStageProb(stage))
    return s + amt * prob
  }, 0)

  const prompt = `You are a senior sales analyst reviewing the ${pipelineName} pipeline for Ryan McQuillan.

Pipeline: ${deals.length} open deals | Total value: $${total.toLocaleString()} | Weighted: $${Math.round(weighted).toLocaleString()}

Open Deals:
${summaries}

Provide a strategic analysis in exactly these four sections. Be specific — name deals by name.

**Pipeline Health** — 2-3 sentences on overall momentum, coverage, and any patterns worth noting.

**Prioritize Now** — The 2-3 deals that need Ryan's attention this week and the exact next action for each.

**Revenue at Risk** — Deals showing red flags: stalled 60+ days, overdue close dates, or zero notes. What's the risk and what should be done.

**Likely to Close This Month** — Which deals are realistic closes in the next 30 days and what's standing in the way.

Maximum 380 words. Be direct and actionable.`

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const stream = client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      messages: [{ role: 'user', content: prompt }],
    })
    const message = await stream.finalMessage()
    const insights = message.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
    res.json({ insights })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
