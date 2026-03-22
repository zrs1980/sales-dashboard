import { useState, useEffect, useRef } from 'react'

function renderMarkdown(text) {
  return text.split('\n').map((line, i) => {
    if (!line.trim()) return <div key={i} style={{ height: 5 }} />
    const parts = line.split(/\*\*([^*]+)\*\*/)
    return (
      <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
        {parts.map((p, j) =>
          j % 2 === 1
            ? <strong key={j} style={{ color: 'var(--text-primary)' }}>{p}</strong>
            : p
        )}
      </div>
    )
  })
}

export default function LeadInsights({ leads, stageMap, pipelineMap }) {
  const [state, setState] = useState('idle')
  const [insights, setInsights] = useState('')
  const [engagedCount, setEngagedCount] = useState(0)
  const loadedRef = useRef(false)

  async function load() {
    setState('loading')
    try {
      const res = await fetch('/api/lead-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads, stageMap, pipelineMap }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setInsights(data.insights || '')
      setEngagedCount(data.engagedCount || 0)
      setState('loaded')
    } catch (e) {
      setInsights(e.message)
      setState('error')
    }
  }

  useEffect(() => {
    if (loadedRef.current || !leads || leads.length === 0) return
    loadedRef.current = true
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!leads || leads.length === 0) return null

  return (
    <div className="panel" style={{ marginBottom: 20, borderLeft: '3px solid var(--warning)' }}>
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="panel-title">✦ Lead Follow-Up Insights</div>
          <div className="panel-sub">
            {state === 'loading'
              ? 'Claude is reviewing engaged leads for follow-up gaps…'
              : state === 'loaded'
                ? `${engagedCount} active leads analyzed · pipeline stage follow-up review`
                : 'AI-generated follow-up analysis for engaged leads'
            }
          </div>
        </div>
        {state === 'loaded' && (
          <button
            onClick={() => { loadedRef.current = true; load() }}
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)',
              flexShrink: 0,
            }}
          >
            ↻ Regenerate
          </button>
        )}
      </div>

      <div style={{ padding: '16px 20px' }}>
        {state === 'loading' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 13, padding: '8px 0' }}>
            <div className="spinner" />
            Analyzing engaged leads for follow-up gaps…
          </div>
        )}
        {state === 'loaded' && renderMarkdown(insights)}
        {state === 'error' && (
          <div style={{ color: 'var(--danger)', fontSize: 13 }}>
            Error: {insights} ·{' '}
            <button
              onClick={() => { loadedRef.current = true; load() }}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontSize: 13 }}
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
