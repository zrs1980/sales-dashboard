import { useState } from 'react'
import {
  fmtCurrency, fmtDate, daysSince, daysUntil,
  getStageLabel, getStageBadgeClass, getStageProb,
  generateAlerts, extractNotionPageId
} from '../utils.js'
import NotionNotes from '../components/NotionNotes.jsx'
import AiReview from '../components/AiReview.jsx'

function RiskFlag({ days }) {
  if (days == null) return <span className="risk-flag">—</span>
  if (days >= 90) return <span className="risk-flag risk-red">🔴 {days}d</span>
  if (days >= 30) return <span className="risk-flag risk-orange">🟠 {days}d</span>
  return <span className="risk-flag risk-green">🟢 {days}d</span>
}

function CloseDate({ raw }) {
  if (!raw) return <span>—</span>
  const until = daysUntil(raw)
  const label = fmtDate(raw)
  if (until != null && until <= 30) {
    return <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{label} ⚠</span>
  }
  return <span>{label}</span>
}

function DealRow({ deal, stageMap }) {
  const p = deal.properties || {}
  const id = deal.id
  const name = p.dealname || 'Unnamed Deal'
  const amount = parseFloat(p.amount || 0)
  const stage = (stageMap && stageMap[p.dealstage]) || getStageLabel(p.dealstage)
  const badgeClass = getStageBadgeClass(stage)
  const prob = parseFloat(p.hs_deal_stage_probability || getStageProb(stage))
  const weighted = amount * prob
  const daysInStage = daysSince(p.hs_lastmodifieddate)
  const notes = p.num_notes != null ? `${p.num_notes} notes` : '—'
  const notionPageId = extractNotionPageId(p.notion_link)
  const hsUrl = `https://app-na2.hubspot.com/contacts/243159630/record/0-3/${id}`

  return (
    <tr>
      <td><a className="deal-link" href={hsUrl} target="_blank" rel="noreferrer">{name}</a></td>
      <td><span className={`badge ${badgeClass}`}>{stage}</span></td>
      <td style={{ fontFamily: "'DM Mono', monospace" }}>{fmtCurrency(amount)}</td>
      <td style={{ fontFamily: "'DM Mono', monospace" }}>{fmtCurrency(weighted)}</td>
      <td><CloseDate raw={p.closedate} /></td>
      <td><RiskFlag days={daysInStage} /></td>
      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDate(p.notes_last_updated) || '—'}</td>
      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{notes}</td>
      <td><NotionNotes pageId={notionPageId} notionLink={p.notion_link} /></td>
      <td><AiReview dealId={id} notionPageId={notionPageId} dealName={name} /></td>
    </tr>
  )
}

export default function LoopPipeline({ data, loading }) {
  if (loading && !data) return <div className="state-box">Loading Loop ERP pipeline…</div>
  if (!data) return null

  const stageMap = data.stages || {}

  // Build set of closed stage IDs from the live HubSpot stage map
  const closedStageIds = new Set(
    Object.entries(stageMap)
      .filter(([, label]) => /closed/i.test(label))
      .map(([id]) => id)
  )
  // Also cover hardcoded fallbacks in case stageMap is empty
  closedStageIds.add('2681276110')
  closedStageIds.add('2681276111')
  closedStageIds.add('closedwon')
  closedStageIds.add('closedlost')

  const deals = (data.deals || []).filter(d => !closedStageIds.has(d.properties?.dealstage))
  const total = deals.reduce((s, d) => s + parseFloat(d.properties?.amount || 0), 0)
  const weighted = deals.reduce((s, d) => {
    const amt = parseFloat(d.properties?.amount || 0)
    const prob = parseFloat(d.properties?.hs_deal_stage_probability || getStageProb(getStageLabel(d.properties?.dealstage)))
    return s + amt * prob
  }, 0)
  const avg = deals.length ? total / deals.length : 0
  const alerts = generateAlerts(deals)

  return (
    <>
      <div className="kpi-row">
        <div className="kpi-card blue">
          <div className="kpi-label">Total Pipeline</div>
          <div className="kpi-value">{fmtCurrency(total)}</div>
          <div className="kpi-sub">{deals.length} open deals</div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-label">Weighted Value</div>
          <div className="kpi-value">{fmtCurrency(weighted)}</div>
          <div className="kpi-sub">Probability-adjusted</div>
        </div>
        <div className="kpi-card red">
          <div className="kpi-label">Avg Deal Size</div>
          <div className="kpi-value">{fmtCurrency(avg)}</div>
          <div className="kpi-sub">Per open deal</div>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="priority-alert">
          <h3>⚡ Priority Alerts ({alerts.length})</h3>
          {alerts.map((a, i) => (
            <div key={i} className="priority-item">{a.text}</div>
          ))}
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Open Deals — Full Pipeline View</div>
            <div className="panel-sub">Click deal name to open in HubSpot · Notion notes load on demand</div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Deal Name</th>
                <th>Stage</th>
                <th>Amount</th>
                <th>Weighted</th>
                <th>Close Date</th>
                <th>Days in Stage</th>
                <th>Last Activity</th>
                <th>Notes</th>
                <th>Notion</th>
                <th>AI Review</th>
              </tr>
            </thead>
            <tbody>
              {deals.map(d => <DealRow key={d.id} deal={d} stageMap={stageMap} />)}
              {deals.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>No open deals found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
