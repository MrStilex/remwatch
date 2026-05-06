import { LOKI_URL } from '../index.js'

export default async function logsRoute(fastify) {
  fastify.get('/logs', async (req, reply) => {
    const {
      node         = '',
      service_name = '',
      search       = '',
      limit        = '100',
      since        = '1h',
      error_type   = '',
      level        = '',
    } = req.query

    const now = Math.floor(Date.now() / 1000)
    const hoursMatch = since.match(/^(\d+)h$/)
    const minutesMatch = since.match(/^(\d+)m$/)
    const offsetSec = hoursMatch
      ? Number(hoursMatch[1]) * 3600
      : minutesMatch
        ? Number(minutesMatch[1]) * 60
        : 3600

    let selector
    if (service_name) {
      selector = `service_name="${service_name}"`
      if (level) selector += `,level="${level}"`
    } else {
      selector = node ? `node_name="${node}"` : `node_name=~".+"`
      if (error_type) selector += `,error_type="${error_type}"`
    }
    let query = `{${selector}}`
    if (search) query += ` |= "${search.replace(/"/g, '\\"')}"`

    const body = new URLSearchParams({
      query,
      limit: String(Math.min(Number(limit), 1000)),
      start: String((now - offsetSec) * 1e9),
      end: String(now * 1e9),
      direction: 'backward',
    })

    const res = await fetch(`${LOKI_URL}/loki/api/v1/query_range`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    if (!res.ok) {
      reply.status(502)
      return { error: `Loki error: ${res.status}` }
    }

    const data = await res.json()
    const streams = data.data?.result ?? []

    // Склеиваем все стримы в плоский массив и сортируем по времени
    const entries = streams.flatMap(stream =>
      (stream.values ?? []).map(([tsNano, line]) => {
        let parsed = {}
        try { parsed = JSON.parse(line) } catch {}
        return {
          ts: new Date(Number(tsNano) / 1e6).toISOString(),
          node_name:    stream.labels?.node_name    ?? parsed.node_name    ?? '',
          service_name: stream.labels?.service_name ?? parsed.service_name ?? '',
          level:        stream.labels?.level        ?? 'info',
          country:      stream.labels?.country      ?? parsed.country      ?? '',
          container:    stream.labels?.container    ?? parsed.container    ?? '',
          error_type:   parsed.error_type ?? 'none',
          message:      parsed.message ?? line,
        }
      })
    )

    entries.sort((a, b) => (a.ts < b.ts ? 1 : -1))

    return entries
  })
}
