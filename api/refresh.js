import { fetchLoopDeals, fetchLoopStages, fetchDealCountries, fetchCebaDeals, fetchCebaStages, fetchLeads, fetchSdr, fetchSdrMeetings } from './_data.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  try {
    const loopStages = await fetchLoopStages()
    const loopDeals = await fetchLoopDeals()
    const loopCountries = await fetchDealCountries(loopDeals.map(d => d.id))
    for (const deal of loopDeals) {
      deal.properties.company_country = loopCountries[deal.id] || ''
    }
    const cebaStages = await fetchCebaStages()
    const ceba = await fetchCebaDeals()
    const leads = await fetchLeads()
    const sdrCalls = await fetchSdr()
    const sdrMeetings = await fetchSdrMeetings()

    res.json({
      loop: { deals: loopDeals, stages: loopStages },
      ceba: { ...ceba, stages: cebaStages },
      leads: { leads },
      sdr: { calls: sdrCalls, meetings: sdrMeetings },
      refreshedAt: new Date().toISOString(),
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
