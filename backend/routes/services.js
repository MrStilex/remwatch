import { LOKI_URL } from '../index.js'
import {
  createService,
  deleteService,
  getAllServices,
  getServiceById,
  getServiceByToken,
  revokeService,
  sanitizeService,
  serviceContainerValue,
  touchServiceLastSeen,
} from '../services-store.js'

function serviceToSelector(service) {
  const esc = value => String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const labels = {
    service_name: service.service_name,
    node_name: service.node_name,
    country: service.country,
  }

  if (service.source_type === 'systemd') {
    labels.source_type = 'systemd'
    labels.container = service.service_unit
  } else if (service.source_type === 'file') {
    labels.source_type = 'file'
    labels.container = service.log_path || service.service_name
  } else if (service.source_type === 'node') {
    labels.source_type = 'node'
    labels.container = 'remnanode'
  }

  return `{${Object.entries(labels)
    .filter(([, value]) => String(value ?? '').trim() !== '')
    .map(([key, value]) => `${key}="${esc(value)}"`)
    .join(',')}}`
}

function normalizeSourceType(value) {
  if (value === 'file') return 'file'
  if (value === 'node') return 'node'
  return 'systemd'
}

function getBearerToken(req) {
  const raw = req.headers.authorization || ''
  const match = raw.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ''
}

function normalizeLevel(value) {
  const level = String(value ?? '').trim().toLowerCase()
  if (level === 'error' || level === 'warn' || level === 'info' || level === 'debug') return level
  return 'info'
}

function authoritativeLabels(service, level = 'info') {
  const labels = {
    service_name: service.service_name,
    node_name: service.node_name,
    country: service.country,
    environment: service.environment || 'production',
    level: normalizeLevel(level),
    source_type: service.source_type,
    container: serviceContainerValue(service),
  }
  return Object.fromEntries(
    Object.entries(labels).filter(([, value]) => String(value ?? '').trim() !== '')
  )
}

export default async function servicesRoute(fastify) {
  fastify.get('/services', async () => {
    return getAllServices().map(sanitizeService)
  })

  fastify.post('/services', async (req, reply) => {
    const payload = req.body ?? {}
    const service_name = String(payload.service_name ?? '').trim()
    const source_type = normalizeSourceType(payload.source_type)
    const service_unit = String(payload.service_unit ?? '').trim()
    const log_path = String(payload.log_path ?? '').trim()

    if (!service_name) {
      reply.status(400)
      return { error: 'service_name is required' }
    }
    if (source_type === 'systemd' && !service_unit) {
      reply.status(400)
      return { error: 'service_unit is required for systemd source' }
    }
    if (source_type === 'file' && !log_path) {
      reply.status(400)
      return { error: 'log_path is required for file source' }
    }
    if (source_type === 'node' && !String(payload.node_name ?? '').trim()) {
      reply.status(400)
      return { error: 'node_name is required for node source' }
    }

    const { service, token } = createService({
      service_name,
      node_name: String(payload.node_name ?? '').trim(),
      node_ip: String(payload.node_ip ?? '').trim(),
      country: String(payload.country ?? '').trim(),
      environment: String(payload.environment ?? 'production').trim() || 'production',
      source_type,
      service_unit,
      log_path,
    })

    return {
      service: sanitizeService(service),
      token,
    }
  })

  fastify.post('/services/:id/revoke', async (req, reply) => {
    const service = revokeService(req.params.id)
    if (!service) {
      reply.status(404)
      return { error: 'Service not found' }
    }
    return { service: sanitizeService(service) }
  })

  fastify.delete('/services/:id', async (req, reply) => {
    const service = deleteService(req.params.id)
    if (!service) {
      reply.status(404)
      return { error: 'Service not found' }
    }
    return { ok: true }
  })

  fastify.post('/logs/ingest', async (req, reply) => {
    const token = getBearerToken(req)
    if (!token) {
      reply.status(401)
      return { error: 'Missing bearer token' }
    }

    const service = getServiceByToken(token)
    if (!service) {
      reply.status(401)
      return { error: 'Invalid token' }
    }
    if (service.status !== 'active') {
      reply.status(403)
      return { error: 'Service token is not active' }
    }

    const body = req.body
    let rewritten

    if (body && Array.isArray(body.streams)) {
      rewritten = {
        streams: body.streams
          .map(stream => ({
            stream: authoritativeLabels(service, stream?.stream?.level),
            values: Array.isArray(stream.values) ? stream.values : [],
          }))
          .filter(stream => stream.values.length > 0),
      }
    } else if (Array.isArray(body)) {
      rewritten = {
        streams: body
          .map(item => {
            const message = String(item?.message ?? '').trim()
            if (!message) return null
            const labels = authoritativeLabels(service, item?.level)
            const payload = {
              ...item,
              ...labels,
              message,
            }
            const ts = item?.timestamp ? Date.parse(item.timestamp) : Date.now()
            const tsNs = Number.isFinite(ts) ? Math.floor(ts * 1e6) : Date.now() * 1e6
            return {
              stream: labels,
              values: [[String(tsNs), JSON.stringify(payload)]],
            }
          })
          .filter(Boolean),
      }
    } else if (body && typeof body === 'object') {
      const message = String(body.message ?? '').trim()
      if (!message) {
        reply.status(400)
        return { error: 'Event payload requires message field' }
      }

      const labels = authoritativeLabels(service, body.level)
      const payload = {
        ...body,
        ...labels,
        message,
      }

      const ts = body.timestamp ? Date.parse(body.timestamp) : Date.now()
      const tsNs = Number.isFinite(ts) ? Math.floor(ts * 1e6) : Date.now() * 1e6
      rewritten = {
        streams: [
          {
            stream: labels,
            values: [[String(tsNs), JSON.stringify(payload)]],
          },
        ],
      }
    } else {
      reply.status(400)
      return { error: 'Expected Loki push payload or JSON event' }
    }

    if (rewritten.streams.length === 0) {
      reply.status(400)
      return { error: 'No log entries to ingest' }
    }

    const res = await fetch(`${LOKI_URL}/loki/api/v1/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rewritten),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      const details = (await res.text().catch(() => '')).trim()
      reply.status(502)
      return { error: `Loki push failed: ${res.status}`, details }
    }

    touchServiceLastSeen(service.id)
    reply.status(204)
    return null
  })
}
