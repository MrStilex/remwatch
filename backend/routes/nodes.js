import { LOKI_URL } from '../index.js'
import { isDeleted, markDeleted, unmarkDeleted } from '../deleted.js'
import { scrapeSystem } from '../nodeExporter.js'
import { getCached, setCached, invalidate } from '../cache.js'

const ONLINE_WINDOW = 5 * 60
const ERRORS_WINDOW = '1h'

async function lokiGet(path, params = {}) {
  const url = new URL(`${LOKI_URL}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.append(k, v)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Loki ${path} → ${res.status}`)
  return res.json()
}

async function lokiPost(path, params = {}) {
  const body = new URLSearchParams(params)
  const res = await fetch(`${LOKI_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`Loki ${path} → ${res.status}`)
  return res.json()
}

async function getNodeInfo(name) {
  const now = Math.floor(Date.now() / 1000)
  const onlineStart = (now - ONLINE_WINDOW) * 1e9

  // Все три запроса к Loki параллельно
  const [seriesData, recent, errMetric] = await Promise.all([
    lokiPost('/loki/api/v1/series', {
      'match[]': `{node_name="${name}"}`,
      start: String(onlineStart),
      end: String(now * 1e9),
    }).catch(() => ({ data: [] })),

    lokiPost('/loki/api/v1/query_range', {
      query: `{node_name="${name}"}`,
      limit: '1',
      start: String((now - 24 * 3600) * 1e9),
      end: String(now * 1e9),
      direction: 'backward',
    }).catch(() => ({ data: { result: [] } })),

    lokiPost('/loki/api/v1/query_range', {
      query: `count_over_time({node_name="${name}"}[${ERRORS_WINDOW}])`,
      start: String((now - 3600) * 1e9),
      end: String(now * 1e9),
      step: '3600',
    }).catch(() => ({ data: { result: [] } })),
  ])

  const country = seriesData.data?.[0]?.country ?? ''

  const streams = recent.data?.result ?? []
  let last_seen = null, node_ip = null, status = 'offline'

  if (streams.length > 0 && streams[0].values?.length > 0) {
    const [tsNano, rawLine] = streams[0].values[0]
    last_seen = new Date(Number(tsNano) / 1e6).toISOString()
    try { node_ip = JSON.parse(rawLine).node_ip ?? null } catch {}
    if (Number(tsNano) >= onlineStart) status = 'online'
  }

  const errResult = errMetric.data?.result ?? []
  const errors_1h = errResult.length > 0
    ? Number(errResult[0].values?.at(-1)?.[1] ?? 0)
    : 0

  const system = node_ip ? await scrapeSystem(node_ip) : null

  return {
    name, country, node_ip, status, last_seen, errors_1h,
    cpu_percent:  system?.cpu_percent  ?? null,
    ram_used:     system?.ram_used     ?? null,
    ram_total:    system?.ram_total    ?? null,
    disk_used:    system?.disk_used    ?? null,
    disk_total:   system?.disk_total   ?? null,
  }
}

export default async function nodesRoute(fastify) {
  fastify.get('/nodes', async (req, reply) => {
    const cached = getCached('nodes')
    if (cached) return cached

    const labelsData = await lokiGet('/loki/api/v1/label/node_name/values')
    const names = (labelsData.data ?? []).filter(n => !isDeleted(n))
    const nodes = await Promise.all(names.map(getNodeInfo))

    for (const node of nodes) {
      if (node.status === 'online') unmarkDeleted(node.name)
    }

    setCached('nodes', nodes)
    return nodes
  })

  fastify.delete('/nodes/:name', async (req, reply) => {
    const { name } = req.params
    const end = new Date(Date.now() - 60_000).toISOString()
    const query = new URLSearchParams({
      query: `{node_name="${name}"}`,
      start: '1970-01-01T00:00:00Z',
      end,
    })

    const res = await fetch(`${LOKI_URL}/loki/api/v1/delete?${query}`, { method: 'POST' })

    if (!res.ok && res.status !== 204) {
      const text = await res.text()
      reply.status(502)
      return { error: `Loki delete error: ${res.status} ${text}` }
    }

    markDeleted(name)
    invalidate('nodes')
    return { ok: true, node: name }
  })
}
