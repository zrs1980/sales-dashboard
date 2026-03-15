import Anthropic from '@anthropic-ai/sdk'

export const config = { maxDuration: 60 }

function parseTs(raw) {
  if (!raw) return null
  const s = String(raw)
  const d = /^\d+$/.test(s) ? new Date(parseInt(s)) : new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function getWindowStart(period) {
  const now = new Date()
  if (period === 'day') return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (period === 'week') {
    const d = new Date(now)
    d.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    d.setHours(0, 0, 0, 0)
    return d
  }
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

function fmtDuration(ms) {
  const secs = Math.floor(ms / 1000)
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { calls = [], meetings = [], period = 'week' } = req.body || {}

  const start = getWindowStart(period)
  const periodLabel = period === 'day' ? 'today' : period === 'week' ? 'this week' : 'this month'
  const targets = { day: { calls: 75, meetings: 1 }, week: { calls: 375, meetings: 5 }, month: { calls: 1500, meetings: 20 } }
  const target = targets[period]

  const periodCalls = calls.filter(c => {
    const d = parseTs(c.properties?.hs_timestamp)
    return d && d >= start
  })

  const outcomes = {}
  let totalDuration = 0
  let connectedWithDuration = 0
  for (const call of periodCalls) {
    const s = call.properties?.hs_call_status || 'UNKNOWN'
    outcomes[s] = (outcomes[s] || 0) + 1
    if (s === 'CONNECTED' && call.properties?.hs_call_duration) {
      totalDuration += parseInt(call.properties.hs_call_duration)
      connectedWithDuration++
    }
  }

  const connected = outcomes.CONNECTED || 0
  const connectRate = periodCalls.length > 0 ? Math.round((connected / periodCalls.length) * 100) : 0
  const avgDuration = connectedWithDuration > 0 ? fmtDuration(totalDuration / connectedWithDuration) : 'N/A'

  const periodMeetings = meetings.filter(m => {
    const d = parseTs(m.properties?.hs_timestamp)
    return d && d >= start
  })

  const meetingOutcomes = {}
  for (const m of meetings) {
    const o = m.properties?.hs_meeting_outcome || 'SCHEDULED'
    meetingOutcomes[o] = (meetingOutcomes[o] || 0) + 1
  }

  const outcomeLines = Object.entries(outcomes)
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `  ${s}: ${n}`)
    .join('\n')

  const meetingOutcomeLines = Object.entries(meetingOutcomes)
    .sort((a, b) => b[1] - a[1])
    .map(([o, n]) => `  ${o}: ${n}`)
    .join('\n') || '  No meeting outcome data'

  const prompt = `You are a sales manager (Ryan McQuillan) reviewing your SDR Caleb Wilton's performance.

Period: ${periodLabel}
Calls made: ${periodCalls.length} / target ${target.calls} (${Math.round((periodCalls.length / target.calls) * 100)}% of target)
Connect rate: ${connectRate}% (${connected} connected of ${periodCalls.length} dials)
Avg talk time on connected calls: ${avgDuration}
Meetings booked ${periodLabel}: ${periodMeetings.length} / target ${target.meetings}
Total SDR→Sales appointments (90 days): ${meetings.length}

Call outcomes ${periodLabel}:
${outcomeLines || '  No calls in period'}

Meeting outcomes (all time):
${meetingOutcomeLines}

Provide a concise coaching analysis in exactly these three sections:

**Activity & Volume** — Is Caleb hitting his call targets? What does the pacing look like and is he on track?

**Quality & Conversion** — How is the connect rate? Are booked meetings converting to completed appointments, or are there no-shows/cancellations to address?

**Coaching Focus** — The single most impactful thing Ryan should work on with Caleb this week to improve results.

Maximum 250 words. Be direct and specific.`

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const stream = client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 800,
      thinking: { type: 'adaptive' },
      messages: [{ role: 'user', content: prompt }],
    })
    const message = await stream.finalMessage()
    const insights = message.content.filter(b => b.type === 'text').map(b => b.text).join('')
    res.json({ insights })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
