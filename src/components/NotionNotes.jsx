import { useState } from 'react'

export default function NotionNotes({ pageId, notionLink, dealId, dealName }) {
  const [state, setState] = useState('idle') // idle | creating | error
  const [lines, setLines] = useState([])
  const [createdUrl, setCreatedUrl] = useState(null)
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {effectiveLink && (
        <a
          href={effectiveLink}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-block',
            background: 'var(--success)',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            padding: '3px 8px',
            fontSize: 11,
            fontWeight: 600,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Open in Notion
        </a>
      )}
    </div>
  )
}
