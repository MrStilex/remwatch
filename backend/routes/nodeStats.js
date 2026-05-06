import { LOKI_URL } from '../index.js'

const ERROR_TYPES = [
  'timeout', 'connection_refused', 'dns_error', 'tls_error',
  'reality_error', 'outbound_error', 'connection_reset', 'other_error',
]

async function lokiMetric(query, start, end, step) {
  const body = new URLSearchParams({ query, start: String(start), end: String(end), step: String(step) })
  const res = await fetch(`${LOKI_URL}/loki/api/v1/query_range`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.data?.result ?? []
}

export default async function nodeStatsRoute(fastify) {
  // GET /api/node-stats?node=X&hours=24
  fastify.get('/node-stats', async (req, reply) => {
    const { node, hours = '24' } = req.query
    if (!node) { reply.status(400); return { error: 'node required' } }

    const h      = Math.min(Math.max(Number(hours) || 24, 1), 168)
    const now    = Math.floor(Date.now() / 1000)
    const start  = (now - h * 3600) * 1e9
    const end    = now * 1e9
    // step: 1h→1m, 6h→5m, 24h→15m, 7d→1h
    const stepSec = h <= 1 ? 60 : h <= 6 ? 300 : h <= 24 ? 900 : 3600

    // Один запрос на каждый тип ошибки — параллельно
    const results = await Promise.all(
      ERROR_TYPES.map(et =>
        lokiMetric(
          `count_over_time({node_name="${node}",error_type="${et}"}[${stepSec}s])`,
          start, end, stepSec,
        ).then(streams => ({
          error_type: et,
          values: streams[0]?.values?.map(([ts, v]) => [Number(ts) * 1000, Number(v)]) ?? [],
        }))
      )
    )

    // Итого за период по каждому типу
    const totals = results.map(r => ({
      error_type: r.error_type,
      total: r.values.reduce((s, [, v]) => s + v, 0),
    })).filter(r => r.total > 0)

    // Последние ошибки (лог-записи)
    const recentBody = new URLSearchParams({
      query: `{node_name="${node}",error_type!="none"}`,
      limit: '50',
      start: String(start),
      end:   String(end),
      direction: 'backward',
    })
    const recentRes  = await fetch(`${LOKI_URL}/loki/api/v1/query_range`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: recentBody,
    })
    const recentData = recentRes.ok ? await recentRes.json() : { data: { result: [] } }
    const recent = (recentData.data?.result ?? [])
      .flatMap(s => (s.values ?? []).map(([ts, line]) => {
        let parsed = {}
        try { parsed = JSON.parse(line) } catch {}
        return {
          ts:         new Date(Number(ts) / 1e6).toISOString(),
          error_type: parsed.error_type ?? s.stream?.error_type ?? '',
          message:    parsed.message ?? line,
        }
      }))
      .sort((a, b) => a.ts < b.ts ? 1 : -1)
      .slice(0, 50)

    return { series: results.filter(r => r.values.length > 0), totals, recent, stepSec, hours: h }
  })
}
