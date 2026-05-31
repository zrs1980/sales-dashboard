import { hsPost } from './_hubspot.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { dealId, contactId, subject, body, ownerId, dueDate } = req.body || {}
  if (!subject) return res.status(400).json({ error: 'subject is required' })
  if (!dealId && !contactId) return res.status(400).json({ error: 'dealId or contactId is required' })

  try {
    const dueDateIso = dueDate
      ? new Date(dueDate + 'T12:00:00.000Z').toISOString()
      : new Date().toISOString()

    const associations = []
    if (dealId) {
      associations.push({
        to: { id: String(dealId) },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 }],
      })
    }
    if (contactId) {
      associations.push({
        to: { id: String(contactId) },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 204 }],
      })
    }

    const task = await hsPost('/crm/v3/objects/tasks', {
      properties: {
        hs_task_subject: subject,
        hs_task_body: body || '',
        hubspot_owner_id: ownerId || '',
        hs_timestamp: dueDateIso,
        hs_task_status: 'NOT_STARTED',
        hs_task_type: 'TODO',
      },
      associations,
    })

    res.json({ taskId: task.id })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
