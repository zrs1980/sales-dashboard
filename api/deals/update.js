import { hsPatch } from '../_hubspot.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })

  const { dealId, properties } = req.body || {}
  if (!dealId || !properties) return res.status(400).json({ error: 'dealId and properties are required' })

  try {
    await hsPatch(`/crm/v3/objects/deals/${dealId}`, { properties })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
