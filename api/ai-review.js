import Anthropic from '@anthropic-ai/sdk'

const NOTION_BASE = 'https://api.notion.com/v1'
const HS_BASE = 'https://api.hubapi.com'

// Vercel: allow up to 60s for this endpoint
export const config = { maxDuration: 60 }

function notionHeaders() {
  return {
    'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
  }
}

function hsHeaders() {
  return {
    'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}`,
    'Content-Type': 'application/json',
  }
}

function blockToText(block, prefix = '') {
  const type = block.type
  const content = block[type]
  if (!content) return null
  if (type === 'to_do') {
    const text = content.rich_text?.map(t => t.plain_text).join('') || ''
    return text ? `${prefix}[${content.checked ? 'x' : ' '}] ${text}` : null
  }
  if (type === 'child_page') return `${prefix}📄 Sub-page: ${content.title}`
  if (!content.rich_text) return null
  const text = content.rich_text.map(t => t.plain_text).join('')
  return text.trim() ? `${prefix}${text}` : null
}

async function fetchNotionContent(pageId, depth = 0) {
  if (depth > 2) return []
  try {
    const res = await fetch(`${NOTION_BASE}/blocks/${pageId}/children?page_size=50`, { headers: notionHeaders() })
    if (!res.ok) return []
    const data = await res.json()
    const lines = []
    for (const block of data.results || []) {
      const line = blockToText(block, depth > 0 ? '  '.repeat(depth) : '')
      if (line) lines.push(line)
      if (block.type === 'child_page' && block.id && depth < 2) {
        const sub = await fetchNotionContent(block.id, depth + 1)
        lines.push(...sub)
      }
    }
    return lines
  } catch {
    return []
  }
}

async function fetchDealNotes(dealId) {
  try {
    // Step 1: get associated note IDs
    const assocRes = await fetch(`${HS_BASE}/crm/v4/objects/deals/${dealId}/associations/notes`, { headers: hsHeaders() })
    if (!assocRes.ok) return []
    const assocData = await assocRes.json()
    const noteIds = (assocData.results || []).map(r => String(r.toObjectId)).slice(0, 20)
    if (noteIds.length === 0) return []

    // Step 2: batch read
    const notesRes = await fetch(`${HS_BASE}/crm/v3/objects/notes/batch/read`, {
      method: 'POST',
      headers: hsHeaders(),
      body: JSON.stringify({
        inputs: noteIds.map(id => ({ id })),
        properties: ['hs_note_body', 'hs_timestamp'],
      }),
    })
    if (!notesRes.ok) return []
    const notesData = await notesRes.json()
    return (notesData.results || [])
      .sort((a, b) => Number(b.properties?.hs_timestamp || 0) - Number(a.properties?.hs_timestamp || 0))
      .map(n => n.properties?.hs_note_body)
      .filter(Boolean)
  } catch {
    return []
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const { dealId, notionPageId, dealName } = req.query
  if (!dealId) return res.status(400).json({ error: 'dealId required' })

  try {
    const [notes, notionLines] = await Promise.all([
      fetchDealNotes(dealId),
      notionPageId ? fetchNotionContent(notionPageId) : Promise.resolve([]),
    ])

    const notesSection = notes.length
      ? notes.slice(0, 10).map((n, i) => `[Note ${i + 1}]\n${n.slice(0, 800)}`).join('\n\n')
      : 'No notes logged in HubSpot.'

    const notionSection = notionLines.length
      ? notionLines.join('\n')
      : 'No Notion page linked or page is empty.'

    const prompt = `You are a sales analyst reviewing a CRM deal for a sales manager. Analyze the following deal information and provide actionable insights.

Deal: ${dealName || dealId}

## HubSpot Notes (most recent first)
${notesSection}

## Notion Page Content (including sub-pages and tasks)
${notionSection}

Provide a structured analysis with these four sections:

**Deal Status** — Current situation in 1-2 sentences.

**Key Risks** — Top 2-3 obstacles or concerns that could block the deal.

**Next Actions** — 2-3 specific, immediate steps the sales manager should take.

**Momentum** — One of: Positive / Neutral / Stalled / At Risk — and one sentence why.

Be concise and direct. Maximum 250 words.`

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const stream = client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      messages: [{ role: 'user', content: prompt }],
    })

    const message = await stream.finalMessage()
    const analysis = message.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')

    res.json({ analysis })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
