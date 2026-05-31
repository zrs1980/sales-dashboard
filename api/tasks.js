import { hsPost } from './_hubspot.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { dealId, subject, body, ownerId, dueDate } = req.body || {}
  if (!dealId || !subject) return res.status(400).json({ error: 'dealId and subject are required' })

  try {
    // Convert date string (YYYY-MM-DD) to noon UTC ISO string
    const dueDateIso = dueDate
      ? new Date(dueDate + 'T12:00:00.000Z').toISOString()
      : new Date().toISOString()

    const task = await hsPost('/crm/v3/objects/tasks', {
      properties: {
        hs_task_subject: subject,
        hs_task_body: body || '',
        hubspot_owner_id: ownerId || '',
        hs_timestamp: dueDateIso,
        hs_task_status: 'NOT_STARTED',
        hs_task_type: 'TODO',
      },
      associations: [
        {
          to: { id: String(dealId) },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 }],
        },
      ],
    })

    res.json({ taskId: task.id })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
