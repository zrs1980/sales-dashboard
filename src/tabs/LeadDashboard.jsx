import { useState, useMemo } from 'react'
import { fmtDate } from '../utils.js'

const PAGE_SIZE = 25
const PORTAL_ID = '243159630'

function leadUrl(id) {
  return `https://app-na2.hubspot.com/contacts/${PORTAL_ID}/record/0-136/${id}`
}

function fmtActivity(iso) {
  if (!iso) return null
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.round((now - d) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.round(diffDays / 7)}w ago`
  return fmtDate(iso)
}

function fmtNext(iso) {
  if (!iso) return null
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.round((d - now) / 86400000)
  if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, color: 'var(--danger)' }
  if (diffDays === 0) return { label: 'Today', color: 'var(--warning)' }
  if (diffDays === 1) return { label: 'Tomorrow', color: 'var(--warning)' }
  if (diffDays <= 7) return { label: `In ${diffDays}d`, color: 'var(--success)' }
  return { label: fmtDate(iso), color: 'var(--text-secondary)' }
}

const MAX_TOUCHES = 7

function TouchDots({ count }) {
  const filled = Math.min(count, MAX_TOUCHES)
  const isDone = count >= MAX_TOUCHES
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ display: 'flex', gap: 3 }}>
        {Array.from({ length: MAX_TOUCHES }, (_, i) => (
          <div key={i} style={{
            width: 7, height: 7, borderRadius: '50%',
            background: i < filled
              ? (isDone ? 'var(--success)' : 'var(--accent)')
              : 'var(--border)',
          }} />
        ))}
      </div>
      <span style={{
        fontSize: 11, fontFamily: "'DM Mono', monospace",
        color: isDone ? 'var(--success)' : count === 0 ? 'var(--danger)' : 'var(--text-muted)',
        fontWeight: 600,
      }}>{count}/{MAX_TOUCHES}</span>
    </div>
  )
}

function LabelBadge({ label }) {
  if (!label) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
  const colors = {
    HOT: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
    WARM: { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
    COLD: { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  }
  const s = colors[label] || { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 4, fontSize: 11,
      fontWeight: 600, fontFamily: "'DM Mono', monospace",
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>{label}</span>
  )
}

function StatusDot({ lead }) {
  const p = lead.properties || {}
  if (p.hs_lead_is_disqualified === 'true') return <span style={{ color: 'var(--danger)', fontSize: 11 }}>Disqualified</span>
  if (p.hs_lead_is_qualified === 'true') return <span style={{ color: 'var(--success)', fontSize: 11 }}>Qualified</span>
  if (p.hs_lead_is_in_progress === 'true') return <span style={{ color: 'var(--warning)', fontSize: 11 }}>In Progress</span>
  if (p.hs_lead_is_new === 'true') return <span style={{ color: 'var(--accent)', fontSize: 11 }}>New</span>
  if (p.hs_lead_is_open === 'true') return <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>Open</span>
  return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
}

function LeadRow({ lead, index, stageMap, pipelineMap }) {
  const p = lead.properties || {}
  const id = lead.id

  const name = p.hs_lead_name ||
    [p.hs_associated_contact_firstname, p.hs_associated_contact_lastname].filter(Boolean).join(' ') ||
    p.hs_associated_contact_email || `Lead #${id}`
  const company = p.hs_associated_company_name || ''
  const stage = stageMap[p.hs_pipeline_stage] || p.hs_pipeline_stage || '—'
  const pipeline = pipelineMap[p.hs_pipeline] || p.hs_pipeline || '—'

  const calls = parseInt(p.hs_lead_call_count || p.hs_calls_attempted_count || 0)
  const emails = parseInt(p.hs_lead_email_count || 0)
  const meetings = parseInt(p.hs_lead_meeting_count || 0)
  const totalActivities = parseInt(p.hs_lead_outreach_activity_count || 0) || (calls + emails + meetings)

  const lastActivity = fmtActivity(p.hs_last_activity_date)
  const nextActivity = fmtNext(p.hs_next_activity_date)

  const url = leadUrl(id)

  return (
    <tr>
      <td style={{ color: 'var(--text-muted)', fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{index}</td>
      <td>
        <a className="deal-link" href={url} target="_blank" rel="noreferrer">{name}</a>
        {p.hs_associated_contact_email && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{p.hs_associated_contact_email}</div>
        )}
      </td>
      <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{company || '—'}</td>
      <td>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{pipeline}</div>
        <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>{stage}</div>
      </td>
      <td><LabelBadge label={p.hs_lead_label} /></td>
      <td><StatusDot lead={lead} /></td>
      <td>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {calls > 0 && <span title="Calls" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>📞 {calls}</span>}
          {emails > 0 && <span title="Emails" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>✉️ {emails}</span>}
          {meetings > 0 && <span title="Meetings" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>📅 {meetings}</span>}
          {calls === 0 && emails === 0 && meetings === 0 && <span style={{ color: 'var(--danger)', fontSize: 11 }}>None</span>}
        </div>
      </td>
      <td style={{ fontSize: 12, color: lastActivity ? 'var(--text-secondary)' : 'var(--danger)' }}>
        {lastActivity || <span style={{ color: 'var(--danger)' }}>Never</span>}
      </td>
      <td style={{ fontSize: 12 }}>
        {nextActivity
          ? <span style={{ color: nextActivity.color }}>{nextActivity.label}</span>
          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
      </td>
      <td><TouchDots count={totalActivities} /></td>
      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDate(p.hs_createdate)}</td>
      <td><a className="deal-link" href={url} target="_blank" rel="noreferrer">Open →</a></td>
    </tr>
  )
}

export default function LeadDashboard({ data, loading }) {
  const [search, setSearch] = useState('')
  const [pipelineFilter, setPipelineFilter] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [labelFilter, setLabelFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  if (loading && !data) return <div className="state-box">Loading leads…</div>
  if (!data) return null

  const leads = data.leads || []
  const { stageMap = {}, pipelineMap = {} } = data.stages || {}

  // KPI counts
  const total = leads.length
  const newCount = leads.filter(l => l.properties?.hs_lead_is_new === 'true').length
  const inProgressCount = leads.filter(l => l.properties?.hs_lead_is_in_progress === 'true').length
  const qualifiedCount = leads.filter(l => l.properties?.hs_lead_is_qualified === 'true').length
  const noActivityCount = leads.filter(l => {
    const p = l.properties || {}
    const total = parseInt(p.hs_lead_outreach_activity_count || 0) || (parseInt(p.hs_lead_call_count || 0) + parseInt(p.hs_lead_email_count || 0) + parseInt(p.hs_lead_meeting_count || 0))
    return total === 0
  }).length

  // Unique pipelines for filter
  const pipelines = useMemo(() => {
    const seen = new Set()
    return leads.map(l => l.properties?.hs_pipeline).filter(p => p && !seen.has(p) && seen.add(p))
  }, [leads])

  // Stages for selected pipeline filter
  const stagesForPipeline = useMemo(() => {
    const seen = new Set()
    return leads
      .filter(l => !pipelineFilter || l.properties?.hs_pipeline === pipelineFilter)
      .map(l => l.properties?.hs_pipeline_stage)
      .filter(s => s && !seen.has(s) && seen.add(s))
  }, [leads, pipelineFilter])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return leads.filter(l => {
      const p = l.properties || {}
      const name = (p.hs_lead_name || [p.hs_associated_contact_firstname, p.hs_associated_contact_lastname].filter(Boolean).join(' ') || '').toLowerCase()
      const company = (p.hs_associated_company_name || '').toLowerCase()
      const email = (p.hs_associated_contact_email || '').toLowerCase()

      if (q && !name.includes(q) && !company.includes(q) && !email.includes(q)) return false
      if (pipelineFilter && p.hs_pipeline !== pipelineFilter) return false
      if (stageFilter && p.hs_pipeline_stage !== stageFilter) return false
      if (labelFilter && p.hs_lead_label !== labelFilter) return false
      if (statusFilter === 'new' && p.hs_lead_is_new !== 'true') return false
      if (statusFilter === 'in_progress' && p.hs_lead_is_in_progress !== 'true') return false
      if (statusFilter === 'qualified' && p.hs_lead_is_qualified !== 'true') return false
      if (statusFilter === 'disqualified' && p.hs_lead_is_disqualified !== 'true') return false
      if (statusFilter === 'no_activity') {
        const total = parseInt(p.hs_lead_outreach_activity_count || 0) || (parseInt(p.hs_lead_call_count || 0) + parseInt(p.hs_lead_email_count || 0) + parseInt(p.hs_lead_meeting_count || 0))
        if (total > 0) return false
      }
      return true
    })
  }, [leads, search, pipelineFilter, stageFilter, labelFilter, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * PAGE_SIZE
  const pageLeads = filtered.slice(start, start + PAGE_SIZE)

  function handleFilterChange(setter) {
    return (e) => { setter(e.target.value); setPage(1) }
  }

  return (
    <>
      <div className="kpi-row">
        <div className="kpi-card blue">
          <div className="kpi-label">Total Leads</div>
          <div className="kpi-value">{total}</div>
          <div className="kpi-sub">HubSpot Leads object</div>
        </div>
        <div className="kpi-card red">
          <div className="kpi-label">New</div>
          <div className="kpi-value">{newCount}</div>
          <div className="kpi-sub">Need outreach</div>
        </div>
        <div className="kpi-card orange">
          <div className="kpi-label">In Progress</div>
          <div className="kpi-value">{inProgressCount}</div>
          <div className="kpi-sub">Active outreach</div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-label">Qualified</div>
          <div className="kpi-value">{qualifiedCount}</div>
          <div className="kpi-sub">Sales-ready</div>
        </div>
        <div className="kpi-card purple">
          <div className="kpi-label">No Activity</div>
          <div className="kpi-value">{noActivityCount}</div>
          <div className="kpi-sub">0 calls / emails / meetings</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">All Lead Records ({total} total)</div>
            <div className="panel-sub">Click name to open in HubSpot · Sorted by most recent</div>
          </div>
        </div>
        <div className="filter-row">
          <input
            className="search-box"
            placeholder="Search name, company, email…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
          <select className="filter-select" value={pipelineFilter} onChange={e => { setPipelineFilter(e.target.value); setStageFilter(''); setPage(1) }}>
            <option value="">All Pipelines</option>
            {pipelines.map(pid => (
              <option key={pid} value={pid}>{pipelineMap[pid] || (pid === 'lead-pipeline-id' ? 'Loop SQL' : pid)}</option>
            ))}
          </select>
          <select className="filter-select" value={stageFilter} onChange={handleFilterChange(setStageFilter)}>
            <option value="">All Stages</option>
            {stagesForPipeline.map(sid => (
              <option key={sid} value={sid}>{stageMap[sid] || sid}</option>
            ))}
          </select>
          <select className="filter-select" value={labelFilter} onChange={handleFilterChange(setLabelFilter)}>
            <option value="">All Labels</option>
            <option value="HOT">HOT</option>
            <option value="WARM">WARM</option>
            <option value="COLD">COLD</option>
          </select>
          <select className="filter-select" value={statusFilter} onChange={handleFilterChange(setStatusFilter)}>
            <option value="">All Statuses</option>
            <option value="new">New</option>
            <option value="in_progress">In Progress</option>
            <option value="qualified">Qualified</option>
            <option value="disqualified">Disqualified</option>
            <option value="no_activity">No Activity</option>
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Company</th>
                <th>Pipeline / Stage</th>
                <th>Label</th>
                <th>Status</th>
                <th>Activity</th>
                <th>Progress</th>
                <th>Last Active</th>
                <th>Next Activity</th>
                <th>Created</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {pageLeads.map((l, i) => (
                <LeadRow
                  key={l.id}
                  lead={l}
                  index={start + i + 1}
                  stageMap={stageMap}
                  pipelineMap={pipelineMap}
                />
              ))}
              {pageLeads.length === 0 && (
                <tr>
                  <td colSpan={12} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                    No leads match filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <span className="pagination-info">
            Showing {filtered.length === 0 ? 0 : start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length} leads
          </span>
          <button className="pagination-btn" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Page {safePage} of {totalPages}</span>
          <button className="pagination-btn" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      </div>
    </>
  )
}
