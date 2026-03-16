// Pure data-fetching functions, no HTTP response handling
import { hsGet, hsPost, DEAL_PROPS, CONTACT_PROPS, LOOP_PIPELINE, CEBA_PIPELINE, LOOP_CLOSED_STAGES, RYAN_OWNER_ID, CALEB_OWNER_ID } from './_hubspot.js'

export async function fetchLoopStages() {
  const data = await hsGet(`/crm/v3/pipelines/deals/${LOOP_PIPELINE}/stages`)
  const map = {}
  for (const stage of data.results || []) {
    map[stage.id] = stage.label
  }
  return map
}

export async function fetchDealCountries(dealIds) {
  if (!dealIds.length) return {}

  // Step 1: batch-read deal→company associations
  const assocData = await hsPost('/crm/v4/associations/deals/companies/batch/read', {
    inputs: dealIds.map(id => ({ id: String(id) })),
  })

  const dealToCompany = {}
  const companyIds = new Set()
  for (const result of assocData.results || []) {
    const dealId = result.from?.id
    const companies = result.to || []
    if (dealId && companies.length > 0) {
      const companyId = String(companies[0].toObjectId)
      dealToCompany[dealId] = companyId
      companyIds.add(companyId)
    }
  }

  if (!companyIds.size) return {}

  // Step 2: batch-read company country
  const companyData = await hsPost('/crm/v3/objects/companies/batch/read', {
    inputs: [...companyIds].map(id => ({ id })),
    properties: ['country'],
  })

  const companyCountry = {}
  for (const company of companyData.results || []) {
    companyCountry[company.id] = company.properties?.country || ''
  }

  // Step 3: map deal → country
  const result = {}
  for (const [dealId, companyId] of Object.entries(dealToCompany)) {
    result[dealId] = companyCountry[companyId] || ''
  }
  return result
}

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

export async function fetchCebaStages() {
  const data = await hsGet(`/crm/v3/pipelines/deals/${CEBA_PIPELINE}/stages`)
  const map = {}
  for (const stage of data.results || []) {
    map[stage.id] = stage.label
  }
  return map
}

export async function fetchCebaDeals() {
  const openData = await hsPost('/crm/v3/objects/deals/search', {
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: CEBA_PIPELINE },
      ]
    }],
    properties: DEAL_PROPS,
    limit: 100,
  })
  return { open: openData.results || [] }
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

async function batchContactNames(objectType, objectIds) {
  if (!objectIds.length) return {}
  try {
    const assocData = await hsPost(`/crm/v4/associations/${objectType}/contacts/batch/read`, {
      inputs: objectIds.map(id => ({ id: String(id) })),
    })
    const objToContact = {}
    const contactIds = new Set()
    for (const r of assocData.results || []) {
      const contacts = r.to || []
      if (r.from?.id && contacts.length > 0) {
        const cid = String(contacts[0].toObjectId)
        objToContact[r.from.id] = cid
        contactIds.add(cid)
      }
    }
    if (!contactIds.size) return {}
    const contactData = await hsPost('/crm/v3/objects/contacts/batch/read', {
      inputs: [...contactIds].map(id => ({ id })),
      properties: ['firstname', 'lastname'],
    })
    const names = {}
    for (const c of contactData.results || []) {
      names[c.id] = {
        id: c.id,
        name: [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(' ') || 'Unknown',
      }
    }
    const result = {}
    for (const [objId, cid] of Object.entries(objToContact)) {
      result[objId] = names[cid] || { id: cid, name: '' }
    }
    return result
  } catch {
    return {}
  }
}

export async function fetchSdr() {
  const since = Date.now() - 90 * 24 * 60 * 60 * 1000
  const calls = []
  let after = undefined
  while (true) {
    const data = await hsPost('/crm/v3/objects/calls/search', {
      filterGroups: [{
        filters: [
          { propertyName: 'hubspot_owner_id', operator: 'EQ', value: CALEB_OWNER_ID },
          { propertyName: 'hs_timestamp', operator: 'GTE', value: String(since) },
        ]
      }],
      properties: ['hs_call_status', 'hs_call_disposition', 'hs_timestamp', 'hs_call_direction', 'hs_call_duration', 'hs_call_body'],
      sorts: [{ propertyName: 'hs_timestamp', direction: 'DESCENDING' }],
      limit: 100,
      ...(after ? { after } : {}),
    })
    calls.push(...(data.results || []))
    if (!data.paging?.next?.after || calls.length >= 1000) break
    after = data.paging.next.after
  }
  // Fetch contact names for the most recent 100 calls
  const contactMap = await batchContactNames('calls', calls.slice(0, 100).map(c => c.id))
  for (const call of calls.slice(0, 100)) {
    const c = contactMap[call.id]
    if (c) { call.properties.contact_name = c.name; call.properties.contact_id = c.id }
  }
  return calls
}

export async function fetchSdrMeetings() {
  const since = Date.now() - 90 * 24 * 60 * 60 * 1000
  let data
  try {
    data = await hsPost('/crm/v3/objects/meetings/search', {
      filterGroups: [{
        filters: [
          { propertyName: 'hs_meeting_type', operator: 'EQ', value: 'SDR To Sales Appointment' },
          { propertyName: 'hs_timestamp', operator: 'GTE', value: String(since) },
        ]
      }],
      properties: ['hs_meeting_title', 'hs_timestamp', 'hs_meeting_outcome', 'hs_meeting_end_time', 'hs_meeting_type', 'hs_meeting_body'],
      sorts: [{ propertyName: 'hs_timestamp', direction: 'DESCENDING' }],
      limit: 100,
    })
  } catch { return [] }

  const meetings = data.results || []

  const contactMap = await batchContactNames('meetings', meetings.map(m => m.id))
  for (const m of meetings) {
    const c = contactMap[m.id]
    if (c) { m.properties.contact_name = c.name; m.properties.contact_id = c.id }
  }
  return meetings
}
