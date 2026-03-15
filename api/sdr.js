import { fetchSdr } from './_data.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  try {
    const data = await fetchSdr()
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
