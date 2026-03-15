import { fetchLoopDeals } from '../_data.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  try {
    const deals = await fetchLoopDeals()
    res.json({ deals })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
