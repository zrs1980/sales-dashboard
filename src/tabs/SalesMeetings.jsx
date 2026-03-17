import { useState, useMemo } from 'react'
import { useSortState, SortTh, FilterBar, selectStyle } from '../components/TableSort.jsx'

const OUTCOME_LABELS = {
  COMPLETED: 'Completed', NO_SHOW: 'No Show',
  CANCELLED: 'Cancelled', RESCHEDULED: 'Rescheduled', SCHEDULED: 'Scheduled',
}
const OUTCOME_COLORS = {
  COMPLETED: 'var(--success)', NO_SHOW: 'var(--danger)',
  CANCELLED: 'var(--warning)', RESCHEDULED: 'var(--accent)', SCHEDULED: 'var(--text-muted)',
}

const HS_BASE = 'https://app-na2.hubspot.com/contacts/243159630/record'

function parseTs(raw) {
  if (!raw) return null
  const s = String(raw)
  const d = /^\d+$/.test(s) ? new Date(parseInt(s)) : new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function fmtDateTime(ts) {
  const d = parseTs(ts)
  if (!d) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function fmtDuration(startTs, endTs) {
  const s = parseTs(startTs)
  const e = parseTs(endTs)
  if (!s || !e || e <= s) return '—'
  const mins = Math.round((e - s) / 60000)
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function OutcomeBadge({ outcome }) {
  const label = OUTCOME_LABELS[outcome] || outcome || 'Scheduled'
  const color = OUTCOME_COLORS[outcome] || 'var(--text-muted)'
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: `${color}20`, color }}>
      {label}
    </span>
  )
}

function sortMeetings(meetings, key, dir) {
  if (!key) return meetings
  return [...meetings].sort((a, b) => {
    const ap = a.properties || {}, bp = b.properties || {}
    let av = '', bv = ''
    if      (key === 'contact')  { av = ap.contact_name  || ''; bv = bp.contact_name  || '' }
    else if (key === 'company')  { av = ap.company_name  || ''; bv = bp.company_name  || '' }
    else if (key === 'title')    { av = ap.hs_meeting_title || ''; bv = bp.hs_meeting_title || '' }
    else if (key === 'date')     { av = ap.hs_timestamp  || ''; bv = bp.hs_timestamp  || '' }
    else if (key === 'assignee') { av = ap.owner_name    || ''; bv = bp.owner_name    || '' }
    else if (key === 'creator')  { av = ap.creator_name  || ''; bv = bp.creator_name  || '' }
    else if (key === 'outcome')  { av = ap.hs_meeting_outcome || ''; bv = bp.hs_meeting_outcome || '' }
    return dir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
  })
}

export default function SalesMeetings({ data, loading }) {
  if (loading && !data) return <div className="state-box">Loading meetings…</div>
  if (!data) return null

  const meetings = data.meetings || []

  const [outcomeFilter, setOutcomeFilter] = useState('')
  const [sort, toggleSort] = useSortState()

  const outcomeOptions = useMemo(() =>
    [...new Set(meetings.map(m => m.properties?.hs_meeting_outcome).filter(Boolean))].sort()
  , [meetings])

  const filtered = useMemo(() =>
    outcomeFilter
      ? meetings.filter(m => (m.properties?.hs_meeting_outcome || '') === outcomeFilter)
      : meetings
  , [meetings, outcomeFilter])

  const visible = useMemo(() => sortMeetings(filtered, sort.key, sort.dir), [filtered, sort])

  const completed = meetings.filter(m => m.properties?.hs_meeting_outcome === 'COMPLETED').length
  const noShows   = meetings.filter(m => m.properties?.hs_meeting_outcome === 'NO_SHOW').length
  const showRate  = meetings.length > 0 ? Math.round((completed / meetings.length) * 100) : 0

  return (
    <>
      <div className="kpi-row">
        <div className="kpi-card blue">
          <div className="kpi-label">Total Appointments</div>
          <div className="kpi-value">{meetings.length}</div>
          <div className="kpi-sub">Last 90 days</div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-label">Completed</div>
          <div className="kpi-value">{completed}</div>
          <div className="kpi-sub">Showed up</div>
        </div>
        <div className="kpi-card orange">
          <div className="kpi-label">No Shows</div>
          <div className="kpi-value">{noShows}</div>
          <div className="kpi-sub">Did not attend</div>
        </div>
        <div className="kpi-card purple">
          <div className="kpi-label">Show Rate</div>
          <div className="kpi-value">{showRate}%</div>
          <div className="kpi-sub">Completed vs total</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">SDR → Sales Appointments</div>
            <div className="panel-sub">Click column headers to sort</div>
          </div>
        </div>

        <FilterBar
          count={visible.length}
          total={meetings.length}
          hasFilters={!!outcomeFilter}
          onClear={() => setOutcomeFilter('')}
        >
          <select value={outcomeFilter} onChange={e => setOutcomeFilter(e.target.value)} style={selectStyle}>
            <option value="">All Outcomes</option>
            {outcomeOptions.map(o => (
              <option key={o} value={o}>{OUTCOME_LABELS[o] || o}</option>
            ))}
          </select>
        </FilterBar>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <SortTh sortKey="contact"  sort={sort} onSort={toggleSort}>Contact</SortTh>
                <SortTh sortKey="company"  sort={sort} onSort={toggleSort}>Company</SortTh>
                <SortTh sortKey="title"    sort={sort} onSort={toggleSort}>Meeting</SortTh>
                <SortTh sortKey="date"     sort={sort} onSort={toggleSort}>Date</SortTh>
                <SortTh sortKey="assignee" sort={sort} onSort={toggleSort}>Assignee</SortTh>
                <SortTh sortKey="creator"  sort={sort} onSort={toggleSort}>Booked By</SortTh>
                <SortTh sortKey="outcome"  sort={sort} onSort={toggleSort}>Outcome</SortTh>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(m => {
                const p   = m.properties || {}
                const url = p.contact_id ? `${HS_BASE}/0-1/${p.contact_id}` : null
                return (
                  <tr key={m.id}>
                    <td>
                      {url
                        ? <a className="deal-link" href={url} target="_blank" rel="noreferrer">{p.contact_name || 'Unknown'}</a>
                        : <span style={{ color: 'var(--text-muted)' }}>{p.contact_name || '—'}</span>}
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{p.company_name || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 220 }}>{p.hs_meeting_title || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtDateTime(p.hs_timestamp)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.owner_name || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.creator_name || '—'}</td>
                    <td><OutcomeBadge outcome={p.hs_meeting_outcome} /></td>
                    <td style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: 'var(--text-secondary)' }}>
                      {fmtDuration(p.hs_timestamp, p.hs_meeting_end_time)}
                    </td>
                  </tr>
                )
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                    No appointments found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
