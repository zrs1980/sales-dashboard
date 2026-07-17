// Pure data-fetching functions, no HTTP response handling
import { hsGet, hsPost, DEAL_PROPS, LOOP_PIPELINE, CEBA_PIPELINE, CEBA_SERVICES_PIPELINE, LOOP_CLOSED_STAGES, RYAN_OWNER_ID, CALEB_OWNER_ID } from './_hubspot.js'

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function batchReadProps(objectType, ids, properties) {
  if (!ids.size) return {}
  const map = {}
  for (const batch of chunk([...ids], 100)) {
    const data = await hsPost(`/crm/v3/objects/${objectType}/batch/read`, {
      inputs: batch.map(id => ({ id })),
      properties,
    })
    for (const item of data.results || []) map[item.id] = item.properties
  }
  return map
}

async function batchAssocChunked(fromType, toType, ids) {
  const map = {}
  for (const batch of chunk(ids, 100)) {
    const data = await hsPost(`/crm/v4/associations/${fromType}/${toType}/batch/read`, {
      inputs: batch.map(id => ({ id })),
    }).catch(() => ({ results: [] }))
    for (const result of data.results || []) {
      const fromId = result.from?.id
      const toIds = (result.to || []).map(t => String(t.toObjectId))
      if (fromId && toIds.length) map[fromId] = (map[fromId] || []).concat(toIds)
    }
  }
  return map
}

export async function fetchMyTasks() {
  const TASK_PROPS = [
    'hs_task_subject', 'hs_task_body', 'hs_task_status', 'hs_task_type',
    'hs_timestamp', 'hubspot_owner_id', 'hs_task_priority',
  ]
  const OPEN_FILTERS = [
    { propertyName: 'hs_task_status', operator: 'NEQ', value: 'COMPLETED' },
    { propertyName: 'hs_task_status', operator: 'NEQ', value: 'CANCELED' },
  ]

  // HubSpot task search applies an implicit past-only window, so we make two
  // parallel queries — one for past/current and one explicitly for future dates
  // — then deduplicate the combined results.
  async function searchPage(tsFilter, direction, after) {
    return hsPost('/crm/v3/objects/tasks/search', {
      filterGroups: [{ filters: tsFilter ? [...OPEN_FILTERS, tsFilter] : OPEN_FILTERS }],
      properties: TASK_PROPS,
      sorts: [{ propertyName: 'hs_timestamp', direction }],
      limit: 100,
      ...(after ? { after } : {}),
    })
  }

  const nowMs = String(Date.now())
  const pastFilter   = { propertyName: 'hs_timestamp', operator: 'LTE', value: nowMs }
  const futureFilter = { propertyName: 'hs_timestamp', operator: 'GT',  value: nowMs }
  const noTsFilter   = { propertyName: 'hs_timestamp', operator: 'NOT_HAS_PROPERTY' }

  async function paginate(tsFilter, direction = 'ASCENDING', limit = 500) {
    const acc = []
    let after = undefined
    while (true) {
      const data = await searchPage(tsFilter, direction, after)
      acc.push(...(data.results || []))
      if (!data.paging?.next?.after || acc.length >= limit) break
      after = data.paging.next.after
    }
    return acc
  }

  // Three parallel queries: past-dated, future-dated, and no due date set.
  // HubSpot's implicit past-only window means tasks without a timestamp
  // won't match either the LTE or GT filter — the third query catches them.
  const [pastResults, futureResults, noTsResults] = await Promise.all([
    paginate(pastFilter,   'DESCENDING'), // most recent overdue first so they aren't cut off
    paginate(futureFilter, 'ASCENDING'),  // soonest upcoming first
    paginate(noTsFilter,   'ASCENDING'),
  ])

  // Deduplicate by id
  const seen = new Set()
  const results = []
  for (const t of [...pastResults, ...futureResults, ...noTsResults]) {
    if (!seen.has(t.id)) { seen.add(t.id); results.push(t) }
  }

  if (!results.length) return []

  const taskIds = results.map(t => t.id)

  // Fetch associations in parallel
  const [contactAssoc, dealAssoc, companyAssoc, leadAssoc] = await Promise.all([
    batchAssocChunked('tasks', 'contacts', taskIds),
    batchAssocChunked('tasks', 'deals', taskIds),
    batchAssocChunked('tasks', 'companies', taskIds),
    batchAssocChunked('tasks', 'leads', taskIds),
  ])

  // Collect unique object IDs
  const contactIds = new Set(Object.values(contactAssoc).flat())
  const dealIds    = new Set(Object.values(dealAssoc).flat())
  const companyIds = new Set(Object.values(companyAssoc).flat())
  const leadIds    = new Set(Object.values(leadAssoc).flat())

  // Batch-read names in parallel
  const [contacts, deals, companies, leads] = await Promise.all([
    batchReadProps('contacts', contactIds, ['firstname', 'lastname', 'email']),
    batchReadProps('deals',    dealIds,    ['dealname']),
    batchReadProps('companies', companyIds, ['name', 'phone', 'description']),
    batchReadProps('leads',    leadIds,    ['hs_lead_name', 'hs_associated_company_name']),
  ])

  return results.map(task => {
    const tid = task.id
    return {
      ...task,
      contacts:  (contactAssoc[tid] || []).map(id => ({ id, ...(contacts[id]  || {}) })).filter(c => c.firstname || c.lastname || c.email),
      deals:     (dealAssoc[tid]    || []).map(id => ({ id, ...(deals[id]     || {}) })).filter(d => d.dealname),
      companies: (companyAssoc[tid] || []).map(id => ({ id, ...(companies[id] || {}) })).filter(c => c.name),
      leads:     (leadAssoc[tid]    || []).map(id => ({ id, ...(leads[id]     || {}) })).filter(l => l.hs_lead_name || l.hs_associated_company_name),
    }
  })
}

async function batchReadTasks(taskIds) {
  const results = []
  for (const batch of chunk([...taskIds], 100)) {
    const data = await hsPost('/crm/v3/objects/tasks/batch/read', {
      inputs: batch.map(id => ({ id })),
      properties: ['hs_task_subject', 'hs_task_status', 'hs_timestamp'],
    })
    results.push(...(data.results || []))
  }
  return results
}

export async function fetchMyMeetings() {
  const MEETING_PROPS = [
    'hs_meeting_title', 'hs_timestamp', 'hs_meeting_end_time',
    'hs_meeting_outcome', 'hs_meeting_body', 'hubspot_owner_id',
  ]

  // Meetings from 1 day ago through all future (so recently-past meetings are visible)
  const oneDayAgo = String(Date.now() - 24 * 60 * 60 * 1000)

  const acc = []
  let after = undefined
  while (true) {
    const data = await hsPost('/crm/v3/objects/meetings/search', {
      filterGroups: [{ filters: [{ propertyName: 'hs_timestamp', operator: 'GTE', value: oneDayAgo }] }],
      properties: MEETING_PROPS,
      sorts: [{ propertyName: 'hs_timestamp', direction: 'ASCENDING' }],
      limit: 100,
      ...(after ? { after } : {}),
    })
    acc.push(...(data.results || []))
    if (!data.paging?.next?.after || acc.length >= 200) break
    after = data.paging.next.after
  }

  if (!acc.length) return []

  const meetingIds = acc.map(m => m.id)

  const [contactAssoc, dealAssoc, companyAssoc, leadAssoc] = await Promise.all([
    batchAssocChunked('meetings', 'contacts',  meetingIds),
    batchAssocChunked('meetings', 'deals',     meetingIds),
    batchAssocChunked('meetings', 'companies', meetingIds),
    batchAssocChunked('meetings', 'leads',     meetingIds),
  ])

  const contactIds = new Set(Object.values(contactAssoc).flat())
  const dealIds    = new Set(Object.values(dealAssoc).flat())
  const companyIds = new Set(Object.values(companyAssoc).flat())
  const leadIds    = new Set(Object.values(leadAssoc).flat())

  const [contacts, deals, companies, leads] = await Promise.all([
    batchReadProps('contacts',  contactIds, ['firstname', 'lastname', 'email']),
    batchReadProps('deals',     dealIds,    ['dealname']),
    batchReadProps('companies', companyIds, ['name', 'phone', 'description']),
    batchReadProps('leads',     leadIds,    ['hs_lead_name', 'hs_associated_company_name']),
  ])

  return acc.map(meeting => {
    const mid = meeting.id
    return {
      ...meeting,
      _itemType: 'meeting',
      contacts:  (contactAssoc[mid] || []).map(id => ({ id, ...(contacts[id]  || {}) })).filter(c => c.firstname || c.lastname || c.email),
      deals:     (dealAssoc[mid]    || []).map(id => ({ id, ...(deals[id]     || {}) })).filter(d => d.dealname),
      companies: (companyAssoc[mid] || []).map(id => ({ id, ...(companies[id] || {}) })).filter(c => c.name),
      leads:     (leadAssoc[mid]    || []).map(id => ({ id, ...(leads[id]     || {}) })).filter(l => l.hs_lead_name || l.hs_associated_company_name),
    }
  })
}

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

async function fetchOpenTasksForDeals(dealIds) {
  if (!dealIds.length) return {}

  // Step 1: batch-read deal → task associations
  const assocData = await hsPost('/crm/v4/associations/deals/tasks/batch/read', {
    inputs: dealIds.map(id => ({ id: String(id) })),
  })

  const dealToTaskIds = {}
  const taskIds = new Set()
  for (const result of assocData.results || []) {
    const dealId = result.from?.id
    const linked = (result.to || []).map(t => String(t.toObjectId))
    if (dealId && linked.length > 0) {
      dealToTaskIds[dealId] = linked
      linked.forEach(id => taskIds.add(id))
    }
  }

  if (!taskIds.size) return {}

  // Step 2: batch-read task properties (chunked, max 100 per request)
  const tasks = {}
  for (const task of await batchReadTasks(taskIds)) {
    tasks[task.id] = task.properties
  }

  // Step 3: per deal, pick the earliest open task
  const OPEN = new Set(['NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'DEFERRED'])
  const result = {}
  for (const [dealId, ids] of Object.entries(dealToTaskIds)) {
    const open = ids
      .filter(id => tasks[id] && OPEN.has(tasks[id].hs_task_status))
      .map(id => ({ id, ...tasks[id] }))
      .sort((a, b) => new Date(a.hs_timestamp || 0).getTime() - new Date(b.hs_timestamp || 0).getTime())

    if (open.length > 0) {
      result[dealId] = {
        date: open[0].hs_timestamp,
        subject: open[0].hs_task_subject || '',
        taskId: open[0].id,
      }
    }
  }

  return result
}

async function fetchOpenTasksForLeadContacts(leads) {
  const contactIds = [...new Set(
    leads.map(l => l.properties?.hs_primary_contact_id).filter(Boolean)
  )]
  if (!contactIds.length) return {}

  // Step 1: batch-read contact → task associations
  const assocData = await hsPost('/crm/v4/associations/contacts/tasks/batch/read', {
    inputs: contactIds.map(id => ({ id: String(id) })),
  })

  const contactToTaskIds = {}
  const taskIds = new Set()
  for (const result of assocData.results || []) {
    const contactId = result.from?.id
    const linked = (result.to || []).map(t => String(t.toObjectId))
    if (contactId && linked.length > 0) {
      contactToTaskIds[contactId] = linked
      linked.forEach(id => taskIds.add(id))
    }
  }

  if (!taskIds.size) return {}

  // Step 2: batch-read task properties (chunked, max 100 per request)
  const tasks = {}
  for (const task of await batchReadTasks(taskIds)) {
    tasks[task.id] = task.properties
  }

  // Step 3: per contact, pick the earliest open task
  const OPEN = new Set(['NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'DEFERRED'])
  const result = {}
  for (const [contactId, ids] of Object.entries(contactToTaskIds)) {
    const open = ids
      .filter(id => tasks[id] && OPEN.has(tasks[id].hs_task_status))
      .map(id => ({ id, ...tasks[id] }))
      .sort((a, b) => new Date(a.hs_timestamp || 0).getTime() - new Date(b.hs_timestamp || 0).getTime())

    if (open.length > 0) {
      result[contactId] = {
        date: open[0].hs_timestamp,
        subject: open[0].hs_task_subject || '',
        taskId: open[0].id,
      }
    }
  }

  return result // contactId → { date, subject, taskId }
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

  const deals = data.results || []

  // Overlay open task data onto each deal
  if (deals.length > 0) {
    const taskMap = await fetchOpenTasksForDeals(deals.map(d => d.id))
    for (const deal of deals) {
      const task = taskMap[deal.id]
      if (task) {
        deal.properties.hs_next_activity_date = task.date
        deal.properties.hs_next_activity_subject = task.subject
        deal.properties.hs_next_task_id = task.taskId
      }
    }
  }

  return deals
}

export async function fetchCebaStages() {
  const data = await hsGet(`/crm/v3/pipelines/deals/${CEBA_PIPELINE}/stages`)
  const map = {}
  for (const stage of data.results || []) {
    map[stage.id] = stage.label
  }
  return map
}

export async function fetchCebaServicesStages() {
  const data = await hsGet(`/crm/v3/pipelines/deals/${CEBA_SERVICES_PIPELINE}/stages`)
  const map = {}
  for (const stage of data.results || []) {
    map[stage.id] = stage.label
  }
  return map
}

export async function fetchCebaServicesDeals() {
  const data = await hsPost('/crm/v3/objects/deals/search', {
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: CEBA_SERVICES_PIPELINE },
      ]
    }],
    properties: DEAL_PROPS,
    limit: 100,
  })
  return { open: data.results || [] }
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

const LEAD_PROPS = [
  'hs_lead_name', 'hs_associated_company_name', 'hs_associated_contact_email',
  'hs_associated_contact_firstname', 'hs_associated_contact_lastname',
  'hs_pipeline', 'hs_pipeline_stage', 'hs_lead_label',
  'hubspot_owner_id', 'hs_primary_contact_id',
  'hs_calls_attempted_count', 'hs_calls_connected_count',
  'hs_lead_call_count', 'hs_lead_email_count', 'hs_lead_meeting_count',
  'hs_lead_outreach_activity_count',
  'hs_last_activity_date', 'hs_next_activity_date', 'hs_createdate',
  'hs_pipeline_stage_last_updated', 'notion_link',
  'hs_lead_is_new', 'hs_lead_is_in_progress', 'hs_lead_is_open',
  'hs_lead_is_qualified', 'hs_lead_is_disqualified',
  'loop_lead_source', 'hs_lead_source',
]

export async function fetchLeads() {
  const results = []
  let after = undefined
  while (true) {
    const data = await hsPost('/crm/v3/objects/leads/search', {
      filterGroups: [],
      properties: LEAD_PROPS,
      sorts: [{ propertyName: 'hs_createdate', direction: 'DESCENDING' }],
      limit: 100,
      ...(after ? { after } : {}),
    })
    results.push(...(data.results || []))
    if (!data.paging?.next?.after || results.length >= 500) break
    after = data.paging.next.after
  }

  // Overlay open task data onto each lead via primary contact
  if (results.length > 0) {
    const taskMap = await fetchOpenTasksForLeadContacts(results)
    for (const lead of results) {
      const contactId = lead.properties?.hs_primary_contact_id
      if (contactId) {
        const task = taskMap[contactId]
        if (task) {
          lead.properties.hs_next_activity_date = task.date
          lead.properties.hs_next_activity_subject = task.subject
          lead.properties.hs_next_task_id = task.taskId
        }
      }
    }
  }

  return results
}

export async function fetchLeadStages() {
  try {
    const data = await hsGet('/crm/v3/pipelines/leads')
    const stageMap = {}
    const pipelineMap = {}
    for (const pipeline of data.results || []) {
      pipelineMap[pipeline.id] = pipeline.label
      for (const stage of pipeline.stages || []) {
        stageMap[stage.id] = stage.label
      }
    }
    return { stageMap, pipelineMap }
  } catch {
    return { stageMap: {}, pipelineMap: {} }
  }
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

// Shared by the Task Exports and Notes tabs: full property list + every record
// of a given CRM object type, all fields, plus associated contact/deal/company/lead.
export async function fetchAllObjectProperties(objectType) {
  const data = await hsGet(`/crm/v3/properties/${objectType}`)
  return (data.results || []).filter(p => !p.hidden)
}

export async function fetchAllObjectsFull(objectType, propDefs, { pinnedFirst } = {}) {
  const propNames = propDefs.map(p => p.name)
  if (pinnedFirst && !propNames.includes(pinnedFirst)) propNames.unshift(pinnedFirst)

  // Search only for IDs first (properties are fetched via batch/read below) —
  // search's implicit past-only window doesn't apply when there's no timestamp filter.
  const ids = []
  let after = undefined
  let truncated = false
  while (true) {
    let data
    try {
      data = await hsPost(`/crm/v3/objects/${objectType}/search`, {
        filterGroups: [],
        sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
        properties: ['hs_object_id'],
        limit: 100,
        ...(after ? { after } : {}),
      })
    } catch {
      truncated = true
      break
    }
    ids.push(...(data.results || []).map(r => r.id))
    if (!data.paging?.next?.after) break
    after = data.paging.next.after
    if (ids.length >= 20000) { truncated = true; break } // safety valve, not a data cap
  }

  if (!ids.length) return { records: [], truncated }

  const recordsById = {}
  for (const batch of chunk(ids, 100)) {
    const data = await hsPost(`/crm/v3/objects/${objectType}/batch/read`, {
      inputs: batch.map(id => ({ id })),
      properties: propNames,
    })
    for (const r of data.results || []) recordsById[r.id] = r
  }
  const orderedRecords = ids.map(id => recordsById[id]).filter(Boolean)

  const [contactAssoc, dealAssoc, companyAssoc, leadAssoc] = await Promise.all([
    batchAssocChunked(objectType, 'contacts', ids),
    batchAssocChunked(objectType, 'deals', ids),
    batchAssocChunked(objectType, 'companies', ids),
    batchAssocChunked(objectType, 'leads', ids),
  ])
  const contactIds = new Set(Object.values(contactAssoc).flat())
  const dealIds    = new Set(Object.values(dealAssoc).flat())
  const companyIds = new Set(Object.values(companyAssoc).flat())
  const leadIds    = new Set(Object.values(leadAssoc).flat())

  const [contacts, deals, companies, leads, owners] = await Promise.all([
    batchReadProps('contacts', contactIds, ['firstname', 'lastname', 'email']),
    batchReadProps('deals', dealIds, ['dealname']),
    batchReadProps('companies', companyIds, ['name']),
    batchReadProps('leads', leadIds, ['hs_lead_name', 'hs_associated_company_name']),
    fetchOwners(),
  ])

  const records = orderedRecords.map(r => ({
    ...r,
    ownerName: owners.byOwnerId[r.properties?.hubspot_owner_id] || '',
    contacts:  (contactAssoc[r.id] || []).map(id => ({ id, ...(contacts[id] || {}) })),
    deals:     (dealAssoc[r.id]    || []).map(id => ({ id, ...(deals[id]    || {}) })),
    companies: (companyAssoc[r.id] || []).map(id => ({ id, ...(companies[id] || {}) })),
    leads:     (leadAssoc[r.id]    || []).map(id => ({ id, ...(leads[id]    || {}) })),
  }))

  return { records, truncated }
}

export async function fetchAllTaskProperties() {
  return fetchAllObjectProperties('tasks')
}

export async function fetchAllTasks() {
  const propDefs = await fetchAllTaskProperties()
  const { records, truncated } = await fetchAllObjectsFull('tasks', propDefs, { pinnedFirst: 'hs_task_subject' })
  return { tasks: records, properties: propDefs, truncated }
}

export async function fetchAllNoteProperties() {
  return fetchAllObjectProperties('notes')
}

export async function fetchAllNotes() {
  const propDefs = await fetchAllNoteProperties()
  const { records, truncated } = await fetchAllObjectsFull('notes', propDefs, { pinnedFirst: 'hs_note_body' })
  return { notes: records, properties: propDefs, truncated }
}

export async function fetchAllMeetingProperties() {
  return fetchAllObjectProperties('meetings')
}

export async function fetchAllMeetingsFull() {
  const propDefs = await fetchAllMeetingProperties()
  const { records, truncated } = await fetchAllObjectsFull('meetings', propDefs, { pinnedFirst: 'hs_meeting_title' })
  return { meetings: records, properties: propDefs, truncated }
}

export async function fetchAllCallProperties() {
  return fetchAllObjectProperties('calls')
}

export async function fetchAllCallsFull() {
  const propDefs = await fetchAllCallProperties()
  const { records, truncated } = await fetchAllObjectsFull('calls', propDefs, { pinnedFirst: 'hs_call_title' })
  return { calls: records, properties: propDefs, truncated }
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
