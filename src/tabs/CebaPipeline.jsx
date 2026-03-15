import { useState } from 'react'
import {
  fmtCurrency, fmtDate, daysSince, daysUntil,
  getStageLabel, getStageBadgeClass, getStageProb,
  extractNotionPageId
} from '../utils.js'
import NotionNotes from '../components/NotionNotes.jsx'
import AiReview from '../components/AiReview.jsx'
import DealAnalytics from '../components/DealAnalytics.jsx'
import PipelineInsights from '../components/PipelineInsights.jsx'

function RiskFlag({ days }) {
  if (days == null) return <span className="risk-flag">—</span>
  if (days >= 90) return <span className="risk-flag risk-red">🔴 {days}d</span>
  if (days >= 30) return <span className="risk-flag risk-orange">🟠 {days}d</span>
  return <span className="risk-flag risk-green">🟢 {days}d</span>
}

function DealRow({ deal }) {
  const p = deal.properties || {}
  const id = deal.id
  const name = p.dealname || 'Unnamed Deal'
  const amount = parseFloat(p.amount || 0)
  const stage = getStageLabel(p.dealstage)
  const badgeClass = getStageBadgeClass(stage)
  const prob = parseFloat(p.hs_deal_stage_probability || getStageProb(stage))
  const weighted = amount * prob
  const daysInStage = daysSince(p.hs_lastmodifieddate)
  const notionPageId = extractNotionPageId(p.notion_link)
  const hsUrl = `https://app-na2.hubspot.com/contacts/243159630/record/0-3/${id}`
  const until = daysUntil(p.closedate)

  return (
    <tr>
      <td><a className="deal-link" href={hsUrl} target="_blank" rel="noreferrer">{name}</a></td>
      <td><span className={`badge ${badgeClass}`}>{stage}</span></td>
      <td style={{ fontFamily: "'DM Mono', monospace" }}>{fmtCurrency(amount)}</td>
      <td style={{ fontFamily: "'DM Mono', monospace" }}>{fmtCurrency(weighted)}</td>
      <td>
        {p.closedate
          ? <span style={until != null && until <= 30 ? { color: 'var(--danger)', fontWeight: 600 } : {}}>
              {fmtDate(p.closedate)}{until != null && until <= 30 ? ' ⚠' : ''}
            </span>
          : '—'}
      </td>
      <td><RiskFlag days={daysInStage} /></td>
      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDate(p.notes_last_updated) || '—'}</td>
      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.num_notes != null ? `${p.num_notes} notes` : '—'}</td>
      <td><NotionNotes pageId={notionPageId} notionLink={p.notion_link} /></td>
      <td><AiReview dealId={id} notionPageId={notionPageId} dealName={name} /></td>
    </tr>
  )
}

export default function CebaPipeline({ data, loading }) {
  if (loading && !data) return <div className="state-box">Loading CEBA pipeline…</div>
  if (!data) return null

  const stageMap = data.stages || {}

  const closedStageIds = new Set(
    Object.entries(stageMap)
      .filter(([, label]) => /closed/i.test(label))
      .map(([id]) => id)
  )
  closedStageIds.add('closedwon')
  closedStageIds.add('closedlost')

  const open = (data.open || []).filter(d => !closedStageIds.has(d.properties?.dealstage))
  const openVal = open.reduce((s, d) => s + parseFloat(d.properties?.amount || 0), 0)
  const [selectedStage, setSelectedStage] = useState(null)

  const visibleDeals = selectedStage
    ? open.filter(d => {
        const p = d.properties || {}
        const label = (stageMap && stageMap[p.dealstage]) || getStageLabel(p.dealstage)
        return label === selectedStage
      })
    : open

  return (
    <>
      <div className="kpi-row">
        <div className="kpi-card blue">
          <div className="kpi-label">Open Pipeline</div>
          <div className="kpi-value">{fmtCurrency(openVal)}</div>
          <div className="kpi-sub">{open.length} active deals</div>
        </div>
      </div>

      <DealAnalytics deals={open} stageMap={stageMap} selectedStage={selectedStage} onStageClick={setSelectedStage} />

      <PipelineInsights deals={open} stageMap={stageMap} pipeline="ceba" />

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">
              Open CEBA Deals
              {selectedStage && <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>· {selectedStage}</span>}
            </div>
            <div className="panel-sub">
              {selectedStage
                ? <>{visibleDeals.length} deal{visibleDeals.length !== 1 ? 's' : ''} · <button onClick={() => setSelectedStage(null)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontSize: 12 }}>Show all ×</button></>
                : 'Click deal name to open in HubSpot'
              }
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Deal Name</th><th>Stage</th><th>Amount</th><th>Weighted</th>
                <th>Close Date</th><th>Days in Stage</th><th>Last Activity</th>
                <th>Notes</th><th>Notion</th><th>AI Review</th>
              </tr>
            </thead>
            <tbody>
              {visibleDeals.map(d => <DealRow key={d.id} deal={d} />)}
              {visibleDeals.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>No open CEBA deals</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
