import { hsGet } from './_hubspot.js'

export const config = { maxDuration: 30 }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const results = {}

  // 1. Fetch first page of v1 engagements and show structure
  try {
    const page = await hsGet('/engagements/v1/engagements/paged', { limit: 10, offset: 0 })
    results.v1_first_page = {
      hasMore: page.hasMore,
      total: page.total,
      count: (page.results || []).length,
      sample: (page.results || []).slice(0, 3).map(e => ({
        id: e.engagement?.id,
        type: e.engagement?.type,
        activityType: e.engagement?.activityType,
        timestamp: e.engagement?.timestamp,
        ownerId: e.engagement?.ownerId,
      })),
    }
  } catch (e) { results.v1_error = e.message }

  // 2. Fetch the known engagement directly
  try {
    const eng = await hsGet('/engagements/v1/engagements/347874573019')
    results.known_engagement = {
      id: eng.engagement?.id,
      type: eng.engagement?.type,
      activityType: eng.engagement?.activityType,
      timestamp: eng.engagement?.timestamp,
      ownerId: eng.engagement?.ownerId,
    }
  } catch (e) { results.known_engagement_error = e.message }

  // 3. Count meeting types across first 250 engagements
  try {
    const page = await hsGet('/engagements/v1/engagements/paged', { limit: 250, offset: 0 })
    const typeCounts = {}
    const activityTypeCounts = {}
    for (const e of page.results || []) {
      const t = e.engagement?.type || '(null)'
      typeCounts[t] = (typeCounts[t] || 0) + 1
      if (t === 'MEETING') {
        const a = e.engagement?.activityType || '(null)'
        activityTypeCounts[a] = (activityTypeCounts[a] || 0) + 1
      }
    }
    results.type_counts = typeCounts
    results.meeting_activity_types = activityTypeCounts
    results.since_90d = Date.now() - 90 * 24 * 60 * 60 * 1000
    results.oldest_timestamp = (page.results || []).at(-1)?.engagement?.timestamp
  } catch (e) { results.count_error = e.message }

  res.json(results)
}
