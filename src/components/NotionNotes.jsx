import { useState } from 'react'

export default function NotionNotes({ pageId, notionLink, dealId, dealName }) {
  const [state, setState] = useState('idle') // idle | loading | loaded | error | creating | created
  const [lines, setLines] = useState([])
  const [open, setOpen] = useState(false)
  const [createdUrl, setCreatedUrl] = useState(null)
  const [meetingState, setMeetingState] = useState('idle') // idle | loading | error
  const [meetingError, setMeetingError] = useState(null)

  const effectiveLink = createdUrl || notionLink
  const effectivePageId = createdUrl
    ? createdUrl.match(/([a-f0-9]{32})/)?.[1]
      ? (() => { const id = createdUrl.match(/([a-f0-9]{32})/)[1]; return `${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}` })()
      : pageId
    : pageId

  if (!effectivePageId && !effectiveLink) {
    if (!dealId) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>

    async function createAccount() {
      setState('creating')
      try {
        const res = await fetch('/api/notion/create-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dealId, dealName }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to create account')
        setCreatedUrl(data.notionUrl)
        setState('created')
      } catch (e) {
        setState('error')
        setLines([e.message])
      }
    }

    if (state === 'error') {
      return (
        <span style={{ color: 'var(--danger)', fontSize: 11 }}>
          Error: {lines[0]}
        </span>
      )
    }

    return (
      <button
        className="notion-toggle"
        onClick={createAccount}
        disabled={state === 'creating'}
        style={{
          background: 'var(--accent)',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          padding: '3px 8px',
          fontSize: 11,
          fontWeight: 600,
          cursor: state === 'creating' ? 'wait' : 'pointer',
          opacity: state === 'creating' ? 0.7 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        {state === 'creating' ? 'Creating…' : '+ Create Notion Account'}
      </button>
    )
  }

  async function load() {
    if (state === 'loaded') { setOpen(o => !o); return }
    setState('loading')
    setOpen(true)
    try {
      const res = await fetch(`/api/notion/${encodeURIComponent(effectivePageId)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setLines(data.lines || [])
      setState('loaded')
    } catch (e) {
      setLines([e.message])
      setState('error')
    }
  }

  async function recordMeeting() {
    setMeetingState('loading')
    setMeetingError(null)
    try {
      const res = await fetch('/api/notion/new-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notionLink: effectiveLink }),
      })
      const data = await res.json()
      console.log('[new-meeting response]', JSON.stringify(data, null, 2))
      if (!res.ok) throw new Error(data.error || 'Failed to create meeting')
      window.open(data.meetingUrl, '_blank', 'noreferrer')
      setMeetingState('idle')
    } catch (e) {
      setMeetingError(e.message)
      setMeetingState('error')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {effectiveLink && (
          <a
            href={effectiveLink}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}
          >
            Open ↗
          </a>
        )}
        {effectivePageId && (
          <button className="notion-toggle" onClick={load}>
            {state === 'loading' ? '…' : open ? 'Hide notes' : 'View notes'}
          </button>
        )}
      </div>
      {effectiveLink && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <button
            className="notion-toggle"
            onClick={recordMeeting}
            disabled={meetingState === 'loading'}
            style={{
              background: 'var(--success)',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              padding: '3px 8px',
              fontSize: 11,
              fontWeight: 600,
              cursor: meetingState === 'loading' ? 'wait' : 'pointer',
              opacity: meetingState === 'loading' ? 0.7 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {meetingState === 'loading' ? 'Creating…' : '🎙 Record Meeting'}
          </button>
          {meetingState === 'error' && (
            <span style={{ fontSize: 10, color: 'var(--danger)' }}>{meetingError}</span>
          )}
        </div>
      )}
      {open && state === 'loaded' && lines.length > 0 && (
        <div className="notion-notes">
          {lines.map((line, i) => <div key={i}>{line}</div>)}
        </div>
      )}
      {open && state === 'loaded' && lines.length === 0 && (
        <div className="notion-notes" style={{ color: 'var(--text-muted)' }}>No content found</div>
      )}
      {open && state === 'error' && (
        <div className="notion-notes" style={{ color: 'var(--danger)' }}>
          Could not load: {lines[0]}
        </div>
      )}
    </div>
  )
}
