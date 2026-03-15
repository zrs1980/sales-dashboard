// Pure data-fetching functions, no HTTP response handling
import { hsPost, DEAL_PROPS, CONTACT_PROPS, LOOP_PIPELINE, CEBA_PIPELINE, LOOP_CLOSED_STAGES, RYAN_OWNER_ID, CALEB_OWNER_ID } from './_hubspot.js'

export async function fetchLoopDeals() {
  const data = await hsPost('/crm/v3/objects/deals/search', {
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: LOOP_PIPELINE },
        ...LOOP_CLOSED_STAGES.map(s => ({
          propertyName: 'dealstage', operator: 'NEQ', value: s
        })),
      ]
    }],
    properties: DEAL_PROPS,
    limit: 100,
  })
  return data.results || []
}

export async function fetchCebaDeals() {
  const [openData, closedData] = await Promise.all([
    hsPost('/crm/v3/objects/deals/search', {
      filterGroups: [{
        filters: [
          { propertyName: 'pipeline', operator: 'EQ', value: CEBA_PIPELINE },
          { propertyName: 'dealstage', operator: 'NEQ', value: 'closedwon' },
          { propertyName: 'dealstage', operator: 'NEQ', value: 'closedlost' },
        ]
      }],
      properties: DEAL_PROPS,
      limit: 100,
    }),
    hsPost('/crm/v3/objects/deals/search', {
      filterGroups: [
        { filters: [{ propertyName: 'pipeline', operator: 'EQ', value: CEBA_PIPELINE }, { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' }] },
        { filters: [{ propertyName: 'pipeline', operator: 'EQ', value: CEBA_PIPELINE }, { propertyName: 'dealstage', operator: 'EQ', value: 'closedlost' }] },
      ],
      properties: DEAL_PROPS,
      sorts: [{ propertyName: 'closedate', direction: 'DESCENDING' }],
      limit: 50,
    }),
  ])
  return { open: openData.results || [], closed: closedData.results || [] }
}

export async function fetchLeads() {
  const BASE_FILTERS = [
    { propertyName: 'lifecyclestage', operator: 'EQ', value: 'lead' },
    { propertyName: 'hubspot_owner_id', operator: 'EQ', value: RYAN_OWNER_ID },
  ]
  const results = []
  let after = undefined
  while (true) {
    const data = await hsPost('/crm/v3/objects/contacts/search', {
      filterGroups: [{ filters: BASE_FILTERS }],
      properties: CONTACT_PROPS,
      sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
      limit: 100,
      ...(after ? { after } : {}),
    })
    results.push(...(data.results || []))
    if (!data.paging?.next?.after || results.length >= 500) break
    after = data.paging.next.after
  }
  return results
}

export async function fetchSdr() {
  const data = await hsPost('/crm/v3/objects/calls/search', {
    filterGroups: [{
      filters: [{ propertyName: 'hubspot_owner_id', operator: 'EQ', value: CALEB_OWNER_ID }]
    }],
    properties: ['hs_call_status', 'hs_timestamp', 'hs_call_direction', 'hs_call_duration'],
    limit: 100,
  })
  const total = data.total || 0
  const results = data.results || []
  const outcomes = {}
  for (const call of results) {
    const status = call.properties?.hs_call_status || 'UNKNOWN'
    outcomes[status] = (outcomes[status] || 0) + 1
  }
  return { total, sample: results.length, outcomes }
}
