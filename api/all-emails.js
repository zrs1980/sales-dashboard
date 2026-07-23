import { fetchAllEmailsFull } from './_data.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // start / end = 'YYYY-MM-DD' — scope the query server-side to a [start, end) window
    // so each Emails tab is an independent sub-query that stays under HubSpot's 10k cap.
    const start = req.query?.start
    const end = req.query?.end
    const { emails, properties, truncated } = await fetchAllEmailsFull({ start, end })
    res.json({ emails, properties, truncated })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
