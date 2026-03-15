export default function SdrActivities({ data, loading }) {
  if (loading && !data) return <div className="state-box">Loading SDR data…</div>
  if (!data) return null

  const total = data.total || 0
  const outcomes = data.outcomes || {}

  const outcomeLabels = {
    CONNECTED: 'Connected',
    LEFT_VOICEMAIL: 'Left Voicemail',
    LEFT_MESSAGE: 'Left Message',
    NO_ANSWER: 'No Answer',
    BUSY: 'Busy',
    WRONG_NUMBER: 'Wrong Number',
    UNKNOWN: 'Unknown / Other',
  }

  const outcomeSample = data.sample || 0
  const totalInSample = Object.values(outcomes).reduce((s, v) => s + v, 0)

  return (
    <>
      <div className="kpi-row">
        <div className="kpi-card blue">
          <div className="kpi-label">Total Calls (All Time)</div>
          <div className="kpi-value">{total.toLocaleString()}</div>
          <div className="kpi-sub">Caleb Wilton · All logged</div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-label">Daily Target</div>
          <div className="kpi-value">75</div>
          <div className="kpi-sub">Calls per day</div>
        </div>
        <div className="kpi-card orange">
          <div className="kpi-label">Weekly Appt Target</div>
          <div className="kpi-value">5</div>
          <div className="kpi-sub">SDR → Sales appointments</div>
        </div>
        <div className="kpi-card purple">
          <div className="kpi-label">Connect Rate</div>
          <div className="kpi-value">
            {totalInSample > 0 && outcomes.CONNECTED
              ? `${Math.round((outcomes.CONNECTED / totalInSample) * 100)}%`
              : '~11%'}
          </div>
          <div className="kpi-sub">Connected calls / total dials</div>
        </div>
      </div>

      {totalInSample > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">Call Outcome Breakdown</div>
            <div className="panel-sub">From most recent {outcomeSample} calls</div>
          </div>
          <div style={{ padding: '16px 20px' }}>
            {Object.entries(outcomes)
              .sort((a, b) => b[1] - a[1])
              .map(([status, count]) => {
                const pct = Math.round((count / totalInSample) * 100)
                const label = outcomeLabels[status] || status
                return (
                  <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', width: 160, flexShrink: 0 }}>{label}</div>
                    <div style={{ flex: 1, background: 'var(--light-gray)', borderRadius: 3, height: 20, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(pct, 3)}%`, height: '100%', background: 'var(--accent)', borderRadius: 3, display: 'flex', alignItems: 'center', padding: '0 8px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'white', fontFamily: "'DM Mono', monospace" }}>{count}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: 'var(--text-muted)', width: 36 }}>{pct}%</div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-header"><div className="panel-title">SDR Notes</div></div>
        <div style={{ padding: '16px 20px', fontSize: 13, color: 'var(--text-secondary)' }}>
          Full call activity and appointment logging is managed in HubSpot.
          Outcome breakdown above is sampled from the most recent 100 calls.
          For detailed daily reporting, open HubSpot → Activities → Calls → Filter by Caleb Wilton.
        </div>
      </div>
    </>
  )
}
