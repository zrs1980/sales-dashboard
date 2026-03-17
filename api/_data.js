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

async function fetchOwners() {
  try {
    const data = await hsGet('/crm/v3/owners', { limit: 100 })
    const byOwnerId = {}
    const byUserId  = {}
    for (const o of data.results || []) {
      const name = [o.firstName, o.lastName].filter(Boolean).join(' ') || o.email || String(o.id)
      byOwnerId[String(o.id)] = name
      if (o.userId) byUserId[String(o.userId)] = name
    }
    return { byOwnerId, byUserId }
  } catch {
    return { byOwnerId: {}, byUserId: {} }
  }
}

async function batchCompanyNames(objectType, objectIds) {
  if (!objectIds.length) return {}
  try {
    const assocData = await hsPost(`/crm/v4/associations/${objectType}/companies/batch/read`, {
      inputs: objectIds.map(id => ({ id: String(id) })),
    })
    const objToCompany = {}
    const companyIds = new Set()
    for (const r of assocData.results || []) {
      if (r.from?.id && r.to?.length > 0) {
        const cid = String(r.to[0].toObjectId)
        objToCompany[r.from.id] = cid
        companyIds.add(cid)
      }
    }
    if (!companyIds.size) return {}
    const companyData = await hsPost('/crm/v3/objects/companies/batch/read', {
      inputs: [...companyIds].map(id => ({ id })),
      properties: ['name'],
    })
    const names = {}
    for (const c of companyData.results || []) names[c.id] = c.properties?.name || ''
    const result = {}
    for (const [objId, cid] of Object.entries(objToCompany)) result[objId] = names[cid] || ''
    return result
  } catch {
    return {}
  }
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

// Call disposition GUIDs from this HubSpot portal
const HS_DEFAULT_DISPOSITIONS = {
  'eef07f3b-264a-40d6-bcaa-171638627dd9': 'Bad Data',
  '9d9162e7-6cf3-4944-bf63-4dff82258764': 'Busy',
  'f240bbac-87c9-4f6e-bf70-924b57d47db7': 'Connected',
  'e448b440-6d4a-4830-9408-9504e32407e5': 'Connected – Not Qualified',
  'b668f5fe-107f-48cc-890c-cb44eef9056e': 'Connected – Qualified',
  '83e2c746-f09b-4850-9408-4be10cf998ac': 'Do Not Call',
  '79cd6d70-4ecf-469e-9612-6dc137e71c29': 'Gatekeeper',
  '0bf1994a-ba83-456b-9394-0ee1f3fc35fb': 'Hang Up',
  'a4c4c377-d246-4b32-a13b-75a56a4cd0ff': 'Left live message',
  'b2cf5968-551e-4856-9783-52b3da59a7d0': 'Left voicemail',
  'f9f28482-7e1a-4f9a-9269-c81593b90e2c': 'Meeting Booked',
  '73a0d17f-1163-4015-bdd5-ec830791da20': 'No answer',
  '1db9fe2c-e621-414e-8ac1-535f7d179aef': 'No Longer with Company',
  '3d6d77a6-e3be-46f0-9264-b10a1d165962': 'Recieved Referral',
  '17b47fee-58de-441e-a44c-c6300d46f273': 'Wrong number',
}

export async function fetchCallDispositions() {
  try {
    const data = await hsGet('/crm/v3/properties/calls/hs_call_disposition')
    const map = { ...HS_DEFAULT_DISPOSITIONS }
    for (const opt of data.options || []) {
      map[opt.value] = opt.label
    }
    return map
  } catch {
    return { ...HS_DEFAULT_DISPOSITIONS }
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
  const engagements = []
  let offset = 0

  // v3 meetings objects don't carry activityType — use v1 recent/modified endpoint
  // sorted by lastUpdated descending so we can stop when we pass the 90-day boundary
  while (true) {
    let page
    try {
      page = await hsGet('/engagements/v1/engagements/recent/modified', { count: 100, offset })
    } catch { break }

    const results = page.results || []
    let hitBoundary = false

    for (const eng of results) {
      const e = eng.engagement || {}
      if (e.lastUpdated < since) { hitBoundary = true; break }
      if (e.type === 'MEETING' && e.activityType === 'SDR to Sales Appointment') {
        engagements.push(eng)
      }
    }

    if (!page.hasMore || hitBoundary || engagements.length >= 500) break
    offset += 100
  }

  if (!engagements.length) return []

  // Collect IDs for batch enrichment
  const contactIdSet = new Set()
  const companyIdSet = new Set()
  for (const e of engagements) {
    const a = e.associations || {}
    ;(a.contactIds || []).forEach(id => contactIdSet.add(String(id)))
    ;(a.companyIds  || []).forEach(id => companyIdSet.add(String(id)))
  }

  // Batch fetch contact names, company names, and owner map in parallel
  const [contactNames, companyNames, owners] = await Promise.all([
    (async () => {
      const ids = [...contactIdSet]
      if (!ids.length) return {}
      try {
        const d = await hsPost('/crm/v3/objects/contacts/batch/read', {
          inputs: ids.map(id => ({ id })),
          properties: ['firstname', 'lastname'],
        })
        const out = {}
        for (const c of d.results || []) {
          out[c.id] = [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(' ') || 'Unknown'
        }
        return out
      } catch { return {} }
    })(),
    (async () => {
      const ids = [...companyIdSet]
      if (!ids.length) return {}
      try {
        const d = await hsPost('/crm/v3/objects/companies/batch/read', {
          inputs: ids.map(id => ({ id })),
          properties: ['name'],
        })
        const out = {}
        for (const c of d.results || []) out[c.id] = c.properties?.name || ''
        return out
      } catch { return {} }
    })(),
    fetchOwners(),
  ])

  // Normalise to the same shape the frontend expects
  return engagements.map(e => {
    const eng   = e.engagement  || {}
    const assoc = e.associations || {}
    const meta  = e.metadata    || {}

    const contactId = String(assoc.contactIds?.[0] ?? '')
    const companyId = String(assoc.companyIds?.[0] ?? '')
    // attendeeOwnerIds[0] is the SDR who booked the meeting
    const bookedById = String(eng.attendeeOwnerIds?.[0] ?? eng.modifiedBy ?? '')

    // Strip HTML from internal notes
    const notes = (meta.internalMeetingNotes || '').replace(/<[^>]+>/g, '').trim()

    return {
      id: String(eng.id),
      properties: {
        hs_meeting_title:   meta.title || '',
        hs_timestamp:       eng.timestamp  ? String(eng.timestamp)  : '',
        hs_createdate:      eng.createdAt  ? String(eng.createdAt)  : '',
        hs_meeting_end_time: meta.endTime  ? String(meta.endTime)   : '',
        hs_meeting_outcome: meta.meetingOutcome || '',
        hs_meeting_type:    eng.activityType   || '',
        hs_meeting_body:    notes,
        contact_name: contactNames[contactId] || '',
        contact_id:   contactId,
        company_name: companyNames[companyId] || '',
        owner_name:   owners.byOwnerId[String(eng.ownerId)]   || '',
        creator_name: owners.byOwnerId[bookedById]            || '',
      },
    }
  })
}
