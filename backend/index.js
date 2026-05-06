import Fastify from 'fastify'
import cors from '@fastify/cors'
import nodesRoute     from './routes/nodes.js'
import logsRoute      from './routes/logs.js'
import metricsRoute   from './routes/metrics.js'
import nodeStatsRoute from './routes/nodeStats.js'

const fastify = Fastify({ logger: true })

const PORT = process.env.PORT || 3000
export const LOKI_URL = process.env.LOKI_URL || 'http://loki:3100'

await fastify.register(cors, { origin: true })

fastify.register(nodesRoute,     { prefix: '/api' })
fastify.register(logsRoute,      { prefix: '/api' })
fastify.register(metricsRoute,   { prefix: '/api' })
fastify.register(nodeStatsRoute, { prefix: '/api' })

fastify.get('/health', async () => ({ ok: true }))

await fastify.listen({ port: Number(PORT), host: '0.0.0.0' })
