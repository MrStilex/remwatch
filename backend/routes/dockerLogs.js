import { spawn } from 'child_process'

const SSH_KEY = '/root/id_ed25519'

function parseLine(line) {
  // Strip ANSI escape codes
  const clean = line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')

  // Format: "container  | 2026-05-06T08:21:30.123Z message"
  const m = clean.match(/^(\S+)\s+\|\s+(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+(.*)$/)
  if (!m) return { container: '', ts: new Date().toISOString(), message: clean.trim(), level: 'info' }

  const [, container, ts, message] = m
  const level = /\bERROR\b/.test(message) ? 'error'
    : /\bWARN(?:ING)?\b/.test(message) ? 'warn'
    : 'info'

  return { container, ts, message: message.trim(), level }
}

export default async function dockerLogsRoute(fastify) {
  fastify.get('/docker-logs', async (req, reply) => {
    const { host, port = '22' } = req.query
    if (!host) { reply.status(400); return { error: 'host required' } }

    reply.raw.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const proc = spawn('ssh', [
      '-i', SSH_KEY,
      '-p', String(port),
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'LogLevel=ERROR',
      '-o', 'ServerAliveInterval=15',
      '-o', 'ConnectTimeout=10',
      `root@${host}`,
      'cd /opt/remnawave && docker compose logs -f -t --tail=100 2>&1',
    ])

    let buffer = ''

    proc.stdout.on('data', chunk => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        if (!line.trim()) continue
        const entry = parseLine(line)
        reply.raw.write(`data: ${JSON.stringify(entry)}\n\n`)
      }
    })

    proc.stderr.on('data', chunk => {
      const msg = chunk.toString().trim()
      if (msg) reply.raw.write(`data: ${JSON.stringify({ container: 'ssh', ts: new Date().toISOString(), message: msg, level: 'warn' })}\n\n`)
    })

    await new Promise(resolve => {
      proc.on('close', () => {
        reply.raw.write('event: end\ndata: {}\n\n')
        reply.raw.end()
        resolve()
      })
      req.raw.on('close', () => {
        proc.kill()
        resolve()
      })
    })
  })
}
