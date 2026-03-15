import { useState } from 'react'
import { getStageLabel, getStageProb } from '../utils.js'

export function useSortState() {
  const [sort, setSort] = useState({ key: null, dir: 'asc' })
  function toggle(key) {
    setSort(s => s.key === key
      ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' }
    )
  }
  return [sort, toggle]
}

function parseDate(raw) {
  if (!raw) return null
  const s = String(raw)
  const d = /^\d+$/.test(s) ? new Date(parseInt(s)) : new Date(s)
  return isNaN(d.getTime()) ? null : d
}

export function sortDeals(deals, key, dir, stageMap) {
  if (!key) return deals
  return [...deals].sort((a, b) => {
    const ap = a.properties || {}
    const bp = b.properties || {}

    const stageLabel = p => (stageMap && stageMap[p.dealstage]) || getStageLabel(p.dealstage)
    const prob = p => parseFloat(p.hs_deal_stage_probability || getStageProb(stageLabel(p)))

    let aVal, bVal

    if (key === 'dealname') {
      aVal = (ap.dealname || '').toLowerCase()
      bVal = (bp.dealname || '').toLowerCase()
    } else if (key === 'stage') {
      aVal = stageLabel(ap).toLowerCase()
      bVal = stageLabel(bp).toLowerCase()
    } else if (key === 'country') {
      aVal = (ap.company_country || '').toLowerCase()
      bVal = (bp.company_country || '').toLowerCase()
    } else if (key === 'amount') {
      aVal = parseFloat(ap.amount || 0)
      bVal = parseFloat(bp.amount || 0)
    } else if (key === 'weighted') {
      aVal = parseFloat(ap.amount || 0) * prob(ap)
      bVal = parseFloat(bp.amount || 0) * prob(bp)
    } else if (key === 'closedate') {
      aVal = parseDate(ap.closedate)?.getTime() ?? 0
      bVal = parseDate(bp.closedate)?.getTime() ?? 0
    } else if (key === 'daysInStage') {
      // ascending = fewest days (most recently modified) first → descending date
      const aDate = parseDate(ap.hs_lastmodifieddate)?.getTime() ?? 0
      const bDate = parseDate(bp.hs_lastmodifieddate)?.getTime() ?? 0
      return dir === 'asc' ? bDate - aDate : aDate - bDate
    } else if (key === 'lastActivity') {
      aVal = parseDate(ap.notes_last_updated)?.getTime() ?? 0
      bVal = parseDate(bp.notes_last_updated)?.getTime() ?? 0
    } else if (key === 'notes') {
      aVal = parseInt(ap.num_notes || 0)
      bVal = parseInt(bp.num_notes || 0)
    } else {
      return 0
    }

    if (typeof aVal === 'string') {
      const cmp = aVal.localeCompare(bVal)
      return dir === 'asc' ? cmp : -cmp
    }
    return dir === 'asc' ? aVal - bVal : bVal - aVal
  })
}

export function SortTh({ children, sortKey, sort, onSort, style }) {
  const active = sort.key === sortKey
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...style }}
    >
      {children}{' '}
      <span style={{ fontSize: 9, color: active ? 'var(--accent)' : 'var(--border)' }}>
        {active ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}
      </span>
    </th>
  )
}

const selectStyle = {
  fontSize: 12, padding: '4px 8px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--white)',
  color: 'var(--text-primary)', cursor: 'pointer',
}

export function FilterBar({ children, count, total, onClear, hasFilters }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      padding: '10px 20px', borderBottom: '1px solid var(--border)',
      background: 'var(--off-white)',
    }}>
      {children}
      {hasFilters && (
        <button
          onClick={onClear}
          style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
        >
          Clear ×
        </button>
      )}
      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
        {count === total ? `${total} deal${total !== 1 ? 's' : ''}` : `${count} of ${total} deals`}
      </span>
    </div>
  )
}

export { selectStyle }
