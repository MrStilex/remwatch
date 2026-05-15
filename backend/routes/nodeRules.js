import { LOKI_URL } from '../index.js'
import { getByName, getRules, addRule, removeRule } from '../nodes-registry.js'

async function countMatches(nodeName, keywords, hours) {
  const pattern = keywords
    .map(k => k.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .filter(Boolean)
    .join('|')
  if (!pattern) return 0

  const now   = Math.floor(Date.now() / 1000)
  const start = (now - hours * 3600) * 1e9
  const end   = now * 1e9

  const body = new URLSearchParams({
    query: `sum(count_over_time({node_name="${nodeName}"} |~ \`(?i)${pattern}\` [${hours}h]))`,
    time:  String(end),
  })
  try {
    const res  = await fetch(`${LOKI_URL}/loki/api/v1/query`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) return 0
    const data = await res.json()
    return Number(data.data?.result?.[0]?.value?.[1] ?? 0)
  } catch {
    return 0
  }
}

export default async function nodeRulesRoute(fastify) {
  // GET /api/node-rules?node=NAME&hours=24
  fastify.get('/node-rules', async (req, reply) => {
    const { node, hours = '24' } = req.query
    if (!node) { reply.status(400); return { error: 'node required' } }

    const reg = getByName(node)
    if (!reg) { reply.status(404); return { error: 'node not found' } }

    const h     = Math.min(Math.max(Number(hours) || 24, 1), 168)
    const rules = getRules(reg.id)

    const counts = await Promise.all(
      rules.map(r => countMatches(node, r.keywords, h).then(count => ({ id: r.id, count })))
    )
    const countMap = Object.fromEntries(counts.map(c => [c.id, c.count]))

    return { rules, counts: countMap, hours: h }
  })

  // POST /api/node-rules?node=NAME  { name, keywords: "word1, word2" }
  fastify.post('/node-rules', async (req, reply) => {
    const { node } = req.query
    if (!node) { reply.status(400); return { error: 'node required' } }

    const reg = getByName(node)
    if (!reg) { reply.status(404); return { error: 'node not found' } }

    const { name, keywords } = req.body ?? {}
    if (!name?.trim()) { reply.status(400); return { error: 'name required' } }

    const kws = String(keywords ?? '')
      .split(',')
      .map(k => k.trim())
      .filter(Boolean)
    if (!kws.length) { reply.status(400); return { error: 'keywords required' } }

    const rule = addRule(reg.id, { name: name.trim(), keywords: kws })
    reply.status(201)
    return rule
  })

  // DELETE /api/node-rules?node=NAME&ruleId=XXX
  fastify.delete('/node-rules', async (req, reply) => {
    const { node, ruleId } = req.query
    if (!node || !ruleId) { reply.status(400); return { error: 'node and ruleId required' } }

    const reg = getByName(node)
    if (!reg) { reply.status(404); return { error: 'node not found' } }

    removeRule(reg.id, ruleId)
    return { ok: true }
  })
}
