import { useState, useMemo, useEffect, useRef } from 'react'

// --- Constants ---
const CALL_TARGET_PER_DAY    = 75
const MEETING_TARGET_PER_DAY = 1
const CALL_TARGETS    = { day: 75, week: 375, month: 1500 }
const MEETING_TARGETS = { day: 1,  week: 5,  month: 20 }

const OUTCOME_LABELS = {
  COMPLETED: 'Connected', CONNECTED: 'Connected',
  LEFT_VOICEMAIL: 'Left Voicemail', LEFT_MESSAGE: 'Left Message',
  NO_ANSWER: 'No Answer', BUSY: 'Busy', WRONG_NUMBER: 'Wrong Number',
  FAILED: 'Failed', CANCELLED: 'Cancelled',
}
const OUTCOME_COLORS = {
  COMPLETED: 'var(--success)', CONNECTED: 'var(--success)',
  LEFT_VOICEMAIL: 'var(--accent)', LEFT_MESSAGE: 'var(--accent)',
  NO_ANSWER: 'var(--text-muted)', BUSY: 'var(--warning)',
  WRONG_NUMBER: 'var(--danger)', FAILED: 'var(--danger)', CANCELLED: 'var(--text-muted)',
}

function isConnected(status) {
  return status === 'CONNECTED' || status === 'COMPLETED'
}
const MEETING_OUTCOME_LABELS = {
  COMPLETED: 'Completed', NO_SHOW: 'No Show',
  CANCELLED: 'Cancelled', RESCHEDULED: 'Rescheduled', SCHEDULED: 'Scheduled',
}
const MEETING_OUTCOME_COLORS = {
  COMPLETED: 'var(--success)', NO_SHOW: 'var(--danger)',
  CANCELLED: 'var(--warning)', RESCHEDULED: 'var(--accent)', SCHEDULED: 'var(--text-muted)',
}

const HS_BASE = 'https://app-na2.hubspot.com/contacts/243159630/record'

// --- Helpers ---
function parseTs(raw) {
  if (!raw) return null
  const s = String(raw)
  const d = /^\d+$/.test(s) ? new Date(parseInt(s)) : new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function getWindowStart(period) {
  const now = new Date()
  if (period === 'day')       return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (period === 'week') {
    const d = new Date(now)
    d.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    d.setHours(0, 0, 0, 0)
    return d
  }
  if (period === 'lastmonth') return new Date(now.getFullYear(), now.getMonth() - 1, 1)
  if (period === 'ytd')       return new Date(now.getFullYear(), 0, 1)
  return new Date(now.getFullYear(), now.getMonth(), 1) // month
}

function getWindowEnd(period) {
  const now = new Date()
  if (period === 'lastmonth') return new Date(now.getFullYear(), now.getMonth(), 1)
  return null
}

function filterByPeriod(items, period, field = 'hs_timestamp') {
  const start = getWindowStart(period)
  const end   = getWindowEnd(period)
  return items.filter(item => {
    const d = parseTs(item.properties?.[field])
    return d && d >= start && (!end || d < end)
  })
}

function countWorkdays(start, end) {
  let count = 0
  const d = new Date(start)
  while (d < end) {
    const day = d.getDay()
    if (day !== 0 && day !== 6) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

function getDynamicTargets(period) {
  if (CALL_TARGETS[period]) return { calls: CALL_TARGETS[period], meetings: MEETING_TARGETS[period] }
  const now = new Date()
  if (period === 'lastmonth') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end   = new Date(now.getFullYear(), now.getMonth(), 1)
    const wd = countWorkdays(start, end)
    return { calls: wd * CALL_TARGET_PER_DAY, meetings: wd * MEETING_TARGET_PER_DAY }
  }
  if (period === 'ytd') {
    const start = new Date(now.getFullYear(), 0, 1)
    const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const wd = countWorkdays(start, end)
    return { calls: wd * CALL_TARGET_PER_DAY, meetings: wd * MEETING_TARGET_PER_DAY }
  }
  return { calls: 0, meetings: 0 }
}

function getPeriodLabel(period) {
  const now = new Date()
  if (period === 'day')       return 'Today'
  if (period === 'week')      return 'This Week'
  if (period === 'month')     return 'This Month'
  if (period === 'lastmonth') return new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleString('en-US', { month: 'long' })
  if (period === 'ytd')       return `YTD ${now.getFullYear()}`
  return period
}

function fmtDuration(ms) {
  if (!ms || ms === 0) return '—'
  const secs = Math.floor(Number(ms) / 1000)
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

function fmtMeetingTime(ts) {
  const d = parseTs(ts)
  if (!d) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function buildTrendData(calls, period) {
  const now   = new Date()
  const start = getWindowStart(period)
  const end   = getWindowEnd(period)

  if (period === 'day') {
    const hours = Array.from({ length: 24 }, (_, h) => ({
      label: h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`,
      total: 0, connected: 0,
    }))
    for (const call of calls) {
      const d = parseTs(call.properties?.hs_timestamp)
      if (!d || d < start) continue
      hours[d.getHours()].total++
      if (isConnected(call.properties?.hs_call_status)) hours[d.getHours()].connected++
    }
    return hours
  }

  if (period === 'week') {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const map = Object.fromEntries(days.map(d => [d, { total: 0, connected: 0 }]))
    for (const call of calls) {
      const d = parseTs(call.properties?.hs_timestamp)
      if (!d || d < start) continue
      const key = days[(d.getDay() + 6) % 7]
      map[key].total++
      if (isConnected(call.properties?.hs_call_status)) map[key].connected++
    }
    return days.map(d => ({ label: d, ...map[d] }))
  }

  if (period === 'lastmonth') {
    const yr = start.getFullYear()
    const mo = start.getMonth()
    const daysInMonth = new Date(yr, mo + 1, 0).getDate()
    const map = Object.fromEntries(Array.from({ length: daysInMonth }, (_, i) => [i + 1, { total: 0, connected: 0 }]))
    for (const call of calls) {
      const d = parseTs(call.properties?.hs_timestamp)
      if (!d || d < start || (end && d >= end)) continue
      map[d.getDate()].total++
      if (isConnected(call.properties?.hs_call_status)) map[d.getDate()].connected++
    }
    return Array.from({ length: daysInMonth }, (_, i) => ({ label: String(i + 1), ...map[i + 1] }))
  }

  if (period === 'ytd') {
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const currentMonth = now.getMonth()
    const yr = now.getFullYear()
    const map = Object.fromEntries(MONTHS.slice(0, currentMonth + 1).map(m => [m, { total: 0, connected: 0 }]))
    for (const call of calls) {
      const d = parseTs(call.properties?.hs_timestamp)
      if (!d || d < start || d.getFullYear() !== yr) continue
      const key = MONTHS[d.getMonth()]
      if (map[key]) {
        map[key].total++
        if (isConnected(call.properties?.hs_call_status)) map[key].connected++
      }
    }
    return MONTHS.slice(0, currentMonth + 1).map(m => ({ label: m, ...map[m] }))
  }

  // month (current)
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const map = Object.fromEntries(Array.from({ length: daysInMonth }, (_, i) => [i + 1, { total: 0, connected: 0 }]))
  for (const call of calls) {
    const d = parseTs(call.properties?.hs_timestamp)
    if (!d || d < start) continue
    map[d.getDate()].total++
    if (isConnected(call.properties?.hs_call_status)) map[d.getDate()].connected++
  }
  return Array.from({ length: daysInMonth }, (_, i) => ({ label: String(i + 1), ...map[i + 1] }))
}

function trendSubLabel(period) {
  const now = new Date()
  if (period === 'day')       return 'By hour · today'
  if (period === 'week')      return 'By day · this week'
  if (period === 'month')     return 'By day · this month'
  if (period === 'lastmonth') return `By day · ${new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleString('en-US', { month: 'long' })}`
  if (period === 'ytd')       return `By month · ${now.getFullYear()}`
  return ''
}

// --- Sub-components ---

function PeriodToggle({ period, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 3, background: 'var(--light-gray)', borderRadius: 8, padding: 3 }}>
      {[['day','Today'],['week','This Week'],['month','This Month'],['lastmonth','Last Month'],['ytd','YTD']].map(([key, label]) => (
        <button key={key} onClick={() => onChange(key)} style={{
          padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
          fontSize: 12, fontWeight: period === key ? 600 : 400,
          background: period === key ? 'var(--white)' : 'transparent',
          color: period === key ? 'var(--text-primary)' : 'var(--text-secondary)',
          boxShadow: period === key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          transition: 'all 0.15s',
          whiteSpace: 'nowrap',
        }}>{label}</button>
      ))}
    </div>
  )
}

function ProgressKpiCard({ color, label, value, target, sub }) {
  const pct = Math.min(Math.round((value / target) * 100), 100)
  const over = value >= target
  return (
    <div className={`kpi-card ${color}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {value.toLocaleString()}
        <span style={{ fontSize: 13, fontWeight: 400, opacity: 0.7 }}> / {target.toLocaleString()}</span>
      </div>
      <div style={{ margin: '8px 0 4px', background: 'rgba(0,0,0,0.12)', borderRadius: 4, height: 5, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: over ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.6)', borderRadius: 4, transition: 'width 0.4s' }} />
      </div>
      <div className="kpi-sub">{pct}% of target · {sub}</div>
    </div>
  )
}

function TrendChart({ data, period }) {
  const maxTotal = Math.max(...data.map(d => d.total), 1)
  const BAR_H  = 110
  const compact = period === 'month' || period === 'lastmonth'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: compact ? 2 : 6, height: BAR_H + 36 }}>
        {data.map((item, i) => {
          const totalH = Math.max((item.total / maxTotal) * BAR_H, item.total > 0 ? 3 : 0)
          const connH  = item.connected > 0 ? Math.max((item.connected / maxTotal) * BAR_H, 3) : 0
          const showLabel = !compact || i % 5 === 0 || i === data.length - 1
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              {item.total > 0 && (
                <div style={{ fontSize: compact ? 8 : 9, color: 'var(--text-muted)', fontFamily: "'DM Mono', monospace" }}>
                  {item.total}
                </div>
              )}
              <div style={{ width: '100%', height: BAR_H, display: 'flex', alignItems: 'flex-end', position: 'relative' }}>
                <div style={{ position: 'absolute', bottom: 0, width: '100%', height: Math.max(totalH, 1), background: 'var(--light-gray)', borderRadius: '3px 3px 0 0' }} />
                {connH > 0 && (
                  <div style={{ position: 'absolute', bottom: 0, width: '100%', height: connH, background: 'var(--success)', borderRadius: '3px 3px 0 0', opacity: 0.85 }} />
                )}
              </div>
              <div style={{ fontSize: compact ? 8 : 10, color: 'var(--text-secondary)', textAlign: 'center', whiteSpace: 'nowrap', visibility: showLabel ? 'visible' : 'hidden' }}>
                {item.label}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 11, color: 'var(--text-secondary)' }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--success)', borderRadius: 2, marginRight: 4, opacity: 0.85 }} />Connected</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--light-gray)', borderRadius: 2, marginRight: 4, border: '1px solid var(--border)' }} />Total dials</span>
      </div>
    </div>
  )
}

function OutcomeBar({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', width: 140, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, background: 'var(--light-gray)', borderRadius: 3, height: 20, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(pct, 2)}%`, height: '100%', background: color || 'var(--accent)', borderRadius: 3, display: 'flex', alignItems: 'center', padding: '0 8px' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'white', fontFamily: "'DM Mono', monospace" }}>{count}</span>
        </div>
      </div>
      <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: 'var(--text-muted)', width: 36 }}>{pct}%</div>
    </div>
  )
}

function renderInsightMd(text) {
  return text.split('\n').map((line, i) => {
    if (!line.trim()) return <div key={i} style={{ height: 5 }} />
    const parts = line.split(/\*\*([^*]+)\*\*/)
    return (
      <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
        {parts.map((p, j) => j % 2 === 1 ? <strong key={j} style={{ color: 'var(--text-primary)' }}>{p}</strong> : p)}
      </div>
    )
  })
}

function SdrInsights({ calls, meetings, period }) {
  const [state, setState] = useState('idle')
  const [insights, setInsights] = useState('')
  const loadedRef = useRef(false)

  async function load() {
    setState('loading')
    try {
      const res = await fetch('/api/sdr-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calls, meetings, period }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setInsights(data.insights || '')
      setState('loaded')
    } catch (e) {
      setInsights(e.message)
      setState('error')
    }
  }

  useEffect(() => {
    if (loadedRef.current || !calls || calls.length === 0) return
    loadedRef.current = true
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!calls || calls.length === 0) return null

  return (
    <div className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="panel-title">✦ Coaching Insights</div>
          <div className="panel-sub">{state === 'loading' ? "Claude is analyzing Caleb's activity…" : 'AI coaching analysis for Ryan'}</div>
        </div>
        {state === 'loaded' && (
          <button onClick={() => { loadedRef.current = true; load() }} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)', flexShrink: 0 }}>
            ↻ Regenerate
          </button>
        )}
      </div>
      <div style={{ padding: '16px 20px' }}>
        {state === 'loading' && <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 13 }}><div className="spinner" /> Analyzing activity…</div>}
        {state === 'loaded' && renderInsightMd(insights)}
        {state === 'error' && <div style={{ color: 'var(--danger)', fontSize: 13 }}>Error: {insights} · <button onClick={() => { loadedRef.current = true; load() }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontSize: 13 }}>Retry</button></div>}
      </div>
    </div>
  )
}

function MeetingRow({ m, expanded, onToggle }) {
  const p = m.properties || {}
  const outcome = p.hs_meeting_outcome
  const label   = MEETING_OUTCOME_LABELS[outcome] || outcome || 'Scheduled'
  const color   = MEETING_OUTCOME_COLORS[outcome] || 'var(--text-muted)'
  const url     = p.contact_id ? `${HS_BASE}/0-1/${p.contact_id}` : null

  const startD    = parseTs(p.hs_timestamp)
  const endD      = parseTs(p.hs_meeting_end_time)
  const durationMs = startD && endD ? endD - startD : 0

  return (
    <>
      <tr onClick={onToggle} style={{ cursor: 'pointer', background: expanded ? 'var(--off-white)' : undefined }}>
        <td>
          {url
            ? <a className="deal-link" href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>{p.contact_name || 'Unknown'}</a>
            : <span style={{ color: 'var(--text-muted)' }}>{p.contact_name || 'Unknown'}</span>}
        </td>
        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.hs_meeting_title || '—'}</td>
        <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtMeetingTime(p.hs_timestamp)}</td>
        <td><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: `${color}20`, color }}>{label}</span></td>
        <td style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', width: 28 }}>{expanded ? '▲' : '▼'}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} style={{ padding: '14px 20px 16px', background: 'var(--off-white)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px 24px' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 4 }}>MEETING TYPE</div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{p.hs_meeting_type || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 4 }}>DURATION</div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: "'DM Mono', monospace" }}>{durationMs > 0 ? fmtDuration(durationMs) : '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 4 }}>CONTACT</div>
                <div style={{ fontSize: 13 }}>
                  {url
                    ? <a href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Open in HubSpot →</a>
                    : <span style={{ color: 'var(--text-muted)' }}>No contact linked</span>}
                </div>
              </div>
              {p.hs_meeting_body && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 6 }}>NOTES</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.65, whiteSpace: 'pre-wrap', maxHeight: 120, overflowY: 'auto', padding: '8px 12px', background: 'var(--white)', borderRadius: 6, border: '1px solid var(--border)' }}>{p.hs_meeting_body}</div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// --- Main ---
export default function SdrActivities({ data, loading }) {
  if (loading && !data) return <div className="state-box">Loading SDR data…</div>
  if (!data) return null

  const [period, setPeriod]               = useState('week')
  const [expandedMeeting, setExpanded]    = useState(null)

  const calls    = data.calls    || []
  const meetings = data.meetings || []

  const periodCalls    = useMemo(() => filterByPeriod(calls,    period), [calls,    period])
  const periodMeetings = useMemo(() => filterByPeriod(meetings, period), [meetings, period])
  const trendData      = useMemo(() => buildTrendData(calls,    period), [calls,    period])

  const targets = useMemo(() => getDynamicTargets(period), [period])

  const outcomes = useMemo(() => {
    const map = {}
    for (const c of periodCalls) { const s = c.properties?.hs_call_status || 'UNKNOWN'; map[s] = (map[s] || 0) + 1 }
    return map
  }, [periodCalls])

  const connected   = (outcomes.CONNECTED || 0) + (outcomes.COMPLETED || 0)
  const connectRate = periodCalls.length > 0 ? Math.round((connected / periodCalls.length) * 100) : 0

  const avgDurationMs = useMemo(() => {
    const connCalls = periodCalls.filter(c => isConnected(c.properties?.hs_call_status) && c.properties?.hs_call_duration)
    if (!connCalls.length) return 0
    return connCalls.reduce((s, c) => s + Number(c.properties.hs_call_duration), 0) / connCalls.length
  }, [periodCalls])

  const meetingOutcomes = useMemo(() => {
    const map = {}
    for (const m of meetings) { const o = m.properties?.hs_meeting_outcome || 'SCHEDULED'; map[o] = (map[o] || 0) + 1 }
    return map
  }, [meetings])

  const periodLabel = getPeriodLabel(period)

  function toggleRow(id) { setExpanded(prev => prev === id ? null : id) }

  return (
    <>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Caleb Wilton — SDR Activity</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{calls.length} calls loaded · last 90 days · {meetings.length} SDR appointments (90 days)</div>
          </div>
        </div>
        <PeriodToggle period={period} onChange={p => { setPeriod(p); setExpanded(null) }} />
      </div>

      {/* KPI Cards */}
      <div className="kpi-row">
        <ProgressKpiCard color="blue"   label={`Calls — ${periodLabel}`}    value={periodCalls.length}    target={targets.calls}    sub={`${targets.calls.toLocaleString()} call target`} />
        <div className="kpi-card green">
          <div className="kpi-label">Connect Rate</div>
          <div className="kpi-value">{connectRate}%</div>
          <div className="kpi-sub">{connected} connected · {periodCalls.length} dials</div>
        </div>
        <ProgressKpiCard color="purple" label={`Meetings — ${periodLabel}`}  value={periodMeetings.length} target={targets.meetings} sub={`${targets.meetings.toLocaleString()} appt target`} />
        <div className="kpi-card orange">
          <div className="kpi-label">Avg Talk Time</div>
          <div className="kpi-value">{fmtDuration(avgDurationMs)}</div>
          <div className="kpi-sub">Connected calls only</div>
        </div>
      </div>

      {/* Trend chart */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Call Activity Trend</div>
            <div className="panel-sub">{trendSubLabel(period)}</div>
          </div>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <TrendChart data={trendData} period={period} />
        </div>
      </div>

      {/* Outcome breakdowns */}
      <div className="grid-2">
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Call Outcomes</div>
              <div className="panel-sub">{periodLabel} · {periodCalls.length} calls</div>
            </div>
          </div>
          <div style={{ padding: '16px 20px' }}>
            {periodCalls.length === 0
              ? <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '24px 0' }}>No calls in this period</div>
              : Object.entries(outcomes).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
                  <OutcomeBar key={s} label={OUTCOME_LABELS[s] || s} count={n} total={periodCalls.length} color={OUTCOME_COLORS[s]} />
                ))
            }
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Appointment Outcomes</div>
              <div className="panel-sub">SDR → Sales · {meetings.length} total (90 days)</div>
            </div>
          </div>
          <div style={{ padding: '16px 20px' }}>
            {meetings.length === 0
              ? <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '24px 0' }}>No appointments found</div>
              : Object.entries(meetingOutcomes).sort((a, b) => b[1] - a[1]).map(([o, n]) => (
                  <OutcomeBar key={o} label={MEETING_OUTCOME_LABELS[o] || o} count={n} total={meetings.length} color={MEETING_OUTCOME_COLORS[o]} />
                ))
            }
          </div>
        </div>
      </div>

      {/* Claude Coaching Insights */}
      <SdrInsights calls={calls} meetings={meetings} period={period} />

      {/* Appointments table */}
      {meetings.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">SDR → Sales Appointments</div>
              <div className="panel-sub">{meetings.length} appointments · last 90 days · click row to expand details</div>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Contact</th><th>Meeting</th><th>Scheduled</th><th>Outcome</th><th style={{ width: 28 }}></th></tr>
              </thead>
              <tbody>
                {meetings.map(m => (
                  <MeetingRow
                    key={m.id}
                    m={m}
                    expanded={expandedMeeting === m.id}
                    onToggle={() => toggleRow(m.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
