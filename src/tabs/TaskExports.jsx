import { useState, useEffect, useMemo } from 'react'

const PORTAL_ID = '243159630'
const PAGE_SIZE = 50

function parseTs(raw) {
  if (!raw) return null
  const n = Number(raw)
  const d = !isNaN(n) && String(raw).length >= 10 ? new Date(n) : new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

function formatPropValue(propDef, raw) {
  if (raw == null || raw === '') return ''
  if (propDef?.type === 'enumeration' && propDef.options?.length) {
    const lookup = v => propDef.options.find(o => o.value === v)?.label ?? v
    return String(raw).includes(';') ? String(raw).split(';').map(lookup).join(', ') : lookup(raw)
  }
  if (propDef?.type === 'bool' || propDef?.fieldType === 'booleancheckbox') {
    return raw === 'true' ? 'Yes' : raw === 'false' ? 'No' : String(raw)
  }
  if (propDef?.type === 'datetime' || propDef?.type === 'date') {
    const d = parseTs(raw)
    if (d) return propDef.type === 'date' ? d.toLocaleDateString() : d.toLocaleString()
  }
  return String(raw)
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

function csvEscape(val) {
  const s = val == null ? '' : String(val)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadCsv(filename, rows) {
  const csv = rows.map(row => row.map(csvEscape).join(',')).join('\r\n')
  // BOM so Excel detects UTF-8 correctly instead of mangling special characters
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function TaskExports() {
  const [tasks, setTasks] = useState([])
  const [properties, setProperties] = useState([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastLoaded, setLastLoaded] = useState(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/all-tasks')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`)
      setTasks(json.tasks || [])
      setProperties(json.properties || [])
      setTruncated(!!json.truncated)
      setLastLoaded(new Date())
      setPage(1)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Raw HubSpot property columns (subject first), then derived association columns
  const propColumns = useMemo(() => {
    const subject = properties.find(p => p.name === 'hs_task_subject')
    const rest = properties.filter(p => p.name !== 'hs_task_subject')
    return [...(subject ? [subject] : []), ...rest].map(p => ({
      key: p.name,
      label: p.label || p.name,
      get: task => formatPropValue(p, task.properties?.[p.name]),
    }))
  }, [properties])

  const derivedColumns = useMemo(() => [
    { key: '_owner', label: 'Owner', get: t => t.ownerName || '' },
    {
      key: '_contact', label: 'Associated Contact',
      get: t => {
        const c = t.contacts?.[0]
        if (!c) return ''
        return [c.firstname, c.lastname].filter(Boolean).join(' ') || c.email || ''
      },
    },
    { key: '_deal', label: 'Associated Deal', get: t => t.deals?.[0]?.dealname || '' },
    { key: '_company', label: 'Associated Company', get: t => t.companies?.[0]?.name || '' },
  ], [])

  const columns = useMemo(() => [...propColumns, ...derivedColumns], [propColumns, derivedColumns])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tasks
    return tasks.filter(task =>
      columns.some(col => String(col.get(task) || '').toLowerCase().includes(q))
    )
  }, [tasks, columns, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * PAGE_SIZE
  const pageRows = filtered.slice(start, start + PAGE_SIZE)

  const lastLoadedStr = lastLoaded
    ? lastLoaded.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null

  function exportToExcel() {
    const header = columns.map(c => c.label)
    const rows = filtered.map(task => columns.map(c => c.get(task)))
    const stamp = new Date().toISOString().split('T')[0]
    downloadCsv(`hubspot-tasks-${stamp}.csv`, [header, ...rows])
  }

  if (loading && !tasks.length) {
    return <div className="state-box">Loading tasks…</div>
  }

  if (error) {
    return <div className="state-box error">Error loading tasks: {error}</div>
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Task Exports</div>
          <div className="panel-sub">
            {lastLoadedStr ? `Loaded at ${lastLoadedStr}` : 'Every HubSpot task, all fields'}
            {truncated && ' — result set was truncated by HubSpot paging limits'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={exportToExcel}
            disabled={loading || !filtered.length}
            style={{
              fontSize: 12, padding: '5px 12px', borderRadius: 6,
              border: 'none', background: 'var(--success)', color: '#fff',
              cursor: loading || !filtered.length ? 'default' : 'pointer', fontWeight: 600,
              opacity: loading || !filtered.length ? 0.6 : 1,
            }}
          >
            ⬇ Export to Excel
          </button>
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
        <input
          className="filter-select"
          placeholder="Search tasks…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          style={{ minWidth: 220, fontFamily: 'inherit' }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {filtered.length === tasks.length
            ? `${tasks.length} task${tasks.length !== 1 ? 's' : ''}`
            : `${filtered.length} of ${tasks.length} tasks`}
        </span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key} style={{ whiteSpace: 'nowrap' }}>{col.label}</th>
              ))}
              <th style={{ width: 70 }}>Open</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map(task => {
              const url = taskHsUrl(task)
              return (
                <tr key={task.id}>
                  {columns.map(col => (
                    <td key={col.key} style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {col.get(task) || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                  ))}
                  <td>
                    {url ? (
                      <a
                        href={url}
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
                    ) : null}
                  </td>
                </tr>
              )
            })}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                  No tasks match the current search
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <span className="pagination-info">
          Showing {filtered.length === 0 ? 0 : start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length} tasks
        </span>
        <button className="pagination-btn" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Page {safePage} of {totalPages}</span>
        <button className="pagination-btn" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
      </div>
    </div>
  )
}
