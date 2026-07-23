import { useState, useMemo } from 'react'

const PORTAL_ID = '243159630'
const PAGE_SIZE = 50

function parseTs(raw) {
  if (!raw) return null
  const n = Number(raw)
  const d = !isNaN(n) && String(raw).length >= 10 ? new Date(n) : new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

// Email bodies come as hs_email_text / hs_email_html (not the *_body suffix
// used by tasks/notes/calls/meetings), so match all three long-text shapes.
function isLongTextField(name) {
  return /_(body|text|html)$/.test(name || '')
}

// Convert an email body (HTML or plain text) into readable text with real line breaks
// preserved, instead of collapsing everything onto one line. Block-level tags and <br>
// become newlines; entities are decoded; runs of spaces/tabs collapse but newlines stay.
function bodyToText(raw) {
  let s = String(raw).replace(/\r\n?/g, '\n')
  // Drop content that never renders as body text
  s = s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  // <br> and closing block tags → newline; opening block tags → newline (paragraph breaks)
  s = s
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(p|div|tr|li|ul|ol|h[1-6]|blockquote|table)\s*>/gi, '\n')
    .replace(/<\s*(p|div|tr|li|h[1-6]|blockquote)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '') // strip any remaining tags
  // Decode the common HTML entities
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  // Collapse only spaces/tabs (keep newlines), trim each line, cap blank-line runs at one
  return s
    .replace(/[ \t\f\v]+/g, ' ')
    .split('\n').map(line => line.trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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
  if (isLongTextField(propDef?.name)) {
    return bodyToText(raw)
  }
  return String(raw)
}

function emailHsUrl(email) {
  const deal = email.deals?.[0]
  const contact = email.contacts?.[0]
  const company = email.companies?.[0]
  if (deal) return `https://app-na2.hubspot.com/contacts/${PORTAL_ID}/record/0-3/${deal.id}`
  if (contact) return `https://app-na2.hubspot.com/contacts/${PORTAL_ID}/record/0-1/${contact.id}`
  if (company) return `https://app-na2.hubspot.com/contacts/${PORTAL_ID}/record/0-2/${company.id}`
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

// start / end are ISO dates (YYYY-MM-DD), interpreted as [start, end) on hs_timestamp
// (start inclusive, end exclusive). Either may be omitted for an open-ended bound.
// rangeLabel is the human phrase for the subtitle; fileSuffix names the CSV export.
export default function EmailExports({ title = 'Emails', start, end, rangeLabel, fileSuffix = '' }) {
  const [emails, setEmails] = useState([])
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
      // The date split is done server-side (independent query per tab, scoped by
      // hs_timestamp) so each stays under HubSpot's 10k search cap — no client filtering.
      const params = new URLSearchParams()
      if (start) params.set('start', start)
      if (end) params.set('end', end)
      const qs = params.toString()
      const res = await fetch(`/api/all-emails${qs ? `?${qs}` : ''}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`)
      setEmails(json.emails || [])
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

  // Manually triggered — this is a heavy query, so the user loads it on demand via the
  // button rather than auto-fetching every time the tab is opened.

  // Emails already arrive scoped to this tab's date range from the server.
  const dateFiltered = emails

  // Raw HubSpot property columns (subject first), then derived association columns
  const propColumns = useMemo(() => {
    const subject = properties.find(p => p.name === 'hs_email_subject')
    const rest = properties.filter(p => p.name !== 'hs_email_subject')
    return [...(subject ? [subject] : []), ...rest].map(p => ({
      key: p.name,
      label: p.label || p.name,
      wide: isLongTextField(p.name),
      get: email => formatPropValue(p, email.properties?.[p.name]),
    }))
  }, [properties])

  const derivedColumns = useMemo(() => [
    { key: '_owner', label: 'Owner', get: e => e.ownerName || '' },
    {
      key: '_contact', label: 'Associated Contact',
      get: e => {
        const c = e.contacts?.[0]
        if (!c) return ''
        return [c.firstname, c.lastname].filter(Boolean).join(' ') || c.email || ''
      },
    },
    { key: '_contactId', label: 'Contact ID', get: e => e.contacts?.[0]?.id || '' },
    { key: '_deal', label: 'Associated Deal', get: e => e.deals?.[0]?.dealname || '' },
    { key: '_dealId', label: 'Deal ID', get: e => e.deals?.[0]?.id || '' },
    { key: '_company', label: 'Associated Company', get: e => e.companies?.[0]?.name || '' },
    { key: '_companyId', label: 'Company ID', get: e => e.companies?.[0]?.id || '' },
    {
      key: '_lead', label: 'Associated Lead',
      get: e => {
        const l = e.leads?.[0]
        if (!l) return ''
        return l.hs_lead_name || l.hs_associated_company_name || ''
      },
    },
    { key: '_leadId', label: 'Lead ID', get: e => e.leads?.[0]?.id || '' },
  ], [])

  const columns = useMemo(() => [...propColumns, ...derivedColumns], [propColumns, derivedColumns])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return dateFiltered
    return dateFiltered.filter(email =>
      columns.some(col => String(col.get(email) || '').toLowerCase().includes(q))
    )
  }, [dateFiltered, columns, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * PAGE_SIZE
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  const lastLoadedStr = lastLoaded
    ? lastLoaded.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null

  function exportToExcel() {
    const header = columns.map(c => c.label)
    const rows = filtered.map(email => columns.map(c => c.get(email)))
    const stamp = new Date().toISOString().split('T')[0]
    const suffix = fileSuffix ? `-${fileSuffix}` : ''
    downloadCsv(`hubspot-emails${suffix}-${stamp}.csv`, [header, ...rows])
  }

  const rangeSub = rangeLabel
    ? `Every HubSpot email ${rangeLabel}, all fields`
    : 'Every HubSpot email, all fields'

  const loadLabel = loading ? '↻ Loading…' : lastLoaded ? '↻ Reload' : '⬇ Load emails'

  // Manual-load: until the user clicks Load, show a prompt instead of firing the query.
  if (!lastLoaded && !error) {
    return (
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">{title}</div>
            <div className="panel-sub">{rangeSub}</div>
          </div>
          <button
            onClick={load}
            disabled={loading}
            style={{
              fontSize: 12, padding: '5px 12px', borderRadius: 6,
              border: 'none', background: 'var(--accent)', color: '#fff',
              cursor: loading ? 'wait' : 'pointer', fontWeight: 600,
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loadLabel}
          </button>
        </div>
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          {loading
            ? 'Loading emails from HubSpot…'
            : 'This is a large dataset — click "Load emails" to fetch it on demand.'}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">{title}</div>
            <div className="panel-sub">{rangeSub}</div>
          </div>
          <button
            onClick={load}
            disabled={loading}
            style={{
              fontSize: 12, padding: '5px 12px', borderRadius: 6,
              border: 'none', background: 'var(--accent)', color: '#fff',
              cursor: loading ? 'wait' : 'pointer', fontWeight: 600,
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loadLabel}
          </button>
        </div>
        <div className="state-box error">Error loading emails: {error}</div>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">{title}</div>
          <div className="panel-sub">
            {lastLoadedStr ? `Loaded at ${lastLoadedStr} — ${rangeSub}` : rangeSub}
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
            {loadLabel}
          </button>
        </div>
      </div>

      <div className="filter-row">
        <input
          className="filter-select"
          placeholder="Search emails…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          style={{ minWidth: 220, fontFamily: 'inherit' }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {filtered.length === dateFiltered.length
            ? `${dateFiltered.length} email${dateFiltered.length !== 1 ? 's' : ''}`
            : `${filtered.length} of ${dateFiltered.length} emails`}
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
            {pageRows.map(email => {
              const url = emailHsUrl(email)
              return (
                <tr key={email.id}>
                  {columns.map(col => {
                    const val = col.get(email)
                    return (
                      <td
                        key={col.key}
                        title={col.wide ? val : undefined}
                        style={{
                          fontSize: 12, color: 'var(--text-secondary)',
                          ...(col.wide ? { verticalAlign: 'top' } : { whiteSpace: 'nowrap' }),
                        }}
                      >
                        {col.wide
                          ? (val
                              ? <div style={{
                                  maxWidth: 360, maxHeight: 160, overflow: 'auto',
                                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.4,
                                }}>{val}</div>
                              : <span style={{ color: 'var(--text-muted)' }}>—</span>)
                          : (val || <span style={{ color: 'var(--text-muted)' }}>—</span>)}
                      </td>
                    )
                  })}
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
                  No emails match the current search
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <span className="pagination-info">
          Showing {filtered.length === 0 ? 0 : pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length} emails
        </span>
        <button className="pagination-btn" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Page {safePage} of {totalPages}</span>
        <button className="pagination-btn" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
      </div>
    </div>
  )
}
