import { useState, useEffect, useCallback } from 'react'
import LoopPipeline from './tabs/LoopPipeline.jsx'
import CebaPipeline from './tabs/CebaPipeline.jsx'
import CebaServicesPipeline from './tabs/CebaServicesPipeline.jsx'
import SdrActivities from './tabs/SdrActivities.jsx'
import SalesMeetings from './tabs/SalesMeetings.jsx'
import LeadDashboard from './tabs/LeadDashboard.jsx'
import MyTasks from './tabs/MyTasks.jsx'
import TaskExports from './tabs/TaskExports.jsx'
import NoteExports from './tabs/NoteExports.jsx'
import MeetingExports from './tabs/MeetingExports.jsx'
import CallExports from './tabs/CallExports.jsx'
import EmailExports from './tabs/EmailExports.jsx'
import CommunicationExports from './tabs/CommunicationExports.jsx'

const TABS = [
  { id: 'loop',     label: 'Loop ERP Pipeline' },
  { id: 'ceba',     label: 'CEBA Pipeline' },
  { id: 'cebaServices', label: 'CEBA Services' },
  { id: 'sdr',      label: 'SDR Activities' },
  { id: 'meetings', label: 'Sales Meetings' },
  { id: 'leads',    label: 'Lead Dashboard' },
  { id: 'tasks',    label: 'My Tasks' },
  { id: 'taskExports', label: 'Task Exports' },
  { id: 'notes',    label: 'Notes' },
  { id: 'meetingExports', label: 'Meetings' },
  { id: 'callExports', label: 'Calls' },
  { id: 'emailExportsPre', label: 'Emails (Prior to 12/31/25)' },
  { id: 'emailExportsPost', label: 'Emails (Post 12/31/25)' },
  { id: 'communicationExports', label: 'Communications' },
]

const EMAIL_CUTOFF = '2025-12-31'

// Tabs that fetch their own data instead of relying on the global /api/refresh payload.
// Each entry is a thunk so tabs needing props (like the two date-split Emails tabs) can pass them.
const SELF_FETCH_TABS = {
  tasks: () => <MyTasks />,
  taskExports: () => <TaskExports />,
  notes: () => <NoteExports />,
  meetingExports: () => <MeetingExports />,
  callExports: () => <CallExports />,
  // Distinct keys are required: both tabs render the same EmailExports type at the same
  // tree position, so without unique keys React reuses one instance across the tab switch
  // and the second tab shows the first tab's loaded data instead of re-fetching.
  emailExportsPre: () => <EmailExports key="emailExportsPre" title="Emails (Prior to 12/31/25)" cutoff={EMAIL_CUTOFF} mode="before" />,
  emailExportsPost: () => <EmailExports key="emailExportsPost" title="Emails (Post 12/31/25)" cutoff={EMAIL_CUTOFF} mode="onOrAfter" />,
  communicationExports: () => <CommunicationExports />,
}

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
      if (!res.ok) {
        let msg = `Server error: ${res.status}`
        try { const body = await res.json(); if (body.error) msg = body.error } catch {}
        throw new Error(msg)
      }
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
          <img src="/loop-erp-logo.png" alt="Loop ERP" style={{ height: 40, marginBottom: 6 }} />
          <h1>Sales and Lead Management Dashboard</h1>
          <p>
            {lastRefreshedStr ? <>Last refreshed: {lastRefreshedStr}</> : 'Live data'}
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

      <div className="content" style={{ display: SELF_FETCH_TABS[activeTab] ? 'block' : undefined }}>
        {SELF_FETCH_TABS[activeTab] ? (
          SELF_FETCH_TABS[activeTab]()
        ) : (data || loading) ? (
          <>
            {activeTab === 'loop' && <LoopPipeline data={data?.loop} loading={loading} />}
            {activeTab === 'ceba' && <CebaPipeline data={data?.ceba} loading={loading} />}
            {activeTab === 'cebaServices' && <CebaServicesPipeline data={data?.cebaServices} loading={loading} />}
            {activeTab === 'sdr'      && <SdrActivities data={data?.sdr}      loading={loading} />}
            {activeTab === 'meetings' && <SalesMeetings data={data?.sdr}      loading={loading} />}
            {activeTab === 'leads'    && <LeadDashboard data={data?.leads}    loading={loading} />}
          </>
        ) : null}
      </div>
    </>
  )
}
