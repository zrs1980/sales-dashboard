import { useState, useMemo } from 'react'
import { fmtDate, getLeadStatusBadge } from '../utils.js'

const PAGE_SIZE = 25

function TouchDots({ touches }) {
  const max = 7
  const filled = Math.min(touches, max)
  const isDone = touches >= max
  return (
    <div className="touches-bar">
      <div className="touches-dots">
        {Array.from({ length: max }, (_, i) => (
          <div
            key={i}
            className={`touch-dot${i < filled ? (isDone ? ' done' : ' filled') : ''}`}
          />
        ))}
      </div>
      <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: 'var(--text-muted)' }}>
        {touches}/7
      </span>
    </div>
  )
}

function LeadRow({ lead, index }) {
  const p = lead.properties || {}
  const id = lead.id
  const first = p.firstname || ''
  const last = p.lastname || ''
  const name = `${first} ${last}`.trim() || p.email || `Lead #${id}`
  const company = p.company || ''
  const status = p.hs_lead_status || 'NEW'
  const touches = parseInt(p.num_contacted_notes || 0)
  const lastContact = p.notes_last_updated
  const hsUrl = `https://app-na2.hubspot.com/contacts/243159630/record/0-1/${id}`
  const touchColor = touches === 0 ? 'var(--danger)' : touches >= 7 ? 'var(--success)' : 'var(--text-primary)'

  return (
    <tr>
      <td style={{ color: 'var(--text-muted)', fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{index}</td>
      <td><a className="deal-link" href={hsUrl} target="_blank" rel="noreferrer">{name}</a></td>
      <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{company || '—'}</td>
      <td><span className={`badge ${getLeadStatusBadge(status)}`}>{status}</span></td>
      <td>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600, color: touchColor }}>
          {touches}
        </span>
      </td>
      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {lastContact
          ? fmtDate(lastContact)
          : <span style={{ color: 'var(--danger)' }}>Never</span>}
      </td>
      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(p.createdate)}</td>
      <td><TouchDots touches={touches} /></td>
      <td><a className="deal-link" href={hsUrl} target="_blank" rel="noreferrer">Open →</a></td>
    </tr>
  )
}

export default function LeadDashboard({ data, loading }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [touchFilter, setTouchFilter] = useState('')
  const [page, setPage] = useState(1)

  if (loading && !data) return <div className="state-box">Loading leads…</div>
  if (!data) return null

  const leads = data.leads || []

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return leads.filter(l => {
      const p = l.properties || {}
      const name = `${p.firstname || ''} ${p.lastname || ''}`.toLowerCase()
      const company = (p.company || '').toLowerCase()
      const status = p.hs_lead_status || 'NEW'
      const touches = parseInt(p.num_contacted_notes || 0)

      if (q && !name.includes(q) && !company.includes(q)) return false
      if (statusFilter && status !== statusFilter) return false
      if (touchFilter === '0' && touches !== 0) return false
      if (touchFilter === '1-3' && (touches < 1 || touches > 3)) return false
      if (touchFilter === '4-6' && (touches < 4 || touches > 6)) return false
      if (touchFilter === '7+' && touches < 7) return false
      return true
    })
  }, [leads, search, statusFilter, touchFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * PAGE_SIZE
  const pageLeads = filtered.slice(start, start + PAGE_SIZE)

  // KPI counts
  const total = leads.length
  const newCount = leads.filter(l => l.properties?.hs_lead_status === 'NEW').length
  const openCount = leads.filter(l => l.properties?.hs_lead_status === 'OPEN').length
  const connectedCount = leads.filter(l => l.properties?.hs_lead_status === 'CONNECTED').length
  const zeroTouches = leads.filter(l => parseInt(l.properties?.num_contacted_notes || 0) === 0).length

  function handleFilterChange(setter) {
    return (e) => { setter(e.target.value); setPage(1) }
  }

  return (
    <>
      <div className="kpi-row">
        <div className="kpi-card blue">
          <div className="kpi-label">Total Leads</div>
          <div className="kpi-value">{total}</div>
          <div className="kpi-sub">lifecyclestage = lead</div>
        </div>
        <div className="kpi-card red">
          <div className="kpi-label">NEW</div>
          <div className="kpi-value">{newCount}</div>
          <div className="kpi-sub">Need outreach</div>
        </div>
        <div className="kpi-card orange">
          <div className="kpi-label">OPEN</div>
          <div className="kpi-value">{openCount}</div>
          <div className="kpi-sub">In-progress leads</div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-label">CONNECTED</div>
          <div className="kpi-value">{connectedCount}</div>
          <div className="kpi-sub">Engaged</div>
        </div>
        <div className="kpi-card purple">
          <div className="kpi-label">0 Touches</div>
          <div className="kpi-value">{zeroTouches}</div>
          <div className="kpi-sub">Never contacted</div>
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
            placeholder="Search leads…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
          <select className="filter-select" value={statusFilter} onChange={handleFilterChange(setStatusFilter)}>
            <option value="">All Statuses</option>
            <option value="NEW">NEW</option>
            <option value="OPEN">OPEN</option>
            <option value="CONNECTED">CONNECTED</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="BAD_TIMING">BAD_TIMING</option>
          </select>
          <select className="filter-select" value={touchFilter} onChange={handleFilterChange(setTouchFilter)}>
            <option value="">All Touch Counts</option>
            <option value="0">0 touches</option>
            <option value="1-3">1–3 touches</option>
            <option value="4-6">4–6 touches</option>
            <option value="7+">7+ touches</option>
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th><th>Name</th><th>Company</th><th>Status</th><th>Touches</th>
                <th>Last Contact</th><th>Created</th><th>7-Touch Progress</th><th>Link</th>
              </tr>
            </thead>
            <tbody>
              {pageLeads.map((l, i) => (
                <LeadRow key={l.id} lead={l} index={start + i + 1} />
              ))}
              {pageLeads.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>No leads match filters</td></tr>
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
