function parsePrometheus(text) {
  const lines = text.split('\n').filter(l => l && !l.startsWith('#'))
  const series = []
  for (const line of lines) {
    const m = line.match(/^(\w+)\{([^}]*)\}\s+([\d.e+]+)/)
    if (!m) continue
    const [, name, labelsRaw, valueStr] = m
    const labels = {}
    for (const kv of labelsRaw.matchAll(/(\w+)="([^"]*)"/g)) {
      labels[kv[1]] = kv[2]
    }
    series.push({ name, labels, value: parseFloat(valueStr) })
  }
  return series
}

function get(series, metricName, labelFilter = {}) {
  return series.find(s =>
    s.name === metricName &&
    Object.entries(labelFilter).every(([k, v]) => s.labels[k] === v)
  )?.value ?? 0
}

function getAll(series, metricName, labelFilter = {}) {
  return series.filter(s =>
    s.name === metricName &&
    Object.entries(labelFilter).every(([k, v]) => s.labels[k] === v)
  )
}

function buildResponse(series) {
  // ── global ────────────────────────────────────────────────────────────────
  const online = {
    now:       get(series, 'remnawave_users_online_stats', { metricType: 'onlineNow' }),
    today:     get(series, 'remnawave_users_online_stats', { metricType: 'lastDay' }),
    this_week: get(series, 'remnawave_users_online_stats', { metricType: 'lastWeek' }),
    never:     get(series, 'remnawave_users_online_stats', { metricType: 'neverOnline' }),
  }

  const users = {
    total:    get(series, 'remnawave_users_total', { type: 'all' }),
    active:   get(series, 'remnawave_users_status', { status: 'ACTIVE' }),
    expired:  get(series, 'remnawave_users_status', { status: 'EXPIRED' }),
    limited:  get(series, 'remnawave_users_status', { status: 'LIMITED' }),
    disabled: get(series, 'remnawave_users_status', { status: 'DISABLED' }),
  }

  // ── nodes ─────────────────────────────────────────────────────────────────
  const nodeUuids = [...new Set(
    getAll(series, 'remnawave_node_status').map(s => s.labels.node_uuid)
  )]

  const nodes = nodeUuids.map(uuid => {
    const statusSeries = series.find(
      s => s.name === 'remnawave_node_status' && s.labels.node_uuid === uuid
    )
    const node_name = statusSeries?.labels.node_name ?? uuid
    const status = statusSeries?.value ?? 0

    const online_users = status
      ? get(series, 'remnawave_node_online_users', { node_uuid: uuid })
      : 0

    // Inbounds — исключаем служебный REMNAWAVE_API_INBOUND
    const uploadRows  = getAll(series, 'remnawave_node_inbound_upload_bytes',   { node_uuid: uuid })
      .filter(s => s.labels.tag !== 'REMNAWAVE_API_INBOUND')
    const downloadRows = getAll(series, 'remnawave_node_inbound_download_bytes', { node_uuid: uuid })
      .filter(s => s.labels.tag !== 'REMNAWAVE_API_INBOUND')

    const inboundMap = {}
    for (const s of uploadRows) {
      inboundMap[s.labels.tag] = { tag: s.labels.tag, upload_bytes: s.value, download_bytes: 0 }
    }
    for (const s of downloadRows) {
      if (!inboundMap[s.labels.tag]) inboundMap[s.labels.tag] = { tag: s.labels.tag, upload_bytes: 0, download_bytes: 0 }
      inboundMap[s.labels.tag].download_bytes = s.value
    }

    const inbounds = Object.values(inboundMap)
    const upload_bytes   = status ? inbounds.reduce((a, b) => a + b.upload_bytes, 0)   : 0
    const download_bytes = status ? inbounds.reduce((a, b) => a + b.download_bytes, 0) : 0

    return { name: node_name, status, online_users, upload_bytes, download_bytes, inbounds: status ? inbounds : [] }
  })

  nodes.sort((a, b) => {
    if (a.status !== b.status) return b.status - a.status
    return b.online_users - a.online_users
  })

  return { online, users, nodes }
}

import { scrapeSystem } from '../nodeExporter.js'
import { getCached, setCached } from '../cache.js'

export default async function metricsRoute(fastify) {
  fastify.post('/metrics', async (req, reply) => {
    const { url, user, pass } = req.body ?? {}
    if (!url) { reply.status(400); return { error: 'url required' } }

    const cacheKey = `metrics:${url}:${user ?? ''}`
    const cached = getCached(cacheKey)
    if (cached) return cached

    const auth = user
      ? 'Basic ' + Buffer.from(`${user}:${pass ?? ''}`).toString('base64')
      : undefined

    let text
    try {
      const res = await fetch(`${url}/metrics`, {
        headers: auth ? { Authorization: auth } : {},
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) {
        reply.status(502)
        return { error: `upstream ${res.status}` }
      }
      text = await res.text()
    } catch (e) {
      reply.status(502)
      return { error: e.message }
    }

    const built = buildResponse(parsePrometheus(text))

    let system = null
    try {
      const hostname = new URL(url).hostname
      system = await scrapeSystem(hostname)
    } catch {}

    const result = { ...built, system }
    setCached(cacheKey, result)
    return result
  })
}
