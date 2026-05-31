import { hsPatch } from '../_hubspot.js'

const NOTION_BASE = 'https://api.notion.com/v1'
const DATABASE_ID = '240f8201-2f2c-80f1-80d3-d7746cca32b0'

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
    // 1. Find the title property name dynamically
    const db = await notionGet(`/databases/${DATABASE_ID}`)
    const titleProp = Object.entries(db.properties).find(([, v]) => v.type === 'title')?.[0]
    if (!titleProp) throw new Error('Could not find title property in Notion database')

    // 2. Create the account page with Account Type = Lead
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
      },
    })

    const newPageId = newPage.id
    const notionUrl = newPage.url

    // 3. Create child databases
    await Promise.all([
      notionPost('/databases', {
        parent: { type: 'page_id', page_id: newPageId },
        title: [{ type: 'text', text: { content: 'Sales Meeting Notes' } }],
        is_inline: false,
        properties: {
          'Meeting Name': { title: {} },
          'Meeting Date': { date: {} },
          'Select': {
            select: {
              options: [
                { name: 'External', color: 'red' },
                { name: 'Internal', color: 'green' },
              ],
            },
          },
          'Text': { rich_text: {} },
        },
      }),
      notionPost('/databases', {
        parent: { type: 'page_id', page_id: newPageId },
        title: [{ type: 'text', text: { content: 'Documents' } }],
        is_inline: true,
        properties: {
          'Name': { title: {} },
        },
      }),
    ])

    // 4. Write the Notion link back to the HubSpot lead record
    await hsPatch(`/crm/v3/objects/leads/${leadId}`, {
      properties: { notion_link: notionUrl },
    })

    res.json({ notionUrl })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
