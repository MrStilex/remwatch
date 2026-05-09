import Fastify from 'fastify'
import cors        from '@fastify/cors'
import cookie      from '@fastify/cookie'
import jwt         from '@fastify/jwt'
import rateLimit   from '@fastify/rate-limit'
import authRoute      from './routes/auth.js'
import nodesRoute     from './routes/nodes.js'
import logsRoute      from './routes/logs.js'
import metricsRoute   from './routes/metrics.js'
import nodeStatsRoute from './routes/nodeStats.js'
import dockerLogsRoute from './routes/dockerLogs.js'
import servicesRoute from './routes/services.js'

const fastify = Fastify({ logger: true })

const PORT = process.env.PORT || 3000
export const LOKI_URL = process.env.LOKI_URL || 'http://loki:3100'

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production'

await fastify.register(cors, {
  origin: true,
  credentials: true,
})

await fastify.register(cookie)

await fastify.register(jwt, {
  secret: JWT_SECRET,
  cookie: { cookieName: 'rw_token', signed: false },
})

await fastify.register(rateLimit, {
  global: false,
})

// Auth routes (не требуют токена)
fastify.register(authRoute, { prefix: '/api' })

// Guard — все /api/* запросы кроме /api/auth/* требуют JWT
fastify.addHook('onRequest', async (req, reply) => {
  if (!req.url.startsWith('/api/')) return
  if (req.url.startsWith('/api/auth/')) return
  if (req.url.startsWith('/api/logs/ingest')) return
  try {
    await req.jwtVerify()
  } catch {
    reply.status(401)
    return reply.send({ error: 'Unauthorized' })
  }
})

fastify.register(nodesRoute,     { prefix: '/api' })
fastify.register(logsRoute,      { prefix: '/api' })
fastify.register(servicesRoute,  { prefix: '/api' })
fastify.register(metricsRoute,   { prefix: '/api' })
fastify.register(nodeStatsRoute, { prefix: '/api' })
fastify.register(dockerLogsRoute, { prefix: '/api' })

fastify.get('/health', async () => ({ ok: true }))

await fastify.listen({ port: Number(PORT), host: '0.0.0.0' })
