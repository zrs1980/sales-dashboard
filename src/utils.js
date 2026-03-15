export function fmtCurrency(val) {
  if (val == null) return '$0'
  const n = parseFloat(val)
  if (isNaN(n)) return '$0'
  if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return '$' + n.toFixed(0)
}

export function fmtDate(raw) {
  if (!raw) return '—'
  try {
    const d = String(raw).length > 10
      ? new Date(parseInt(raw))
      : new Date(raw + 'T00:00:00Z')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  } catch {
    return String(raw).slice(0, 10)
  }
}

export function daysSince(raw) {
  if (!raw) return null
  try {
    const d = String(raw).length > 10 ? new Date(parseInt(raw)) : new Date(raw)
    return Math.floor((Date.now() - d.getTime()) / 86400000)
  } catch {
    return null
  }
}

export function daysUntil(raw) {
  if (!raw) return null
  try {
    const d = new Date(raw)
    return Math.floor((d.getTime() - Date.now()) / 86400000)
  } catch {
    return null
  }
}

export function extractNotionPageId(url) {
  if (!url) return null
  const match = url.match(/([a-f0-9]{32}|[a-f0-9-]{36})$/)
  if (!match) return null
  const id = match[1].replace(/-/g, '')
  return `${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}`
}

// Loop ERP stage map
const LOOP_STAGE_MAP = {
  '2681276101': 'New Deal',
  '2681276102': 'Req. Analysis',
  '2681276103': 'Req. Analysis',
  '2681276104': 'Demo Booked',
  '2681276105': 'Demo Complete',
  '2681276108': "Add'l Education",
  '2681276109': 'Negotiation',
  '2681276110': 'Closed Won',
  '2681276111': 'Closed Lost',
}

const GENERIC_STAGE_MAP = {
  appointmentscheduled: 'Demo Booked',
  qualifiedtobuy: 'Req. Analysis',
  presentationscheduled: 'Demo Complete',
  decisionmakerboughtin: "Add'l Education",
  contractsent: 'Contract Sent',
  closedwon: 'Closed Won',
  closedlost: 'Closed Lost',
}

export function getStageLabel(stageId) {
  return LOOP_STAGE_MAP[stageId]
    || GENERIC_STAGE_MAP[stageId]
    || stageId?.replace(/_/g, ' ')?.replace(/\b\w/g, c => c.toUpperCase())
    || '—'
}

export function getStageBadgeClass(label) {
  const map = {
    'New Deal': 'badge-gray',
    'Req. Analysis': 'badge-green',
    'Demo Booked': 'badge-blue',
    'Demo Complete': 'badge-blue',
    "Add'l Education": 'badge-orange',
    'Negotiation': 'badge-orange',
    'Contract Sent': 'badge-purple',
    'Closed Won': 'badge-green',
    'Closed Lost': 'badge-red',
  }
  return map[label] || 'badge-gray'
}

export function getStageProb(label) {
  const map = {
    'New Deal': 0.10, 'Req. Analysis': 0.30, 'Demo Booked': 0.40,
    'Demo Complete': 0.45, "Add'l Education": 0.70,
    'Negotiation': 0.80, 'Contract Sent': 0.90,
  }
  return map[label] || 0.10
}

export function getLeadStatusBadge(status) {
  const map = {
    NEW: 'badge-gray', OPEN: 'badge-blue', IN_PROGRESS: 'badge-orange',
    CONNECTED: 'badge-green', BAD_TIMING: 'badge-red',
    ATTEMPTED_TO_CONTACT: 'badge-orange', UNQUALIFIED: 'badge-red',
  }
  return map[status] || 'badge-gray'
}

export function generateAlerts(deals) {
  const alerts = []
  const now = Date.now()
  for (const deal of deals) {
    const p = deal.properties || {}
    const name = p.dealname || 'Unnamed Deal'
    const closeRaw = p.closedate
    const notes = parseInt(p.num_notes || 0)
    const modified = p.hs_lastmodifieddate || p.notes_last_updated

    if (closeRaw) {
      const until = Math.floor((new Date(closeRaw).getTime() - now) / 86400000)
      if (until < 0) alerts.push({ type: 'danger', text: `${name} — close date is overdue (${Math.abs(until)}d past)` })
      else if (until <= 30) alerts.push({ type: 'warn', text: `${name} — closes in ${until} days` })
    }

    if (modified) {
      const stalled = Math.floor((now - new Date(parseInt(String(modified).length > 10 ? modified : modified + '000')).getTime()) / 86400000)
      if (stalled > 90) alerts.push({ type: 'warn', text: `${name} — stalled ${stalled} days with no activity` })
    }

    if (notes === 0) alerts.push({ type: 'info', text: `${name} — no notes logged` })
  }
  return alerts
}
