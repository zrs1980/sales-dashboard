import { useState } from 'react'

export default function NotionNotes({ pageId, notionLink }) {
  const [state, setState] = useState('idle') // idle | loading | loaded | error
  const [lines, setLines] = useState([])
  const [open, setOpen] = useState(false)

  if (!pageId && !notionLink) {
    return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
  }

  async function load() {
    if (state === 'loaded') { setOpen(o => !o); return }
    setState('loading')
    setOpen(true)
    try {
      const res = await fetch(`/api/notion/${encodeURIComponent(pageId)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setLines(data.lines || [])
      setState('loaded')
    } catch (e) {
      setLines([e.message])
      setState('error')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {notionLink && (
          <a
            href={notionLink}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}
          >
            Open ↗
          </a>
        )}
        {pageId && (
          <button className="notion-toggle" onClick={load}>
            {state === 'loading' ? '…' : open ? 'Hide notes' : 'View notes'}
          </button>
        )}
      </div>
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
