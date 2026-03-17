import { hsGet, hsPost } from './_hubspot.js'

export const config = { maxDuration: 30 }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const engId = '347874573019'
  const results = {}

  // 1. Try fetching as v3 meeting object
  try {
    results.v3_meeting = await hsGet(`/crm/v3/objects/meetings/${engId}`, {
      properties: 'hs_meeting_type,hs_meeting_title,hs_timestamp,hubspot_owner_id,hs_meeting_outcome,hs_created_by_user_id',
    })
  } catch (e) { results.v3_error = e.message }

  // 2. Try fetching as v1 engagement
  try {
    results.v1_engagement = await hsGet(`/engagements/v1/engagements/${engId}`)
  } catch (e) { results.v1_error = e.message }

  // 3. Show all hs_meeting_type values found in last 90 days (no type filter)
  try {
    const since = Date.now() - 90 * 24 * 60 * 60 * 1000
    const data = await hsPost('/crm/v3/objects/meetings/search', {
      filterGroups: [{ filters: [
        { propertyName: 'hs_timestamp', operator: 'GTE', value: String(since) },
      ]}],
      properties: ['hs_meeting_type', 'hs_meeting_title'],
      limit: 100,
    })
    const typeCounts = {}
    for (const m of data.results || []) {
      const t = m.properties?.hs_meeting_type || '(empty)'
      typeCounts[t] = (typeCounts[t] || 0) + 1
    }
    results.v3_type_counts = typeCounts
    results.v3_total_last90 = data.total
  } catch (e) { results.v3_sample_error = e.message }

  res.json(results)
}
