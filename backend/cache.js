const store = new Map()

export function getCached(key) {
  const entry = store.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > entry.ttl) { store.delete(key); return null }
  return entry.data
}

export function setCached(key, data, ttlMs = 25_000) {
  store.set(key, { data, ts: Date.now(), ttl: ttlMs })
}

export function invalidate(key) {
  store.delete(key)
}
