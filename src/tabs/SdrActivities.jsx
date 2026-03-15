import { useState, useMemo, useEffect, useRef } from 'react'

// --- Constants ---
const CALL_TARGETS   = { day: 75, week: 375, month: 1500 }
const MEETING_TARGETS = { day: 1,  week: 5,  month: 20 }

const OUTCOME_LABELS = {
  CONNECTED: 'Connected', LEFT_VOICEMAIL: 'Left Voicemail',
  LEFT_MESSAGE: 'Left Message', NO_ANSWER: 'No Answer',
  BUSY: 'Busy', WRONG_NUMBER: 'Wrong Number',
}
const OUTCOME_COLORS = {
  CONNECTED: 'var(--success)', LEFT_VOICEMAIL: 'var(--accent)',
  LEFT_MESSAGE: 'var(--accent)', NO_ANSWER: 'var(--text-muted)',
  BUSY: 'var(--warning)', WRONG_NUMBER: 'var(--danger)',
}
const MEETING_OUTCOME_LABELS = {
  COMPLETED: 'Completed', NO_SHOW: 'No Show',
  CANCELLED: 'Cancelled', RESCHEDULED: 'Rescheduled', SCHEDULED: 'Scheduled',
}
const MEETING_OUTCOME_COLORS = {
  COMPLETED: 'var(--success)', NO_SHOW: 'var(--danger)',
  CANCELLED: 'var(--warning)', RESCHEDULED: 'var(--accent)', SCHEDULED: 'var(--text-muted)',
}

// --- Helpers ---
function parseTs(raw) {
  if (!raw) return null
  const s = String(raw)
  const d = /^\d+$/.test(s) ? new Date(parseInt(s)) : new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function getWindowStart(period) {
  const now = new Date()
  if (period === 'day') return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (period === 'week') {
    const d = new Date(now)
    d.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    d.setHours(0, 0, 0, 0)
    return d
  }
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

function filterByPeriod(items, period, field = 'hs_timestamp') {
  const start = getWindowStart(period)
  return items.filter(item => { const d = parseTs(item.properties?.[field]); return d && d >= start })
}

function fmtDuration(ms) {
  if (!ms || ms === 0) return '—'
  const secs = Math.floor(Number(ms) / 1000)
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

function fmtCallTime(ts) {
  const d = parseTs(ts)
  if (!d) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function buildTrendData(calls, period) {
  const now = new Date()
  const start = getWindowStart(period)

  if (period === 'day') {
    const hours = Array.from({ length: 24 }, (_, h) => ({
      label: h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`,
      total: 0, connected: 0,
    }))
    for (const call of calls) {
      const d = parseTs(call.properties?.hs_timestamp)
      if (!d || d < start) continue
      hours[d.getHours()].total++
      if (call.properties?.hs_call_status === 'CONNECTED') hours[d.getHours()].connected++
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
      if (call.properties?.hs_call_status === 'CONNECTED') map[key].connected++
    }
    return days.map(d => ({ label: d, ...map[d] }))
  }

  // month
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const map = Object.fromEntries(Array.from({ length: daysInMonth }, (_, i) => [i + 1, { total: 0, connected: 0 }]))
  for (const call of calls) {
    const d = parseTs(call.properties?.hs_timestamp)
    if (!d || d < start) continue
    map[d.getDate()].total++
    if (call.properties?.hs_call_status === 'CONNECTED') map[d.getDate()].connected++
  }
  return Array.from({ length: daysInMonth }, (_, i) => ({ label: String(i + 1), ...map[i + 1] }))
}

// --- Sub-components ---

function PeriodToggle({ period, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 3, background: 'var(--light-gray)', borderRadius: 8, padding: 3 }}>
      {[['day', 'Today'], ['week', 'This Week'], ['month', 'This Month']].map(([key, label]) => (
        <button key={key} onClick={() => onChange(key)} style={{
          padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: period === key ? 600 : 400,
          background: period === key ? 'var(--white)' : 'transparent',
          color: period === key ? 'var(--text-primary)' : 'var(--text-secondary)',
          boxShadow: period === key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          transition: 'all 0.15s',
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
        <span style={{ fontSize: 13, fontWeight: 400, opacity: 0.7 }}> / {target}</span>
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
  const BAR_H = 110
  const compact = period === 'month'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: compact ? 2 : 6, height: BAR_H + 36 }}>
        {data.map((item, i) => {
          const totalH = Math.max((item.total / maxTotal) * BAR_H, item.total > 0 ? 3 : 0)
          const connH = item.connected > 0 ? Math.max((item.connected / maxTotal) * BAR_H, 3) : 0
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
          <div className="panel-sub">{state === 'loading' ? 'Claude is analyzing Caleb\'s activity…' : 'AI coaching analysis for Ryan'}</div>
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

// --- Main ---
export default function SdrActivities({ data, loading }) {
  if (loading && !data) return <div className="state-box">Loading SDR data…</div>
  if (!data) return null

  const [period, setPeriod] = useState('week')

  const calls    = data.calls    || []
  const meetings = data.meetings || []

  const periodCalls    = useMemo(() => filterByPeriod(calls, period),    [calls, period])
  const periodMeetings = useMemo(() => filterByPeriod(meetings, period), [meetings, period])
  const trendData      = useMemo(() => buildTrendData(calls, period),    [calls, period])

  const outcomes = useMemo(() => {
    const map = {}
    for (const c of periodCalls) { const s = c.properties?.hs_call_status || 'UNKNOWN'; map[s] = (map[s] || 0) + 1 }
    return map
  }, [periodCalls])

  const connected    = outcomes.CONNECTED || 0
  const connectRate  = periodCalls.length > 0 ? Math.round((connected / periodCalls.length) * 100) : 0

  const avgDurationMs = useMemo(() => {
    const connCalls = periodCalls.filter(c => c.properties?.hs_call_status === 'CONNECTED' && c.properties?.hs_call_duration)
    if (!connCalls.length) return 0
    return connCalls.reduce((s, c) => s + Number(c.properties.hs_call_duration), 0) / connCalls.length
  }, [periodCalls])

  const meetingOutcomes = useMemo(() => {
    const map = {}
    for (const m of meetings) { const o = m.properties?.hs_meeting_outcome || 'SCHEDULED'; map[o] = (map[o] || 0) + 1 }
    return map
  }, [meetings])

  const periodLabel = { day: 'Today', week: 'This Week', month: 'This Month' }[period]
  const callTarget    = CALL_TARGETS[period]
  const meetingTarget = MEETING_TARGETS[period]

  const HS_BASE = 'https://app-na2.hubspot.com/contacts/243159630/record'

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Caleb Wilton — SDR Activity</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{calls.length} calls loaded · last 30 days · {meetings.length} SDR appointments (90 days)</div>
        </div>
        <PeriodToggle period={period} onChange={setPeriod} />
      </div>

      {/* KPI Cards */}
      <div className="kpi-row">
        <ProgressKpiCard color="blue"   label={`Calls — ${periodLabel}`}     value={periodCalls.length}    target={callTarget}    sub={`${callTarget} call target`} />
        <div className="kpi-card green">
          <div className="kpi-label">Connect Rate</div>
          <div className="kpi-value">{connectRate}%</div>
          <div className="kpi-sub">{connected} connected · {periodCalls.length} dials</div>
        </div>
        <ProgressKpiCard color="purple" label={`Meetings — ${periodLabel}`}   value={periodMeetings.length} target={meetingTarget} sub={`${meetingTarget} appt target`} />
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
            <div className="panel-sub">
              {period === 'day' ? 'By hour · today' : period === 'week' ? 'By day · this week' : 'By day · this month'}
            </div>
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
              <div className="panel-sub">{meetings.length} appointments · last 90 days</div>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Contact</th><th>Meeting</th><th>Scheduled</th><th>Outcome</th></tr>
              </thead>
              <tbody>
                {meetings.map(m => {
                  const p = m.properties || {}
                  const outcome = p.hs_meeting_outcome
                  const label = MEETING_OUTCOME_LABELS[outcome] || outcome || 'Scheduled'
                  const color = MEETING_OUTCOME_COLORS[outcome] || 'var(--text-muted)'
                  const url = p.contact_id ? `${HS_BASE}/0-1/${p.contact_id}` : null
                  return (
                    <tr key={m.id}>
                      <td>{url ? <a className="deal-link" href={url} target="_blank" rel="noreferrer">{p.contact_name || 'Unknown'}</a> : <span style={{ color: 'var(--text-muted)' }}>{p.contact_name || 'Unknown'}</span>}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.hs_meeting_title || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtCallTime(p.hs_timestamp)}</td>
                      <td><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: `${color}20`, color }}>{label}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Activity feed */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Call Activity Feed</div>
            <div className="panel-sub">{periodLabel} · {periodCalls.length} calls · showing most recent 50</div>
          </div>
        </div>
        {periodCalls.length === 0
          ? <div style={{ padding: '24px 20px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>No calls in this period</div>
          : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Contact</th><th>Outcome</th><th>Duration</th><th>Notes</th><th>Time</th></tr>
                </thead>
                <tbody>
                  {periodCalls.slice(0, 50).map(c => {
                    const p = c.properties || {}
                    const status = p.hs_call_status || 'UNKNOWN'
                    const statusColor = OUTCOME_COLORS[status] || 'var(--text-muted)'
                    const url = p.contact_id ? `${HS_BASE}/0-1/${p.contact_id}` : null
                    return (
                      <tr key={c.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {url
                            ? <a className="deal-link" href={url} target="_blank" rel="noreferrer">{p.contact_name || 'Unknown'}</a>
                            : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{p.contact_name || '—'}</span>
                          }
                        </td>
                        <td>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: `${statusColor}20`, color: statusColor, whiteSpace: 'nowrap' }}>
                            {OUTCOME_LABELS[status] || status}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: 'var(--text-secondary)' }}>{fmtDuration(p.hs_call_duration)}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 260 }}>
                          {p.hs_call_body
                            ? <span title={p.hs_call_body}>{p.hs_call_body.slice(0, 80)}{p.hs_call_body.length > 80 ? '…' : ''}</span>
                            : <span style={{ color: 'var(--text-muted)' }}>—</span>
                          }
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtCallTime(p.hs_timestamp)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </div>
    </>
  )
}
