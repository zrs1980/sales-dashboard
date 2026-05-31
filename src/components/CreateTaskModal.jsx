import { useState, useEffect } from 'react'

const DEFAULT_EMAIL = 'zabe@cebasolutions.com'

export default function CreateTaskModal({ dealId, dealName, onClose, onCreated }) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0])
  const [owners, setOwners] = useState([])
  const [ownerId, setOwnerId] = useState('')
  const [loadingOwners, setLoadingOwners] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/owners')
      .then(r => r.json())
      .then(data => {
        const list = data.owners || []
        setOwners(list)
        const def = list.find(o => o.email === DEFAULT_EMAIL)
        if (def) setOwnerId(def.id)
      })
      .finally(() => setLoadingOwners(false))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!subject.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId, subject: subject.trim(), body: body.trim(), ownerId, dueDate }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create task')
      onCreated?.()
      onClose()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div style={{
        background: 'var(--white)', borderRadius: 10, padding: 28,
        width: 500, maxWidth: '92vw',
        boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>New Task</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{dealName}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)', lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Subject *</label>
            <input
              autoFocus
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Task subject"
              required
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Description</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Optional notes"
              rows={3}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Assignee</label>
              <select
                value={ownerId}
                onChange={e => setOwnerId(e.target.value)}
                disabled={loadingOwners}
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit', background: 'var(--white)' }}
              >
                <option value="">Unassigned</option>
                {owners.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div style={{ fontSize: 12, color: 'var(--danger)', background: '#fef2f2', padding: '8px 10px', borderRadius: 6 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !subject.trim()}
              style={{
                padding: '8px 18px', borderRadius: 6, border: 'none',
                background: 'var(--accent)', color: '#fff',
                cursor: saving ? 'wait' : 'pointer',
                fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                opacity: saving || !subject.trim() ? 0.6 : 1,
              }}
            >
              {saving ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
