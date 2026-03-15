// Shared HubSpot helpers for all API functions

const BASE = 'https://api.hubapi.com'

function headers() {
  return {
    'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}`,
    'Content-Type': 'application/json',
  }
}

export async function hsGet(path, params = {}) {
  const url = new URL(BASE + path)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { headers: headers() })
  if (!res.ok) throw new Error(`HubSpot GET ${path} → ${res.status}`)
  return res.json()
}

export async function hsPost(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HubSpot POST ${path} → ${res.status}: ${text}`)
  }
  return res.json()
}

export const DEAL_PROPS = [
  'dealname', 'amount', 'closedate', 'dealstage', 'pipeline',
  'hubspot_owner_id', 'hs_deal_stage_probability', 'num_notes',
  'notes_last_updated', 'notion_link', 'hs_lastmodifieddate',
]

export const CONTACT_PROPS = [
  'firstname', 'lastname', 'email', 'company', 'hs_lead_status',
  'lifecyclestage', 'hubspot_owner_id', 'num_contacted_notes',
  'notes_last_updated', 'createdate',
]

export const PORTAL_ID = '243159630'
export const RYAN_OWNER_ID = '159716972'
export const CALEB_OWNER_ID = '161027134'
export const LOOP_PIPELINE = 'default'
export const CEBA_PIPELINE = '1677684439'

export const LOOP_CLOSED_STAGES = ['2681276110', '2681276111', 'closedwon', 'closedlost']

export function dealUrl(id) {
  return `https://app-na2.hubspot.com/contacts/${PORTAL_ID}/record/0-3/${id}`
}

export function contactUrl(id) {
  return `https://app-na2.hubspot.com/contacts/${PORTAL_ID}/record/0-1/${id}`
}
