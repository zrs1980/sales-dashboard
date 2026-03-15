import { fetchCebaDeals } from '../_data.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  try {
    const { open, closed } = await fetchCebaDeals()
    res.json({ open, closed })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
