import { hsPatch } from '../_hubspot.js'

const NOTION_BASE = 'https://api.notion.com/v1'
const DATABASE_ID = '245f8201-2f2c-806c-8e09-f9330cd5507d'

function notionHeaders() {
  return {
    'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  }
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

  const { dealId, dealName } = req.body || {}
  if (!dealId || !dealName) {
    return res.status(400).json({ error: 'dealId and dealName are required' })
  }

  try {
    // 1. Create the account page in the CEBA Only Account Database
    const newPage = await notionPost('/pages', {
      parent: { database_id: DATABASE_ID },
      properties: {
        'Company ': {
          title: [{ type: 'text', text: { content: dealName } }],
        },
        'Account Type': {
          select: { name: 'Prospect' },
        },
      },
    })

    const newPageId = newPage.id
    const notionUrl = newPage.url

    // 2. Create child databases matching the template structure (run in parallel)
    await Promise.all([
      // Sales Meeting Notes — full-page database with meeting tracking schema
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

      // Documents — inline database
      notionPost('/databases', {
        parent: { type: 'page_id', page_id: newPageId },
        title: [{ type: 'text', text: { content: 'Documents' } }],
        is_inline: true,
        properties: {
          'Name': { title: {} },
        },
      }),
    ])

    // 3. Write the Notion link back to the HubSpot deal
    await hsPatch(`/crm/v3/objects/deals/${dealId}`, {
      properties: { notion_link: notionUrl },
    })

    res.json({ notionUrl })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
