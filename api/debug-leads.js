import { hsGet, hsPost } from './_hubspot.js'

export const config = { maxDuration: 30 }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const out = {}

  // 1. Fetch all lead properties
  try {
    const data = await hsGet('/crm/v3/properties/leads')
    out.all_properties = (data.results || []).map(p => ({ name: p.name, label: p.label, type: p.type }))
  } catch (e) { out.properties_error = e.message }

  // 2. Fetch a sample lead with key fields
  const KEY_PROPS = [
    'hs_lead_name', 'hs_lead_label', 'hs_pipeline', 'hs_pipeline_stage',
    'hubspot_owner_id', 'hs_owner_ids', 'hs_all_owner_ids',
    'hs_priority', 'hs_lead_type', 'hs_lead_source',
    'hs_associated_contact_firstname', 'hs_associated_contact_lastname',
    'hs_associated_contact_email', 'hs_associated_company_name',
    'hs_calls_attempted_count', 'hs_calls_connected_count',
    'hs_last_activity_date', 'hs_next_activity_date', 'hs_createdate',
  ]
  try {
    const data = await hsPost('/crm/v3/objects/leads/search', {
      filterGroups: [],
      properties: KEY_PROPS,
      sorts: [{ propertyName: 'hs_createdate', direction: 'DESCENDING' }],
      limit: 3,
    })
    out.sample = (data.results || []).map(r => r.properties)
    out.total = data.total
  } catch (e) { out.sample_error = e.message }

  res.json(out)
}
