import Anthropic from '@anthropic-ai/sdk'

export const config = { maxDuration: 60 }

function daysSince(iso) {
  if (!iso) return null
  const d = new Date(parseInt(iso) || iso)
  if (isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

function daysUntil(iso) {
  if (!iso) return null
  const d = new Date(parseInt(iso) || iso)
  if (isNaN(d.getTime())) return null
  return Math.floor((d.getTime() - Date.now()) / 86400000)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { leads, stageMap = {}, pipelineMap = {} } = req.body || {}
  if (!leads || !Array.isArray(leads)) return res.status(400).json({ error: 'leads required' })

  // Focus on active leads: in the pipeline and not disqualified
  const engaged = leads.filter(l => {
    const p = l.properties || {}
    if (p.hs_lead_is_disqualified === 'true') return false
    // Must have a pipeline stage assigned
    return !!p.hs_pipeline_stage
  })

  if (engaged.length === 0) {
    return res.json({ insights: 'No engaged leads found to analyze.' })
  }

  const now = Date.now()

  const summaries = engaged.map(l => {
    const p = l.properties || {}

    const name = p.hs_lead_name ||
      [p.hs_associated_contact_firstname, p.hs_associated_contact_lastname].filter(Boolean).join(' ') ||
      p.hs_associated_contact_email || `Lead #${l.id}`
    const company = p.hs_associated_company_name || 'Unknown Company'
    const stage = stageMap[p.hs_pipeline_stage] || p.hs_pipeline_stage || 'Unknown Stage'
    const pipeline = pipelineMap[p.hs_pipeline] || p.hs_pipeline || 'Unknown Pipeline'
    const status = p.hs_lead_is_in_progress === 'true' ? 'In Progress' : 'Open'

    const calls = parseInt(p.hs_lead_call_count || p.hs_calls_attempted_count || 0)
    const emails = parseInt(p.hs_lead_email_count || 0)
    const meetings = parseInt(p.hs_lead_meeting_count || 0)
    const totalTouches = parseInt(p.hs_lead_outreach_activity_count || 0) || (calls + emails + meetings)

    const lastActivityDays = daysSince(p.hs_last_activity_date)
    const nextActivityDays = daysUntil(p.hs_next_activity_date)

    const createdDays = daysSince(p.hs_createdate)

    let lastStr = lastActivityDays === null ? 'NEVER contacted' : `last contacted ${lastActivityDays}d ago`
    let nextStr = nextActivityDays === null
      ? 'NO follow-up scheduled'
      : nextActivityDays < 0
        ? `follow-up OVERDUE by ${Math.abs(nextActivityDays)}d`
        : `next follow-up in ${nextActivityDays}d`

    const activityBreakdown = [
      calls > 0 ? `${calls} calls` : null,
      emails > 0 ? `${emails} emails` : null,
      meetings > 0 ? `${meetings} meetings` : null,
    ].filter(Boolean).join(', ') || 'no activity logged'

    return `- ${name} (${company}) | ${pipeline} → ${stage} | Status: ${status} | Created ${createdDays ?? '?'}d ago | ${lastStr} | ${nextStr} | Touches: ${totalTouches} (${activityBreakdown})`
  }).join('\n')

  const prompt = `You are a sales operations analyst reviewing the lead follow-up cadence for the Loop/CEBA sales team.

You are analyzing ${engaged.length} active leads to identify which ones have NOT been followed up with in a timely manner. The stage label tells you where each lead is in the pipeline. Leads in stages like "Attempting to Contact", "Connected", or any engaged stage should be contacted within 2-3 days and always have a scheduled next activity.

Engaged Leads:
${summaries}

Provide a concise analysis in exactly these three sections. Name specific leads — do not be vague.

**Requires Immediate Attention** — Leads that are most at risk due to no recent contact (7+ days), no follow-up scheduled, or overdue next activities. List each with the specific problem and the action needed.

**Follow-Up Gaps** — Leads with moderate delays (3-7 days since last contact) or insufficient touch volume relative to how long they've been in the pipeline. Flag any that have been in the pipeline for a long time with few touches.

**On Track** — Briefly note any leads that appear to be progressing well (recent contact + scheduled next step). Keep this section short.

Maximum 350 words. Be direct — use names and specific days.`

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
    res.json({ insights, engagedCount: engaged.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
