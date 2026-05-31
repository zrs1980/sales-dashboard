import { useState } from 'react'
import {
  fmtCurrency, fmtDate, daysSince, daysUntil,
  getStageLabel, getStageProb,
  extractNotionPageId
} from '../utils.js'
import NotionNotes from '../components/NotionNotes.jsx'
import DealAnalytics from '../components/DealAnalytics.jsx'
import PipelineInsights from '../components/PipelineInsights.jsx'
import { useSortState, sortDeals, SortTh, selectStyle } from '../components/TableSort.jsx'
import StageReference from '../components/StageReference.jsx'
import CreateTaskModal from '../components/CreateTaskModal.jsx'

const PORTAL_ID = '243159630'

const STAGE_ORDER = [
  'New Deal',
  'Requirements Analysis Booked',
  'Requirements Analysis Complete',
  'Deep Dive Demo Booked',
  'Deep Dive Demo Complete',
  'Proposal Review Scheduled',
  'Proposal Review Complete',
  'Additional Education & Alignment',
  'Negotiation',
]

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

function NextActivity({ date, subject, taskId, dealId }) {
  if (!date) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
  const until = daysUntil(date)
  const overdue = until != null && until < 0
  const soon = until != null && until <= 1
  const upcoming = until != null && until <= 7
  const color = overdue || soon ? 'var(--danger)' : upcoming ? 'var(--warning)' : 'inherit'
  const taskUrl = taskId && dealId
    ? `https://app-na2.hubspot.com/contacts/${PORTAL_ID}/record/0-3/${dealId}?taskId=${taskId}`
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 12, color, fontWeight: overdue || soon ? 600 : undefined }}>
        {fmtDate(date)}
      </span>
      {subject && taskUrl ? (
        <a
          href={taskUrl}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', lineHeight: 1.3 }}
        >
          {subject} ↗
        </a>
      ) : subject ? (
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.3 }}>{subject}</span>
      ) : null}
    </div>
  )
}

function DealRow({ deal, stageMap, onNewTask }) {
  const p = deal.properties || {}
  const id = deal.id
  const name = p.dealname || 'Unnamed Deal'
  const amount = parseFloat(p.amount || 0)
  const stage = (stageMap && stageMap[p.dealstage]) || getStageLabel(p.dealstage)
  const prob = parseFloat(p.hs_deal_stage_probability || getStageProb(stage))
  const weighted = amount * prob
  const daysInStage = daysSince(p.hs_lastmodifieddate)
  const notes = p.num_notes != null ? `${p.num_notes} notes` : '—'
  const notionPageId = extractNotionPageId(p.notion_link)
  const hsUrl = `https://app-na2.hubspot.com/contacts/243159630/record/0-3/${id}`

  return (
    <tr>
      <td><a className="deal-link" href={hsUrl} target="_blank" rel="noreferrer">{name}</a></td>
      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.company_country || '—'}</td>
      <td style={{ fontFamily: "'DM Mono', monospace" }}>{fmtCurrency(amount)}</td>
      <td style={{ fontFamily: "'DM Mono', monospace" }}>{fmtCurrency(weighted)}</td>
      <td><CloseDate raw={p.closedate} /></td>
      <td><RiskFlag days={daysInStage} /></td>
      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDate(p.notes_last_updated) || '—'}</td>
      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{notes}</td>
      <td>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <NextActivity date={p.hs_next_activity_date} subject={p.hs_next_activity_subject} taskId={p.hs_next_task_id} dealId={id} />
          <button
            onClick={() => onNewTask({ id, name })}
            style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', whiteSpace: 'nowrap', alignSelf: 'flex-start' }}
          >
            + Task
          </button>
        </div>
      </td>
      <td><NotionNotes pageId={notionPageId} notionLink={p.notion_link} dealId={id} dealName={name} /></td>
    </tr>
  )
}

export default function LoopPipeline({ data, loading }) {
  if (loading && !data) return <div className="state-box">Loading Loop ERP pipeline…</div>
  if (!data) return null

  const stageMap = data.stages || {}

  const closedStageIds = new Set(
    Object.entries(stageMap)
      .filter(([, label]) => /closed/i.test(label))
      .map(([id]) => id)
  )
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

  const [countryFilter, setCountryFilter] = useState('')
  const [collapsedStages, setCollapsedStages] = useState(new Set())
  const [sort, toggleSort] = useSortState()
  const [taskModal, setTaskModal] = useState(null) // { id, name }

  const filtered = deals.filter(d => {
    const p = d.properties || {}
    if (countryFilter) {
      const country = (p.company_country || '').trim().toLowerCase()
      if (countryFilter === 'us' && country !== 'united states') return false
      if (countryFilter === 'non-us' && country === 'united states') return false
    }
    return true
  })

  const sorted = sortDeals(filtered, sort.key, sort.dir, stageMap)

  const knownStages = new Set(STAGE_ORDER)
  const byStage = {}
  for (const d of sorted) {
    const p = d.properties || {}
    const stage = (stageMap && stageMap[p.dealstage]) || getStageLabel(p.dealstage)
    if (!byStage[stage]) byStage[stage] = []
    byStage[stage].push(d)
  }

  const stageGroups = [
    ...STAGE_ORDER.filter(s => byStage[s]).map(s => ({ stage: s, deals: byStage[s] })),
    ...Object.keys(byStage).filter(s => !knownStages.has(s)).map(s => ({ stage: s, deals: byStage[s] })),
  ]

  function toggleStage(stage) {
    setCollapsedStages(prev => {
      const next = new Set(prev)
      if (next.has(stage)) next.delete(stage)
      else next.add(stage)
      return next
    })
  }

  const allCollapsed = stageGroups.length > 0 && stageGroups.every(g => collapsedStages.has(g.stage))

  return (
    <>
      {taskModal && (
        <CreateTaskModal
          dealId={taskModal.id}
          dealName={taskModal.name}
          onClose={() => setTaskModal(null)}
        />
      )}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Open Deals — Loop ERP Pipeline</div>
            <div className="panel-sub">Click a stage row to collapse · Click deal name to open in HubSpot</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)} style={selectStyle}>
              <option value="">All Countries</option>
              <option value="us">US</option>
              <option value="non-us">Non-US</option>
            </select>
            {countryFilter && (
              <button
                onClick={() => setCountryFilter('')}
                style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                Clear ×
              </button>
            )}
            <button
              onClick={() => allCollapsed ? setCollapsedStages(new Set()) : setCollapsedStages(new Set(stageGroups.map(g => g.stage)))}
              style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}
            >
              {allCollapsed ? 'Expand all' : 'Collapse all'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {filtered.length === deals.length ? `${deals.length} deals` : `${filtered.length} of ${deals.length} deals`}
            </span>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <SortTh sortKey="dealname" sort={sort} onSort={toggleSort}>Deal Name</SortTh>
                <SortTh sortKey="country" sort={sort} onSort={toggleSort}>Country</SortTh>
                <SortTh sortKey="amount" sort={sort} onSort={toggleSort}>Amount</SortTh>
                <SortTh sortKey="weighted" sort={sort} onSort={toggleSort}>Weighted</SortTh>
                <SortTh sortKey="closedate" sort={sort} onSort={toggleSort}>Close Date</SortTh>
                <SortTh sortKey="daysInStage" sort={sort} onSort={toggleSort}>Days in Stage</SortTh>
                <SortTh sortKey="lastActivity" sort={sort} onSort={toggleSort}>Last Activity</SortTh>
                <SortTh sortKey="notes" sort={sort} onSort={toggleSort}>Notes</SortTh>
                <th>Next Activity</th>
                <th>Notion</th>
              </tr>
            </thead>
            {stageGroups.map(({ stage, deals: stageDeals }) => {
              const isCollapsed = collapsedStages.has(stage)
              const stageTotal = stageDeals.reduce((s, d) => s + parseFloat(d.properties?.amount || 0), 0)
              return (
                <tbody key={stage}>
                  <tr
                    onClick={() => toggleStage(stage)}
                    style={{ cursor: 'pointer', background: 'var(--off-white)', userSelect: 'none' }}
                  >
                    <td colSpan={10} style={{ padding: '8px 12px', fontWeight: 600, fontSize: 13, borderTop: '2px solid var(--border)' }}>
                      <span style={{ marginRight: 8, fontSize: 10, color: 'var(--text-muted)' }}>
                        {isCollapsed ? '▶' : '▼'}
                      </span>
                      {stage}
                      <span style={{ marginLeft: 12, fontWeight: 400, fontSize: 12, color: 'var(--text-muted)' }}>
                        {stageDeals.length} deal{stageDeals.length !== 1 ? 's' : ''} · {fmtCurrency(stageTotal)}
                      </span>
                    </td>
                  </tr>
                  {!isCollapsed && stageDeals.map(d => <DealRow key={d.id} deal={d} stageMap={stageMap} onNewTask={setTaskModal} />)}
                </tbody>
              )
            })}
            {stageGroups.length === 0 && (
              <tbody>
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                    No deals match the current filters
                  </td>
                </tr>
              </tbody>
            )}
          </table>
        </div>
      </div>

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

      <StageReference pipeline="loop" />

      <DealAnalytics
        deals={deals}
        stageMap={stageMap}
        selectedStage=""
        onStageClick={() => {}}
      />

      <PipelineInsights deals={deals} stageMap={stageMap} pipeline="loop" />
    </>
  )
}
