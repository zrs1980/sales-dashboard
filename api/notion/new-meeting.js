const NOTION_BASE = 'https://api.notion.com/v1'

function notionHeaders() {
  return {
    'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  }
}

async function notionGet(path) {
  const res = await fetch(`${NOTION_BASE}${path}`, { headers: notionHeaders() })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `Notion GET ${path} → ${res.status}`)
  }
  return res.json()
}

async function notionPost(path, body) {
  const res = await fetch(`${NOTION_BASE}${path}`, {
    method: 'POST',
    headers: notionHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `Notion POST ${path} → ${res.status}`)
  }
  return res.json()
}

async function notionPatch(path, body) {
  const res = await fetch(`${NOTION_BASE}${path}`, {
    method: 'PATCH',
    headers: notionHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `Notion PATCH ${path} → ${res.status}`)
  }
  return res.json()
}

function extractPageId(url) {
  const match = (url || '').match(/([a-f0-9]{32})/)
  if (!match) return null
  const id = match[1]
  return `${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}`
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { notionLink } = req.body || {}
  if (!notionLink) return res.status(400).json({ error: 'notionLink is required' })

  const pageId = extractPageId(notionLink)
  if (!pageId) return res.status(400).json({ error: 'Could not extract page ID from notionLink' })

  try {
    // 1. Find the Sales Meeting Notes database inside the account page
    const blocksData = await notionGet(`/blocks/${pageId}/children?page_size=100`)
    const meetingDb = (blocksData.results || []).find(b =>
      b.type === 'child_database' && b.child_database?.title === 'Sales Meeting Notes'
    )

    if (!meetingDb) {
      return res.status(404).json({ error: 'Sales Meeting Notes database not found in this account page. The account may have been created before this feature was added.' })
    }

    // 2. Create a new meeting record with today's date
    const today = new Date().toISOString().split('T')[0]
    const newMeeting = await notionPost('/pages', {
      parent: { database_id: meetingDb.id },
      properties: {
        'Meeting Name': {
          title: [{ type: 'text', text: { content: 'Sales Meeting' } }],
        },
        'Meeting Date': {
          date: { start: today },
        },
      },
    })

    // 3. Append an AI Meeting Notes block directly to the page
    try {
      await notionPatch(`/blocks/${newMeeting.id}/children`, {
        children: [{ type: 'meeting_notes', meeting_notes: {} }],
      })
    } catch {
      // meeting_notes block not accepted — page still opens fine
    }

    res.json({ meetingUrl: newMeeting.url })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
