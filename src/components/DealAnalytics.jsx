import { useMemo } from 'react'
import { fmtCurrency, getStageLabel } from '../utils.js'

const STAGE_COLORS = {
  'New Deal':        'var(--text-muted)',
  'Req. Analysis':   'var(--success)',
  'Demo Booked':     'var(--accent)',
  'Demo Complete':   'var(--accent)',
  "Add'l Education": 'var(--warning)',
  'Negotiation':     'var(--warning)',
  'Contract Sent':   'var(--purple)',
}

function StageBar({ label, count, value, maxCount, selected, dimmed, onClick }) {
  const pct = maxCount > 0 ? Math.max((count / maxCount) * 100, 4) : 4
  const color = STAGE_COLORS[label] || 'var(--accent)'
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9,
        cursor: 'pointer',
        opacity: dimmed ? 0.3 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      <div style={{ width: 120, fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0, textAlign: 'right', lineHeight: 1.3 }}>
        {label}
      </div>
      <div style={{
        flex: 1, background: 'var(--light-gray)', borderRadius: 4, height: 22, overflow: 'hidden',
        outline: selected ? `2px solid ${color}` : '2px solid transparent',
        outlineOffset: 1,
        transition: 'outline 0.1s',
      }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, display: 'flex', alignItems: 'center', paddingLeft: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'white', fontFamily: "'DM Mono', monospace", whiteSpace: 'nowrap' }}>
            {count} {count === 1 ? 'deal' : 'deals'}
          </span>
        </div>
      </div>
      <div style={{ width: 84, fontSize: 11, fontFamily: "'DM Mono', monospace", color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0 }}>
        {fmtCurrency(value)}
      </div>
    </div>
  )
}

function MonthChart({ months }) {
  const maxValue = Math.max(...months.map(m => m.value), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 180 }}>
      {months.map(({ label, count, value }) => {
        const barPct = Math.max((value / maxValue) * 130, count > 0 ? 6 : 0)
        return (
          <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            {count > 0 && (
              <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.2 }}>
                {fmtCurrency(value)}
              </div>
            )}
            <div style={{ width: '100%', height: 130, display: 'flex', alignItems: 'flex-end' }}>
              <div style={{
                width: '100%',
                height: barPct,
                background: count > 0 ? 'var(--accent)' : 'var(--light-gray)',
                borderRadius: '3px 3px 0 0',
                opacity: count > 0 ? 1 : 0.4,
              }} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', textAlign: 'center', whiteSpace: 'nowrap' }}>{label}</div>
            {count > 0 && (
              <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: 'var(--text-muted)' }}>
                {count}d
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function DealAnalytics({ deals, stageMap, selectedStage, onStageClick }) {
  const { byStage, byMonth } = useMemo(() => {
    // --- By stage ---
    const stageGroups = {}
    for (const deal of deals) {
      const p = deal.properties || {}
      const label = (stageMap && stageMap[p.dealstage]) || getStageLabel(p.dealstage)
      const value = parseFloat(p.amount || 0)
      if (!stageGroups[label]) stageGroups[label] = { count: 0, value: 0 }
      stageGroups[label].count++
      stageGroups[label].value += value
    }
    const byStage = Object.entries(stageGroups)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([label, d]) => ({ label, ...d }))

    // --- By close month ---
    const monthMap = {}
    for (const deal of deals) {
      const raw = deal.properties?.closedate
      if (!raw) continue
      const s = String(raw)
      const d = /^\d+$/.test(s) ? new Date(parseInt(s)) : new Date(s)
      if (isNaN(d.getTime())) continue
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      const value = parseFloat(deal.properties?.amount || 0)
      if (!monthMap[key]) monthMap[key] = { count: 0, value: 0 }
      monthMap[key].count++
      monthMap[key].value += value
    }

    // Span from earliest to latest close month found in data
    const keys = Object.keys(monthMap).sort()
    let byMonth = []
    if (keys.length > 0) {
      const [startY, startM] = keys[0].split('-').map(Number)
      const [endY, endM] = keys[keys.length - 1].split('-').map(Number)
      const cursor = new Date(Date.UTC(startY, startM - 1, 1))
      const end = new Date(Date.UTC(endY, endM - 1, 1))
      while (cursor <= end) {
        const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`
        const label = cursor.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
        byMonth.push({ key, label, ...(monthMap[key] || { count: 0, value: 0 }) })
        cursor.setUTCMonth(cursor.getUTCMonth() + 1)
      }
    }

    return { byStage, byMonth }
  }, [deals, stageMap])

  if (!deals.length) return null

  const maxCount = Math.max(...byStage.map(s => s.count), 1)

  return (
    <div className="grid-2">
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Deals by Stage</div>
            <div className="panel-sub">
              {selectedStage
                ? <>Filtered: <strong>{selectedStage}</strong> · <button onClick={() => onStageClick(null)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontSize: 12 }}>Clear ×</button></>
                : `${deals.length} open deal${deals.length !== 1 ? 's' : ''} · click a stage to filter`
              }
            </div>
          </div>
        </div>
        <div style={{ padding: '16px 20px' }}>
          {byStage.map(s => (
            <StageBar
              key={s.label}
              label={s.label}
              count={s.count}
              value={s.value}
              maxCount={maxCount}
              selected={selectedStage === s.label}
              dimmed={selectedStage !== null && selectedStage !== s.label}
              onClick={() => onStageClick(selectedStage === s.label ? null : s.label)}
            />
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Deals by Close Month</div>
            <div className="panel-sub">Pipeline value by expected close date</div>
          </div>
        </div>
        <div style={{ padding: '16px 20px' }}>
          {byMonth.length > 0
            ? <MonthChart months={byMonth} />
            : <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '32px 0', textAlign: 'center' }}>No close dates set</div>
          }
        </div>
      </div>
    </div>
  )
}
