import { fetchLeads } from './_data.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  try {
    const leads = await fetchLeads()
    res.json({ leads })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
