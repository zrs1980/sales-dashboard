import { useState } from 'react'

function renderMarkdown(text) {
  return text.split('\n').map((line, i) => {
    if (!line.trim()) return <div key={i} style={{ height: 6 }} />

    // ## Heading
    if (line.startsWith('## ')) {
      return (
        <div key={i} style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 12, marginTop: 10, marginBottom: 2 }}>
          {line.slice(3)}
        </div>
      )
    }

    // Inline **bold** segments
    const parts = line.split(/\*\*([^*]+)\*\*/)
    return (
      <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {parts.map((p, j) =>
          j % 2 === 1
            ? <strong key={j} style={{ color: 'var(--text-primary)' }}>{p}</strong>
            : p
        )}
      </div>
    )
  })
}

export default function AiReview({ dealId, notionPageId, dealName }) {
  const [state, setState] = useState('idle') // idle | loading | loaded | error
  const [analysis, setAnalysis] = useState('')
  const [open, setOpen] = useState(false)

  async function load() {
    if (state === 'loaded') { setOpen(o => !o); return }
    setState('loading')
    setOpen(true)
    try {
      const params = new URLSearchParams({ dealId, dealName: dealName || '' })
      if (notionPageId) params.set('notionPageId', notionPageId)
      const res = await fetch(`/api/ai-review?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setAnalysis(data.analysis || '')
      setState('loaded')
    } catch (e) {
      setAnalysis(e.message)
      setState('error')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button
        className="notion-toggle"
        onClick={load}
        disabled={state === 'loading'}
        style={state === 'loaded' && open ? { background: 'var(--accent)', color: 'white' } : {}}
      >
        {state === 'loading' ? '⏳ Analyzing…' : open && state === 'loaded' ? 'Hide Review' : '✦ AI Review'}
      </button>

      {open && state === 'loaded' && (
        <div className="notion-notes" style={{ maxWidth: 380, maxHeight: 320, overflowY: 'auto' }}>
          {renderMarkdown(analysis)}
        </div>
      )}

      {open && state === 'error' && (
        <div className="notion-notes" style={{ color: 'var(--danger)', fontSize: 12 }}>
          Error: {analysis}
        </div>
      )}
    </div>
  )
}
