import { fetchLoopDeals, fetchLoopStages, fetchCebaDeals, fetchLeads, fetchSdr } from './_data.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  try {
    const loopStages = await fetchLoopStages()
    const loopDeals = await fetchLoopDeals()
    const ceba = await fetchCebaDeals()
    const leads = await fetchLeads()
    const sdr = await fetchSdr()

    res.json({
      loop: { deals: loopDeals, stages: loopStages },
      ceba,
      leads: { leads },
      sdr,
      refreshedAt: new Date().toISOString(),
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
