import { fetchMyTasks } from './_data.js'
import { hsGet } from './_hubspot.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const [tasks, ownersData] = await Promise.all([
      fetchMyTasks(),
      hsGet('/crm/v3/owners', { limit: 100 }),
    ])

    const owners = (ownersData.results || []).map(o => ({
      id: String(o.id),
      name: [o.firstName, o.lastName].filter(Boolean).join(' ') || o.email || String(o.id),
      email: o.email || '',
    }))

    res.json({ tasks, owners })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
