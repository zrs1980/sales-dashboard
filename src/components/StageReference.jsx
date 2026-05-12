import { getStageBadgeClass } from '../utils.js'

const LOOP_STAGES = [
  { label: 'New Deal',        prob: '10%' },
  { label: 'Req. Analysis',   prob: '30%' },
  { label: 'Demo Booked',     prob: '40%' },
  { label: 'Demo Complete',   prob: '45%' },
  { label: "Add'l Education", prob: '70%' },
  { label: 'Negotiation',     prob: '80%' },
  { label: 'Closed Won',      prob: null  },
  { label: 'Closed Lost',     prob: null  },
]

const CEBA_STAGES = [
  { label: 'Req. Analysis',   prob: '30%' },
  { label: 'Demo Booked',     prob: '40%' },
  { label: 'Demo Complete',   prob: '45%' },
  { label: "Add'l Education", prob: '70%' },
  { label: 'Contract Sent',   prob: '90%' },
  { label: 'Closed Won',      prob: null  },
  { label: 'Closed Lost',     prob: null  },
]

export default function StageReference({ pipeline = 'loop' }) {
  const stages = pipeline === 'loop' ? LOOP_STAGES : CEBA_STAGES

  return (
    <div className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-header">
        <div>
          <div className="panel-title">Sales Cycle — Stage Reference</div>
          <div className="panel-sub">Stages in order · Close probability used for weighted value</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', gap: 0, flexWrap: 'wrap', rowGap: 10 }}>
        {stages.map((s, i) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span className={`badge ${getStageBadgeClass(s.label)}`}>{s.label}</span>
              <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: 'var(--text-muted)' }}>
                {s.prob ?? '—'}
              </span>
            </div>
            {i < stages.length - 1 && (
              <span style={{ color: 'var(--border)', fontSize: 16, margin: '0 6px', marginBottom: 14 }}>›</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
