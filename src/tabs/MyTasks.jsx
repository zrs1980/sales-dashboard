import { useState, useEffect, useMemo } from 'react'
import { fmtDate } from '../utils.js'

const PORTAL_ID = '243159630'
const DEFAULT_EMAIL = 'zabe@cebasolutions.com'

const TYPE_LABELS = {
  CALL: 'Call',
  EMAIL: 'Email',
  TODO: 'Task',
  LINKEDIN_MESSAGE: 'LinkedIn',
}

const STATUS_LABELS = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  WAITING: 'Waiting',
  DEFERRED: 'Deferred',
}

const TYPE_COLORS = {
  CALL: { bg: '#eff6ff', color: '#2563eb' },
  EMAIL: { bg: '#f0fdf4', color: '#16a34a' },
  TODO: { bg: '#f5f3ff', color: '#7c3aed' },
  LINKEDIN_MESSAGE: { bg: '#fef3c7', color: '#b45309' },
}

const PRIORITY_COLORS = {
  HIGH: { bg: '#fef2f2', color: '#dc2626' },
  MEDIUM: { bg: '#fffbeb', color: '#d97706' },
}

function TypeBadge({ type }) {
  const label = TYPE_LABELS[type] || type || 'Task'
  const colors = TYPE_COLORS[type] || { bg: '#f3f4f6', color: '#6b7280' }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 4,
      fontSize: 11, fontWeight: 600, background: colors.bg, color: colors.color,
    }}>{label}</span>
  )
}

function PriorityBadge({ priority }) {
  if (!priority || priority === 'NONE') return null
  const colors = PRIORITY_COLORS[priority] || { bg: '#f3f4f6', color: '#6b7280' }
  return (
    <span style={{
      display: 'inline-block', padding: '1px 5px', borderRadius: 4,
      fontSize: 10, fontWeight: 600, background: colors.bg, color: colors.color, marginLeft: 4,
    }}>{priority.charAt(0) + priority.slice(1).toLowerCase()}</span>
  )
}

function DueDateCell({ ts }) {
  if (!ts) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
  const d = new Date(parseInt(ts))
  if (isNaN(d.getTime())) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
  const now = new Date()
  const diffDays = Math.round((d - now) / 86400000)
  let color = 'var(--text-secondary)'
  let label = ''
  let weight = undefined
  if (diffDays < 0) {
    color = 'var(--danger)'
    label = `${Math.abs(diffDays)}d overdue`
    weight = 700
  } else if (diffDays === 0) {
    color = 'var(--warning)'
    label = 'Today'
    weight = 600
  } else if (diffDays === 1) {
    color = 'var(--warning)'
    label = 'Tomorrow'
  } else if (diffDays <= 7) {
    color = 'var(--success)'
    label = `In ${diffDays}d`
  } else {
    label = fmtDate(d.toISOString())
  }
  return (
    <div>
      <div style={{ fontSize: 12, color, fontWeight: weight }}>{label}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{d.toLocaleDateString()}</div>
    </div>
  )
}

function taskHsUrl(task) {
  const deal = task.deals?.[0]
  const contact = task.contacts?.[0]
  const company = task.companies?.[0]
  if (deal) return `https://app-na2.hubspot.com/contacts/${PORTAL_ID}/record/0-3/${deal.id}?taskId=${task.id}`
  if (contact) return `https://app-na2.hubspot.com/contacts/${PORTAL_ID}/record/0-1/${contact.id}?taskId=${task.id}`
  if (company) return `https://app-na2.hubspot.com/contacts/${PORTAL_ID}/record/0-2/${company.id}?taskId=${task.id}`
  return null
}

function taskDueDays(ts) {
  if (!ts) return null
  const d = new Date(parseInt(ts))
  if (isNaN(d.getTime())) return null
  const now = new Date()
  return Math.round((d - now) / 86400000)
}

export default function MyTasks() {
  const [tasks, setTasks] = useState([])
  const [owners, setOwners] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastLoaded, setLastLoaded] = useState(null)

  const [ownerFilter, setOwnerFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [datePreset, setDatePreset] = useState('week')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/my-tasks')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`)
      setTasks(json.tasks || [])
      const ownerList = json.owners || []
      setOwners(ownerList)
      if (!ownerFilter) {
        const def = ownerList.find(o => o.email === DEFAULT_EMAIL)
        if (def) setOwnerFilter(def.id)
      }
      setLastLoaded(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd   = new Date(todayStart.getTime() + 86400000)
    const weekEnd    = new Date(todayStart.getTime() + 7 * 86400000)
    const monthEnd   = new Date(todayStart.getTime() + 30 * 86400000)

    return tasks.filter(task => {
      const p = task.properties || {}
      if (ownerFilter && p.hubspot_owner_id !== ownerFilter) return false
      if (typeFilter && p.hs_task_type !== typeFilter) return false

      const ts = p.hs_timestamp ? parseInt(p.hs_timestamp) : null
      const dueDate = ts ? new Date(ts) : null

      if (datePreset === 'overdue') {
        if (!dueDate || dueDate >= todayStart) return false
      } else if (datePreset === 'today') {
        if (!dueDate || dueDate < todayStart || dueDate >= todayEnd) return false
      } else if (datePreset === 'week') {
        if (!dueDate || dueDate >= weekEnd) return false
      } else if (datePreset === 'month') {
        if (!dueDate || dueDate >= monthEnd) return false
      }
      return true
    })
  }, [tasks, ownerFilter, typeFilter, datePreset])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const at = parseInt(a.properties?.hs_timestamp || 0)
      const bt = parseInt(b.properties?.hs_timestamp || 0)
      if (!at && !bt) return 0
      if (!at) return 1
      if (!bt) return -1
      return at - bt
    })
  }, [filtered])

  // KPI counts (from full owner-filtered set, ignoring date preset)
  const ownerTasks = useMemo(() => ownerFilter
    ? tasks.filter(t => t.properties?.hubspot_owner_id === ownerFilter)
    : tasks
  , [tasks, ownerFilter])

  const kpiOverdue = useMemo(() => {
    const now = new Date()
    return ownerTasks.filter(t => {
      const d = taskDueDays(t.properties?.hs_timestamp)
      return d !== null && d < 0
    }).length
  }, [ownerTasks])

  const kpiToday = useMemo(() => {
    return ownerTasks.filter(t => taskDueDays(t.properties?.hs_timestamp) === 0).length
  }, [ownerTasks])

  const kpiWeek = useMemo(() => {
    return ownerTasks.filter(t => {
      const d = taskDueDays(t.properties?.hs_timestamp)
      return d !== null && d >= 1 && d <= 7
    }).length
  }, [ownerTasks])

  const typeOptions = useMemo(() => {
    const seen = new Set(tasks.map(t => t.properties?.hs_task_type).filter(Boolean))
    return [...seen]
  }, [tasks])

  const lastLoadedStr = lastLoaded
    ? lastLoaded.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null

  if (loading && !tasks.length) {
    return <div className="state-box">Loading tasks…</div>
  }

  if (error) {
    return <div className="state-box error">Error loading tasks: {error}</div>
  }

  const DATE_PRESETS = [
    { value: 'overdue', label: 'Overdue' },
    { value: 'today',   label: 'Today' },
    { value: 'week',    label: 'This Week' },
    { value: 'month',   label: 'This Month' },
    { value: 'all',     label: 'All Open' },
  ]

  return (
    <>
      <div className="kpi-row">
        <div className="kpi-card blue">
          <div className="kpi-label">Total Open</div>
          <div className="kpi-value">{ownerTasks.length}</div>
          <div className="kpi-sub">Open tasks</div>
        </div>
        <div className="kpi-card red">
          <div className="kpi-label">Overdue</div>
          <div className="kpi-value">{kpiOverdue}</div>
          <div className="kpi-sub">Past due date</div>
        </div>
        <div className="kpi-card orange">
          <div className="kpi-label">Due Today</div>
          <div className="kpi-value">{kpiToday}</div>
          <div className="kpi-sub">Due today</div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-label">Due This Week</div>
          <div className="kpi-value">{kpiWeek}</div>
          <div className="kpi-sub">Next 7 days</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">My Open Tasks</div>
            <div className="panel-sub">
              {lastLoadedStr ? `Loaded at ${lastLoadedStr}` : 'All open HubSpot tasks with associated records'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={load}
              disabled={loading}
              style={{
                fontSize: 12, padding: '5px 12px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'none',
                cursor: loading ? 'wait' : 'pointer', color: 'var(--text-secondary)',
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? '↻ Loading…' : '↻ Refresh'}
            </button>
          </div>
        </div>

        <div className="filter-row">
          {/* Assignee */}
          <select
            className="filter-select"
            value={ownerFilter}
            onChange={e => setOwnerFilter(e.target.value)}
          >
            <option value="">All Assignees</option>
            {owners.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>

          {/* Type */}
          <select
            className="filter-select"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
          >
            <option value="">All Types</option>
            {typeOptions.map(t => (
              <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>
            ))}
          </select>

          {/* Date presets */}
          <div style={{ display: 'flex', gap: 4 }}>
            {DATE_PRESETS.map(p => (
              <button
                key={p.value}
                onClick={() => setDatePreset(p.value)}
                style={{
                  padding: '5px 10px', borderRadius: 6, fontSize: 12,
                  cursor: 'pointer', fontWeight: 500,
                  border: '1px solid',
                  background: datePreset === p.value ? 'var(--accent)' : 'var(--white)',
                  color: datePreset === p.value ? '#fff' : 'var(--text-secondary)',
                  borderColor: datePreset === p.value ? 'var(--accent)' : 'var(--border)',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
            {sorted.length} task{sorted.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 110 }}>Due Date</th>
                <th>Subject</th>
                <th style={{ width: 90 }}>Type</th>
                <th style={{ width: 100 }}>Status</th>
                <th style={{ width: 130 }}>Assignee</th>
                <th>Contact</th>
                <th>Company</th>
                <th>Deal</th>
                <th style={{ width: 60 }}>Open</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(task => {
                const p = task.properties || {}
                const ownerName = owners.find(o => o.id === p.hubspot_owner_id)?.name || p.hubspot_owner_id || '—'
                const hsUrl = taskHsUrl(task)
                const contact = task.contacts?.[0]
                const contactName = contact
                  ? [contact.firstname, contact.lastname].filter(Boolean).join(' ') || contact.email || '—'
                  : null
                const company = task.companies?.[0]
                const deal = task.deals?.[0]

                return (
                  <tr key={task.id}>
                    <td><DueDateCell ts={p.hs_timestamp} /></td>
                    <td>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>
                        {p.hs_task_subject || '(No subject)'}
                        <PriorityBadge priority={p.hs_task_priority} />
                      </div>
                      {p.hs_task_body && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.hs_task_body}
                        </div>
                      )}
                    </td>
                    <td><TypeBadge type={p.hs_task_type} /></td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {STATUS_LABELS[p.hs_task_status] || p.hs_task_status || '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ownerName}</td>
                    <td>
                      {contactName ? (
                        <div>
                          <div style={{ fontSize: 12 }}>{contactName}</div>
                          {contact.email && (
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{contact.email}</div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {company?.name || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {deal?.dealname ? (
                        <a
                          href={`https://app-na2.hubspot.com/contacts/${PORTAL_ID}/record/0-3/${deal.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="deal-link"
                          style={{ fontSize: 12 }}
                        >
                          {deal.dealname}
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      {hsUrl ? (
                        <a
                          href={hsUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: 'inline-block', padding: '3px 8px',
                            background: 'var(--accent)', color: '#fff',
                            borderRadius: 4, fontSize: 11, fontWeight: 600,
                            textDecoration: 'none', whiteSpace: 'nowrap',
                          }}
                        >
                          Open ↗
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                    No tasks match the current filters
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
