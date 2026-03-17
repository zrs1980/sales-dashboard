import { hsGet, hsPost, CALEB_OWNER_ID } from './_hubspot.js'

export const config = { maxDuration: 30 }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const out = {}

  // 1. Try fetching the property definition
  try {
    out.property_api = await hsGet('/crm/v3/properties/calls/hs_call_disposition')
  } catch (e) { out.property_api_error = e.message }

  // 2. Sample a few calls to see what disposition GUIDs actually exist
  try {
    const data = await hsPost('/crm/v3/objects/calls/search', {
      filterGroups: [{ filters: [
        { propertyName: 'hubspot_owner_id', operator: 'EQ', value: CALEB_OWNER_ID },
        { propertyName: 'hs_call_disposition', operator: 'HAS_PROPERTY' },
      ]}],
      properties: ['hs_call_disposition', 'hs_call_status'],
      limit: 20,
    })
    out.sample_dispositions = [...new Set((data.results || []).map(c => c.properties?.hs_call_disposition).filter(Boolean))]
    out.sample_statuses = [...new Set((data.results || []).map(c => c.properties?.hs_call_status).filter(Boolean))]
  } catch (e) { out.sample_error = e.message }

  res.json(out)
}
