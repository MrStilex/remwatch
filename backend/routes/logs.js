import { LOKI_URL } from '../index.js'

export default async function logsRoute(fastify) {
  function lokiSelectorFromItem(item) {
    const esc = v => String(v ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const parts = []
    if ((item.service_name ?? '').trim()) parts.push(`service_name="${esc(item.service_name)}"`)
    if ((item.node_name ?? '').trim()) parts.push(`node_name="${esc(item.node_name)}"`)
    if ((item.source_type ?? '').trim()) parts.push(`source_type="${esc(item.source_type)}"`)
    if ((item.container ?? '').trim()) parts.push(`container="${esc(item.container)}"`)
    return `{${parts.join(',')}}`
  }

  async function fetchLastSeenNs(item, startNs, endNs) {
    const body = new URLSearchParams({
      query: lokiSelectorFromItem(item),
      limit: '1',
      start: String(startNs),
      end: String(endNs),
      direction: 'backward',
    })

    const res = await fetch(`${LOKI_URL}/loki/api/v1/query_range`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null

    const data = await res.json()
    const stream = data?.data?.result?.[0]
    const first = stream?.values?.[0]?.[0]
    return first ? Number(first) : null
  }

  fastify.get('/logs/files', async (req, reply) => {
    const { since = '24h' } = req.query

    const now = Math.floor(Date.now() / 1000)
    const hoursMatch = String(since).match(/^(\d+)h$/)
    const minutesMatch = String(since).match(/^(\d+)m$/)
    const daysMatch = String(since).match(/^(\d+)d$/)
    const weeksMatch = String(since).match(/^(\d+)w$/)
    const offsetSec = hoursMatch
      ? Number(hoursMatch[1]) * 3600
      : minutesMatch
        ? Number(minutesMatch[1]) * 60
        : daysMatch
          ? Number(daysMatch[1]) * 86400
          : weeksMatch
            ? Number(weeksMatch[1]) * 7 * 86400
            : 86400

    const startSec = now - offsetSec
    const endSec = now

    const params = new URLSearchParams()
    params.append('match[]', '{service_name=~".+"}')
    params.append('start', String(startSec * 1e9))
    params.append('end', String(endSec * 1e9))

    try {
      const res = await fetch(`${LOKI_URL}/loki/api/v1/series?${params.toString()}`, {
        signal: AbortSignal.timeout(15_000),
      })

      if (!res.ok) {
        reply.status(502)
        return { error: `Loki error: ${res.status}` }
      }

      const data = await res.json()
      const streams = Array.isArray(data?.data) ? data.data : []

      const baseItems = streams
        .filter(s => (s.service_name || '').trim() !== '')
        .map(s => ({
          node_name: s.node_name ?? '',
          service_name: s.service_name ?? '',
          source_type: s.source_type ?? '',
          container: s.container ?? '',
          country: s.country ?? '',
          environment: s.environment ?? '',
        }))
        .sort((a, b) =>
          (a.service_name + a.node_name + a.source_type).localeCompare(
            b.service_name + b.node_name + b.source_type,
            'en'
          )
        )

      const startNs = startSec * 1e9
      const endNs = endSec * 1e9
      const items = await Promise.all(
        baseItems.map(async item => {
          const lastSeenNs = await fetchLastSeenNs(item, startNs, endNs)
          return {
            ...item,
            last_seen: lastSeenNs ? new Date(lastSeenNs / 1e6).toISOString() : null,
          }
        })
      )

      return items
    } catch (err) {
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError'
      reply.status(isTimeout ? 504 : 502)
      return {
        error: isTimeout
          ? 'Loki query timeout. Сузь период.'
          : (err?.message || 'Loki request failed'),
      }
    }
  })

  fastify.post('/logs/files/delete', async (req, reply) => {
    const payload = { ...(req.query ?? {}), ...(req.body ?? {}) }
    const service_name = String(payload.service_name ?? '')
    const node_name = String(payload.node_name ?? '')
    const source_type = String(payload.source_type ?? '')
    const container = String(payload.container ?? '')
    if (!service_name) {
      reply.status(400)
      return { error: 'service_name is required', received: payload }
    }

    const selector = lokiSelectorFromItem({ service_name, node_name, source_type, container })
    const endNs = Date.now() * 1e6
    const params = new URLSearchParams({
      query: selector,
      start: '0',
      end: String(endNs),
    })

    try {
      const res = await fetch(`${LOKI_URL}/loki/api/v1/delete?${params.toString()}`, {
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
      })

      if (!res.ok) {
        reply.status(502)
        return { error: `Loki delete failed: ${res.status}` }
      }

      return { ok: true }
    } catch (err) {
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError'
      reply.status(isTimeout ? 504 : 502)
      return {
        error: isTimeout
          ? 'Loki delete timeout'
          : (err?.message || 'Loki delete failed'),
      }
    }
  })

  fastify.get('/logs', async (req, reply) => {
    const {
      node         = '',
      service_name = '',
      search       = '',
      limit        = '100',
      since        = '1h',
      start        = '',
      end          = '',
      error_type   = '',
      level        = '',
    } = req.query

    const now = Math.floor(Date.now() / 1000)
    const parsedStart = start ? Math.floor(new Date(start).getTime() / 1000) : null
    const parsedEnd = end ? Math.floor(new Date(end).getTime() / 1000) : null

    let startSec
    let endSec
    if (
      parsedStart != null && parsedEnd != null &&
      Number.isFinite(parsedStart) && Number.isFinite(parsedEnd) &&
      parsedStart > 0 && parsedEnd > parsedStart
    ) {
      startSec = parsedStart
      endSec = parsedEnd
    } else if (since === 'all') {
      startSec = 0
      endSec = now
    } else {
      const hoursMatch = since.match(/^(\d+)h$/)
      const minutesMatch = since.match(/^(\d+)m$/)
      const daysMatch = since.match(/^(\d+)d$/)
      const weeksMatch = since.match(/^(\d+)w$/)
      const offsetSec = hoursMatch
        ? Number(hoursMatch[1]) * 3600
        : minutesMatch
          ? Number(minutesMatch[1]) * 60
          : daysMatch
            ? Number(daysMatch[1]) * 86400
            : weeksMatch
              ? Number(weeksMatch[1]) * 7 * 86400
              : 3600
      startSec = now - offsetSec
      endSec = now
    }

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

    const maxLimit = Math.min(Math.max(Number(limit) || 100, 1), 2000)

    async function fetchWindow(windowStartSec, windowEndSec, windowLimit) {
      const body = new URLSearchParams({
        query,
        limit: String(windowLimit),
        start: String(windowStartSec * 1e9),
        end: String(windowEndSec * 1e9),
        direction: 'backward',
      })

      const res = await fetch(`${LOKI_URL}/loki/api/v1/query_range`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(15_000),
      })

      if (!res.ok) {
        throw new Error(`Loki error: ${res.status}`)
      }

      const data = await res.json()
      return data.data?.result ?? []
    }

    function normalizeMessage(rawMessage, fallbackLine, parsed) {
      let message = rawMessage ?? parsed?.MESSAGE ?? fallbackLine
      if (message == null) return ''
      if (typeof message !== 'string') message = String(message)

      // Some emitters send a JSON-encoded string as message (double-quoted payload).
      if (message.startsWith('"') && message.endsWith('"')) {
        try {
          const decoded = JSON.parse(message)
          if (typeof decoded === 'string') message = decoded
        } catch {}
      }

      // Remove ANSI color/control sequences so UI matches plain journal output.
      message = message.replace(/\u001b\[[0-9;]*m/g, '')
      return message.trim()
    }

    function flattenEntries(streams) {
      return streams.flatMap(stream =>
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
            message:      normalizeMessage(parsed.message, line, parsed),
          }
        })
      )
    }

    function dedupeEntries(entries) {
      const seen = new Set()
      return entries.filter(entry => {
        const key = `${entry.ts}|${entry.node_name}|${entry.service_name}|${entry.message}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    }

    let entries = []

    try {
      // For service-specific log views, scan backward in smaller windows.
      // This returns "whatever exists in the selected interval" without forcing
      // Loki to resolve one large 24h query before sending anything useful back.
      if (service_name) {
        const totalSec = Math.max(endSec - startSec, 1)
        const windowSec =
          totalSec <= 3600 ? 300 :
          totalSec <= 86400 ? 900 :
          3600

        let cursorEndSec = endSec
        while (cursorEndSec > startSec && entries.length < maxLimit) {
          const cursorStartSec = Math.max(startSec, cursorEndSec - windowSec)
          const streams = await fetchWindow(cursorStartSec, cursorEndSec, maxLimit)
          entries = dedupeEntries(entries.concat(flattenEntries(streams)))
          cursorEndSec = cursorStartSec

          if (entries.length > 0 && totalSec > 3600) {
            break
          }
        }
      } else {
        const streams = await fetchWindow(startSec, endSec, maxLimit)
        entries = flattenEntries(streams)
      }
    } catch (err) {
      const isTimeout =
        err?.name === 'TimeoutError' ||
        err?.name === 'AbortError' ||
        String(err?.message || '').includes('Headers Timeout Error')

      reply.status(isTimeout ? 504 : 502)
      return {
        error: isTimeout
          ? 'Loki query timeout. Сузь период или уточни фильтры.'
          : (err?.message || 'Loki request failed'),
      }
    }

    entries.sort((a, b) => (a.ts < b.ts ? 1 : -1))
    return entries.slice(0, maxLimit)
  })
}
