import { fetchLoopDeals, fetchLoopStages, fetchDealCountries, fetchCebaDeals, fetchCebaStages, fetchLeads, fetchSdr, fetchSdrMeetings, fetchCallDispositions } from './_data.js'

const sleep = ms => new Promise(r => setTimeout(r, ms))

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  try {
    const loopStages = await fetchLoopStages()
    await sleep(300)
    const loopDeals = await fetchLoopDeals()
    await sleep(300)
    const loopCountries = await fetchDealCountries(loopDeals.map(d => d.id))
    for (const deal of loopDeals) {
      deal.properties.company_country = loopCountries[deal.id] || ''
    }
    await sleep(300)
    const cebaStages = await fetchCebaStages()
    await sleep(300)
    const ceba = await fetchCebaDeals()
    await sleep(300)
    const leads = await fetchLeads()
    await sleep(300)
    const sdrCalls = await fetchSdr()
    await sleep(300)
    const sdrMeetings = await fetchSdrMeetings()
    await sleep(300)
    const callDispositions = await fetchCallDispositions()

    res.json({
      loop: { deals: loopDeals, stages: loopStages },
      ceba: { ...ceba, stages: cebaStages },
      leads: { leads },
      sdr: { calls: sdrCalls, meetings: sdrMeetings, callDispositions },
      refreshedAt: new Date().toISOString(),
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
