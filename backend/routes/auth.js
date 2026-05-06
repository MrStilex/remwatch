import bcrypt from 'bcryptjs'
import { getPasswordHash, isFirstLogin, saveNewPassword } from '../auth-store.js'

// IP lockout: ip -> { count, firstFail, blockedUntil }
const ipState = new Map()
const MAX_ATTEMPTS = 10
const LOCKOUT_MS   = 60 * 60 * 1000  // 1 час
const WINDOW_MS    = 15 * 60 * 1000  // 15 минут

function checkLockout(ip) {
  const s = ipState.get(ip)
  if (!s) return null
  if (s.blockedUntil && Date.now() < s.blockedUntil) {
    const left = Math.ceil((s.blockedUntil - Date.now()) / 60_000)
    return `IP заблокирован на ${left} мин.`
  }
  return null
}

function recordFail(ip) {
  const now = Date.now()
  const s = ipState.get(ip) ?? { count: 0, firstFail: now, blockedUntil: null }
  if (now - s.firstFail > WINDOW_MS) { s.count = 0; s.firstFail = now }
  s.count++
  if (s.count >= MAX_ATTEMPTS) s.blockedUntil = now + LOCKOUT_MS
  ipState.set(ip, s)
}

function recordSuccess(ip) { ipState.delete(ip) }

function setTokenCookie(reply, token) {
  reply.setCookie('rw_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 3600,
    // secure: true  // раскомментировать при HTTPS
  })
}

export default async function authRoute(fastify) {

  // POST /api/auth/login
  fastify.post('/auth/login', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (req, reply) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.ip

    const locked = checkLockout(ip)
    if (locked) { reply.status(429); return { error: locked } }

    const { password } = req.body ?? {}
    const hash = getPasswordHash()
    if (!password || !hash) { reply.status(400); return { error: 'Неверный запрос' } }

    const ok = await bcrypt.compare(password, hash)
    if (!ok) {
      recordFail(ip)
      const left = MAX_ATTEMPTS - (ipState.get(ip)?.count ?? 0)
      reply.status(401)
      return { error: `Неверный пароль. Осталось попыток: ${left}` }
    }

    recordSuccess(ip)
    const token = fastify.jwt.sign({ sub: 'admin' }, { expiresIn: '7d' })
    setTokenCookie(reply, token)

    return { ok: true, firstLogin: isFirstLogin() }
  })

  // POST /api/auth/logout
  fastify.post('/auth/logout', async (req, reply) => {
    reply.clearCookie('rw_token', { path: '/' })
    return { ok: true }
  })

  // GET /api/auth/check — возвращает firstLogin флаг
  fastify.get('/auth/check', async (req, reply) => {
    try {
      await req.jwtVerify()
      return { ok: true, firstLogin: isFirstLogin() }
    } catch {
      reply.status(401)
      return { ok: false }
    }
  })

  // POST /api/auth/change-password — требует JWT
  fastify.post('/auth/change-password', async (req, reply) => {
    try { await req.jwtVerify() } catch {
      reply.status(401); return { error: 'Unauthorized' }
    }

    const { currentPassword, newPassword } = req.body ?? {}
    if (!currentPassword || !newPassword) {
      reply.status(400); return { error: 'Заполните все поля' }
    }
    if (newPassword.length < 8) {
      reply.status(400); return { error: 'Минимум 8 символов' }
    }

    const hash = getPasswordHash()
    const ok = await bcrypt.compare(currentPassword, hash)
    if (!ok) { reply.status(401); return { error: 'Текущий пароль неверный' } }

    const newHash = await bcrypt.hash(newPassword, 12)
    saveNewPassword(newHash)

    // Перевыпускаем токен
    const token = fastify.jwt.sign({ sub: 'admin' }, { expiresIn: '7d' })
    setTokenCookie(reply, token)

    return { ok: true }
  })
}
