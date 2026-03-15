const NOTION_BASE = 'https://api.notion.com/v1'

function notionHeaders() {
  return {
    'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  }
}

function extractPageId(input) {
  // Already a clean UUID
  if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input)) {
    return input
  }
  // Raw 32-char hex
  const match = input.match(/([a-f0-9]{32})/)
  if (match) {
    const id = match[1]
    return `${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}`
  }
  return null
}

function blockToText(block) {
  const type = block.type
  const content = block[type]
  if (!content?.rich_text) return null
  const text = content.rich_text.map(t => t.plain_text).join('')
  if (!text.trim()) return null
  return text
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const { pageId: raw } = req.query
  const pageId = extractPageId(decodeURIComponent(raw))

  if (!pageId) {
    return res.status(400).json({ error: 'Invalid page ID' })
  }

  try {
    const [pageRes, blocksRes] = await Promise.all([
      fetch(`${NOTION_BASE}/pages/${pageId}`, { headers: notionHeaders() }),
      fetch(`${NOTION_BASE}/blocks/${pageId}/children?page_size=100`, { headers: notionHeaders() }),
    ])

    if (!pageRes.ok) {
      const err = await pageRes.json()
      return res.status(pageRes.status).json({ error: err.message || 'Notion page not found' })
    }

    const blocks = blocksRes.ok ? await blocksRes.json() : { results: [] }
    const lines = (blocks.results || [])
      .map(blockToText)
      .filter(Boolean)

    res.json({ pageId, lines })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
