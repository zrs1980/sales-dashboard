import { hsPatch } from '../_hubspot.js'

const NOTION_BASE = 'https://api.notion.com/v1'
const DATABASE_ID = '240f8201-2f2c-80f1-80d3-d7746cca32b0'
const PORTAL_ID = '243159630'

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { leadId, leadName } = req.body || {}
  if (!leadId || !leadName) {
    return res.status(400).json({ error: 'leadId and leadName are required' })
  }

  try {
    const db = await notionGet(`/databases/${DATABASE_ID}`)
    const titleProp = Object.entries(db.properties).find(([, v]) => v.type === 'title')?.[0]
    if (!titleProp) throw new Error('Could not find title property in Notion database')

    const hsUrl = `https://app-na2.hubspot.com/contacts/${PORTAL_ID}/record/0-136/${leadId}`

    const newPage = await notionPost('/pages', {
      parent: { database_id: DATABASE_ID },
      properties: {
        [titleProp]: {
          title: [{ type: 'text', text: { content: leadName } }],
        },
        'Account Type': {
          select: { name: 'Lead' },
        },
        'Company': {
          multi_select: [{ name: 'Loop ERP' }],
        },
        'Stage': {
          multi_select: [{ name: 'New Lead' }],
        },
        'Hubsport Deal URL': {
          url: hsUrl,
        },
      },
    })

    const newPageId = newPage.id
    const notionUrl = newPage.url

    // Add inline Meeting Notes database matching the Loop Meeting Notes schema
    await notionPost(`/databases`, {
      parent: { type: 'page_id', page_id: newPageId },
      title: [{ type: 'text', text: { content: 'Meeting Notes' } }],
      is_inline: true,
      properties: {
        'Meeting Name': { title: {} },
        'Date': { date: {} },
        'Text': { rich_text: {} },
      },
    })

    await hsPatch(`/crm/v3/objects/leads/${leadId}`, {
      properties: { notion_link: notionUrl },
    })

    res.json({ notionUrl })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
