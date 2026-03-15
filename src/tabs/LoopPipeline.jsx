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
import { useSortState, sortDeals, SortTh, FilterBar, selectStyle } from '../components/TableSort.jsx'

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
      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.company_country || '—'}</td>
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

  // Filters — stageFilter is shared with the DealAnalytics chart click
  const [stageFilter, setStageFilter] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [sort, toggleSort] = useSortState()

  const stageOptions = [...new Set(deals.map(d => {
    const p = d.properties || {}
    return (stageMap && stageMap[p.dealstage]) || getStageLabel(p.dealstage)
  }))].sort()

  const filtered = deals.filter(d => {
    const p = d.properties || {}
    if (stageFilter) {
      const label = (stageMap && stageMap[p.dealstage]) || getStageLabel(p.dealstage)
      if (label !== stageFilter) return false
    }
    if (countryFilter) {
      const country = (p.company_country || '').trim().toLowerCase()
      if (countryFilter === 'us' && country !== 'united states') return false
      if (countryFilter === 'non-us' && country === 'united states') return false
    }
    return true
  })

  const visibleDeals = sortDeals(filtered, sort.key, sort.dir, stageMap)

  function clearFilters() {
    setStageFilter('')
    setCountryFilter('')
  }

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

      <DealAnalytics
        deals={deals}
        stageMap={stageMap}
        selectedStage={stageFilter}
        onStageClick={s => { setStageFilter(s || ''); setCountryFilter('') }}
      />

      <PipelineInsights deals={deals} stageMap={stageMap} pipeline="loop" />

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Open Deals — Full Pipeline View</div>
            <div className="panel-sub">Click column headers to sort · Click deal name to open in HubSpot</div>
          </div>
        </div>

        <FilterBar
          count={visibleDeals.length}
          total={deals.length}
          hasFilters={!!(stageFilter || countryFilter)}
          onClear={clearFilters}
        >
          <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} style={selectStyle}>
            <option value="">All Stages</option>
            {stageOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)} style={selectStyle}>
            <option value="">All Countries</option>
            <option value="us">US</option>
            <option value="non-us">Non-US</option>
          </select>
        </FilterBar>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <SortTh sortKey="dealname" sort={sort} onSort={toggleSort}>Deal Name</SortTh>
                <SortTh sortKey="stage" sort={sort} onSort={toggleSort}>Stage</SortTh>
                <SortTh sortKey="country" sort={sort} onSort={toggleSort}>Country</SortTh>
                <SortTh sortKey="amount" sort={sort} onSort={toggleSort}>Amount</SortTh>
                <SortTh sortKey="weighted" sort={sort} onSort={toggleSort}>Weighted</SortTh>
                <SortTh sortKey="closedate" sort={sort} onSort={toggleSort}>Close Date</SortTh>
                <SortTh sortKey="daysInStage" sort={sort} onSort={toggleSort}>Days in Stage</SortTh>
                <SortTh sortKey="lastActivity" sort={sort} onSort={toggleSort}>Last Activity</SortTh>
                <SortTh sortKey="notes" sort={sort} onSort={toggleSort}>Notes</SortTh>
                <th>Notion</th>
                <th>AI Review</th>
              </tr>
            </thead>
            <tbody>
              {visibleDeals.map(d => <DealRow key={d.id} deal={d} stageMap={stageMap} />)}
              {visibleDeals.length === 0 && (
                <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>No deals match the current filters</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
