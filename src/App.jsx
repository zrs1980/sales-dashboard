import { useState, useEffect, useCallback } from 'react'
import LoopPipeline from './tabs/LoopPipeline.jsx'
import CebaPipeline from './tabs/CebaPipeline.jsx'
import SdrActivities from './tabs/SdrActivities.jsx'
import LeadDashboard from './tabs/LeadDashboard.jsx'

const TABS = [
  { id: 'loop', label: 'Loop ERP Pipeline' },
  { id: 'ceba', label: 'CEBA Pipeline' },
  { id: 'sdr', label: 'SDR Activities' },
  { id: 'leads', label: 'Lead Dashboard' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('loop')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastRefreshed, setLastRefreshed] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/refresh')
      if (!res.ok) throw new Error(`Server error: ${res.status}`)
      const json = await res.json()
      setData(json)
      setLastRefreshed(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'short', month: 'long', day: 'numeric', year: 'numeric'
  })

  const lastRefreshedStr = lastRefreshed
    ? lastRefreshed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null

  return (
    <>
      <div className="header">
        <div className="header-left">
          <h1>Sales Command Center</h1>
          <p>Live data from HubSpot · Ryan McQuillan
            {lastRefreshedStr && <> · Last refreshed: {lastRefreshedStr}</>}
          </p>
        </div>
        <div className="header-right">
          <div className="header-date">{today}</div>
          <button className="refresh-btn" onClick={refresh} disabled={loading}>
            {loading
              ? <><div className="spinner" /> Refreshing…</>
              : '↻ Refresh'
            }
          </button>
        </div>
      </div>

      <div className="tabs">
        {TABS.map(t => (
          <div
            key={t.id}
            className={`tab${activeTab === t.id ? ' active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </div>
        ))}
      </div>

      {error && (
        <div className="content">
          <div className="state-box error">Error loading data: {error}</div>
        </div>
      )}

      {!error && !data && !loading && null}

      {(data || loading) && (
        <div className="content">
          {activeTab === 'loop' && <LoopPipeline data={data?.loop} loading={loading} />}
          {activeTab === 'ceba' && <CebaPipeline data={data?.ceba} loading={loading} />}
          {activeTab === 'sdr'  && <SdrActivities data={data?.sdr} loading={loading} />}
          {activeTab === 'leads' && <LeadDashboard data={data?.leads} loading={loading} />}
        </div>
      )}
    </>
  )
}
