import { useState, useMemo, useRef, useEffect } from 'react'
import { fmtDate } from '../utils.js'
import LeadInsights from '../components/LeadInsights.jsx'

function MultiSelect({ options, selected, onChange, placeholder }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function toggle(val) {
    const next = selected.includes(val)
      ? selected.filter(v => v !== val)
      : [...selected, val]
    onChange(next)
  }

  const label = selected.length === 0
    ? placeholder
    : selected.length === 1
      ? (options.find(o => o.value === selected[0])?.label || selected[0])
      : `${selected.length} selected`

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="filter-select"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 6, cursor: 'pointer', minWidth: 140,
          color: selected.length ? 'var(--text-primary)' : 'var(--text-muted)',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ fontSize: 10, flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 100,
          background: 'var(--white)', border: '1px solid var(--border)',
          borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          minWidth: 180, maxHeight: 260, overflowY: 'auto', padding: '4px 0',
        }}>
          <div style={{ borderBottom: '1px solid var(--border)', marginBottom: 2 }}>
            <div
              onClick={() => onChange(options.map(o => o.value))}
              style={{ padding: '6px 12px', fontSize: 11, color: 'var(--accent)', cursor: 'pointer', display: 'inline-block' }}
            >
              Select all
            </div>
            {selected.length > 0 && (
              <span
                onClick={() => onChange([])}
                style={{ padding: '6px 12px', fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                Clear
              </span>
            )}
          </div>
          {options.map(opt => (
            <label key={opt.value} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 12px', cursor: 'pointer', fontSize: 12,
              color: 'var(--text-primary)',
              background: selected.includes(opt.value) ? 'var(--off-white)' : 'transparent',
            }}>
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

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

function SortableTh({ col, label, sortKey, sortDir, onSort }) {
  const active = sortKey === col
  return (
    <th
      onClick={() => onSort(col)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      {label}{' '}
      <span style={{ fontSize: 10, color: active ? 'var(--accent)' : 'var(--border)' }}>
        {active ? (sortDir === 'asc' ? '▲' : '▼') : '▲▼'}
      </span>
    </th>
  )
}

function getSortVal(lead, col, stageMap) {
  const p = lead.properties || {}
  const totalActivities = parseInt(p.hs_lead_outreach_activity_count || 0) || (parseInt(p.hs_lead_call_count || 0) + parseInt(p.hs_lead_email_count || 0) + parseInt(p.hs_lead_meeting_count || 0))
  switch (col) {
    case 'name':
      return (p.hs_lead_name || [p.hs_associated_contact_firstname, p.hs_associated_contact_lastname].filter(Boolean).join(' ') || '').toLowerCase()
    case 'company':
      return (p.hs_associated_company_name || '').toLowerCase()
    case 'stage':
      return (stageMap[p.hs_pipeline_stage] || p.hs_pipeline_stage || '').toLowerCase()
    case 'label': {
      const order = { HOT: 0, WARM: 1, COLD: 2, '': 3 }
      return order[p.hs_lead_label || ''] ?? 3
    }
    case 'status': {
      if (p.hs_lead_is_disqualified === 'true') return 4
      if (p.hs_lead_is_qualified === 'true') return 3
      if (p.hs_lead_is_in_progress === 'true') return 2
      if (p.hs_lead_is_new === 'true') return 0
      return 1
    }
    case 'progress':
      return totalActivities
    case 'last_active':
      return p.hs_last_activity_date ? new Date(p.hs_last_activity_date).getTime() : 0
    case 'next_activity':
      return p.hs_next_activity_date ? new Date(p.hs_next_activity_date).getTime() : Infinity
    case 'created':
      return p.hs_createdate ? new Date(p.hs_createdate).getTime() : 0
    default:
      return ''
  }
}

export default function LeadDashboard({ data, loading }) {
  const [search, setSearch] = useState('')
  const [pipelineFilter, setPipelineFilter] = useState([])
  const [stageFilter, setStageFilter] = useState([])
  const [labelFilter, setLabelFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState([])
  const [sortKey, setSortKey] = useState('created')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(1)

  function handlePipelineChange(next) {
    setPipelineFilter(next)
    // Drop any stage selections that don't belong to the newly selected pipelines
    if (next.length > 0) {
      const validStages = new Set(
        leads
          .filter(l => next.includes(l.properties?.hs_pipeline))
          .map(l => l.properties?.hs_pipeline_stage)
      )
      setStageFilter(prev => prev.filter(s => validStages.has(s)))
    }
    setPage(1)
  }

  function handleSort(col) {
    if (sortKey === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(col)
      setSortDir('asc')
    }
    setPage(1)
  }

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
      .filter(l => pipelineFilter.length === 0 || pipelineFilter.includes(l.properties?.hs_pipeline))
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
      if (pipelineFilter.length > 0 && !pipelineFilter.includes(p.hs_pipeline)) return false
      if (stageFilter.length > 0 && !stageFilter.includes(p.hs_pipeline_stage)) return false
      if (labelFilter && p.hs_lead_label !== labelFilter) return false
      if (statusFilter.length > 0) {
        const actTotal = parseInt(p.hs_lead_outreach_activity_count || 0) || (parseInt(p.hs_lead_call_count || 0) + parseInt(p.hs_lead_email_count || 0) + parseInt(p.hs_lead_meeting_count || 0))
        const matchesAny = statusFilter.some(s => {
          if (s === 'new') return p.hs_lead_is_new === 'true'
          if (s === 'in_progress') return p.hs_lead_is_in_progress === 'true'
          if (s === 'qualified') return p.hs_lead_is_qualified === 'true'
          if (s === 'disqualified') return p.hs_lead_is_disqualified === 'true'
          if (s === 'no_activity') return actTotal === 0
          return false
        })
        if (!matchesAny) return false
      }
      return true
    })
  }, [leads, search, pipelineFilter, stageFilter, labelFilter, statusFilter])

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const av = getSortVal(a, sortKey, stageMap)
      const bv = getSortVal(b, sortKey, stageMap)
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })
  }, [filtered, sortKey, sortDir, stageMap])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * PAGE_SIZE
  const pageLeads = sorted.slice(start, start + PAGE_SIZE)

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

      <LeadInsights leads={leads} stageMap={stageMap} pipelineMap={pipelineMap} />

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">All Lead Records ({total} total)</div>
            <div className="panel-sub">Click name to open in HubSpot · Click column headers to sort</div>
          </div>
        </div>
        <div className="filter-row">
          <input
            className="search-box"
            placeholder="Search name, company, email…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
          <MultiSelect
            placeholder="All Pipelines"
            options={pipelines.map(pid => ({
              value: pid,
              label: pipelineMap[pid] || (pid === 'lead-pipeline-id' ? 'Loop SQL' : pid),
            }))}
            selected={pipelineFilter}
            onChange={handlePipelineChange}
          />
          <MultiSelect
            placeholder="All Stages"
            options={stagesForPipeline.map(sid => ({
              value: sid,
              label: stageMap[sid] || sid,
            }))}
            selected={stageFilter}
            onChange={next => { setStageFilter(next); setPage(1) }}
          />
          <select className="filter-select" value={labelFilter} onChange={handleFilterChange(setLabelFilter)}>
            <option value="">All Labels</option>
            <option value="HOT">HOT</option>
            <option value="WARM">WARM</option>
            <option value="COLD">COLD</option>
          </select>
          <MultiSelect
            placeholder="All Statuses"
            options={[
              { value: 'new', label: 'New' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'qualified', label: 'Qualified' },
              { value: 'disqualified', label: 'Disqualified' },
              { value: 'no_activity', label: 'No Activity' },
            ]}
            selected={statusFilter}
            onChange={next => { setStatusFilter(next); setPage(1) }}
          />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <SortableTh col="name"          label="Name"          sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh col="company"       label="Company"       sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh col="stage"         label="Pipeline / Stage" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh col="label"         label="Label"         sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh col="status"        label="Status"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <th>Activity</th>
                <SortableTh col="progress"      label="Progress"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh col="last_active"   label="Last Active"   sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh col="next_activity" label="Next Activity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh col="created"       label="Created"       sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
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
            Showing {sorted.length === 0 ? 0 : start + 1}–{Math.min(start + PAGE_SIZE, sorted.length)} of {sorted.length} leads
          </span>
          <button className="pagination-btn" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Page {safePage} of {totalPages}</span>
          <button className="pagination-btn" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      </div>
    </>
  )
}
