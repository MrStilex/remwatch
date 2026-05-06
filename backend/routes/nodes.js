import { LOKI_URL } from '../index.js'
import { scrapeSystem, registerIpsForPolling } from '../nodeExporter.js'
import { getCached, setCached, invalidate } from '../cache.js'
import { getAll, addNode, removeNode, getById, patchNodeIp, seedIfEmpty } from '../nodes-registry.js'

const ONLINE_WINDOW  = 5 * 60
const ERRORS_WINDOW  = '1h'

async function lokiGet(path, params = {}) {
  const url = new URL(`${LOKI_URL}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.append(k, v)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Loki ${path} → ${res.status}`)
  return res.json()
}

async function lokiPost(path, params = {}) {
  const body = new URLSearchParams(params)
  const res  = await fetch(`${LOKI_URL}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`Loki ${path} → ${res.status}`)
  return res.json()
}

async function getNodeInfo(reg) {
  const { id, name, node_ip: regIp, country: regCountry } = reg
  const now         = Math.floor(Date.now() / 1000)
  const onlineStart = (now - ONLINE_WINDOW) * 1e9

  const [recent, errMetric] = await Promise.all([
    lokiPost('/loki/api/v1/query_range', {
      query:     `{node_name="${name}"}`,
      limit:     '1',
      start:     String((now - 24 * 3600) * 1e9),
      end:       String(now * 1e9),
      direction: 'backward',
    }).catch(() => ({ data: { result: [] } })),

    lokiPost('/loki/api/v1/query_range', {
      query: `sum(count_over_time({node_name="${name}", error_type!="heartbeat"}[${ERRORS_WINDOW}]))`,
      start: String((now - 3600) * 1e9),
      end:   String(now * 1e9),
      step:  '3600',
    }).catch(() => ({ data: { result: [] } })),
  ])

  const streams = recent.data?.result ?? []
  let last_seen = null, lokiIp = null, status = 'offline', country = regCountry

  if (streams.length > 0 && streams[0].values?.length > 0) {
    const [tsNano, rawLine] = streams[0].values[0]
    last_seen = new Date(Number(tsNano) / 1e6).toISOString()
    try {
      const parsed = JSON.parse(rawLine)
      lokiIp  = parsed.node_ip  ?? null
      country = parsed.country  ?? regCountry
    } catch {}
    if (Number(tsNano) >= onlineStart) status = 'online'
  }

  const node_ip = regIp || lokiIp
  // Запомнить IP в реестре если он не был задан
  if (!regIp && lokiIp) patchNodeIp(id, lokiIp)

  const errResult = errMetric.data?.result ?? []
  const errors_1h = errResult.length > 0
    ? Number(errResult[0].values?.at(-1)?.[1] ?? 0)
    : 0

  const system = node_ip ? await scrapeSystem(node_ip) : null

  return {
    id, name, country, node_ip, status, last_seen, errors_1h,
    cpu_percent: system?.cpu_percent ?? null,
    ram_used:    system?.ram_used    ?? null,
    ram_total:   system?.ram_total   ?? null,
    disk_used:   system?.disk_used   ?? null,
    disk_total:  system?.disk_total  ?? null,
    net_rx_bps:  system?.net_rx_bps  ?? null,
    net_tx_bps:  system?.net_tx_bps  ?? null,
  }
}

export default async function nodesRoute(fastify) {
  fastify.get('/nodes', async (req, reply) => {
    const cached = getCached('nodes')
    if (cached) return cached

    // Автомиграция: при пустом реестре засеять из Loki
    if (getAll().length === 0) {
      const labelsData = await lokiGet('/loki/api/v1/label/node_name/values', {
        'match[]': '{service!="remnawave-panel"}',
      }).catch(() => ({ data: [] }))
      seedIfEmpty(labelsData.data ?? [])
    }

    const registered = getAll()
    const nodes      = await Promise.all(registered.map(getNodeInfo))

    setCached('nodes', nodes)
    registerIpsForPolling(nodes.map(n => n.node_ip).filter(Boolean))
    return nodes
  })

  fastify.post('/nodes', async (req, reply) => {
    const { name, node_ip, country } = req.body ?? {}
    if (!name?.trim()) {
      reply.status(400)
      return { error: 'name обязателен' }
    }
    const node = addNode({ name: name.trim(), node_ip: node_ip?.trim(), country: country?.trim() })
    invalidate('nodes')
    reply.status(201)
    return node
  })

  fastify.delete('/nodes/:id', async (req, reply) => {
    const { id } = req.params
    const node   = getById(id)
    if (!node) {
      reply.status(404)
      return { error: 'Нода не найдена' }
    }

    // Удаляем логи из Loki по node_name
    const end   = new Date(Date.now() - 60_000).toISOString()
    const query = new URLSearchParams({
      query: `{node_name="${node.name}"}`,
      start: '1970-01-01T00:00:00Z',
      end,
    })
    await fetch(`${LOKI_URL}/loki/api/v1/delete?${query}`, { method: 'POST' }).catch(() => {})

    removeNode(id)
    invalidate('nodes')
    return { ok: true }
  })
}
