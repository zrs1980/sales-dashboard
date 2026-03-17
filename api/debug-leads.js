import { hsGet, hsPost } from './_hubspot.js'

export const config = { maxDuration: 30 }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const out = {}

  // 1. Try fetching leads object via v3
  try {
    const data = await hsPost('/crm/v3/objects/leads/search', {
      filterGroups: [],
      properties: [],
      limit: 3,
    })
    out.v3_search_sample = (data.results || []).slice(0, 2)
    out.v3_total = data.total
  } catch (e) { out.v3_search_error = e.message }

  // 2. Try listing leads properties
  try {
    const data = await hsGet('/crm/v3/properties/leads')
    out.lead_properties = (data.results || []).map(p => p.name).slice(0, 30)
  } catch (e) { out.lead_properties_error = e.message }

  res.json(out)
}
