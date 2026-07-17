import { fetchAllTasks } from './_data.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { tasks, properties, truncated } = await fetchAllTasks()
    res.json({ tasks, properties, truncated })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
