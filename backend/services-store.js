import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { randomBytes, createHash } from 'crypto'

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'data')
const FILE = join(DIR, 'services-registry.json')

function load() {
  try { return JSON.parse(readFileSync(FILE, 'utf8')) }
  catch { return [] }
}

function save(services) {
  mkdirSync(DIR, { recursive: true })
  writeFileSync(FILE, JSON.stringify(services, null, 2))
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

export function serviceContainerValue(service) {
  if (service.source_type === 'systemd') return service.service_unit || ''
  if (service.source_type === 'file') return service.log_path || service.service_name || ''
  if (service.source_type === 'node') return 'remnanode'
  return service.service_name || ''
}

export function issueServiceToken() {
  const token = `rwl_${randomBytes(24).toString('base64url')}`
  return {
    token,
    token_hash: hashToken(token),
    token_prefix: token.slice(0, 16),
  }
}

export function getAllServices() {
  return load()
}

export function getServiceById(id) {
  return load().find(service => service.id === id) ?? null
}

export function getServiceByToken(token) {
  const tokenHash = hashToken(token)
  return load().find(service => service.token_hash === tokenHash) ?? null
}

export function createService(data) {
  const services = load()
  const tokenInfo = issueServiceToken()
  const service = {
    id: genId(),
    service_name: data.service_name,
    node_name: data.node_name || '',
    node_ip: data.node_ip || '',
    country: data.country || '',
    environment: data.environment || 'production',
    source_type: data.source_type,
    service_unit: data.service_unit || '',
    log_path: data.log_path || '',
    status: 'active',
    token_prefix: tokenInfo.token_prefix,
    token_hash: tokenInfo.token_hash,
    created_at: new Date().toISOString(),
    revoked_at: null,
    last_seen_at: null,
  }
  services.push(service)
  save(services)
  return { service, token: tokenInfo.token }
}

export function sanitizeService(service) {
  if (!service) return null
  const { token_hash, ...safe } = service
  return safe
}

export function revokeService(id) {
  const services = load()
  const service = services.find(item => item.id === id)
  if (!service) return null
  service.status = 'revoked'
  service.revoked_at = new Date().toISOString()
  save(services)
  return service
}

export function deleteService(id) {
  const services = load()
  const target = services.find(service => service.id === id) ?? null
  save(services.filter(service => service.id !== id))
  return target
}

export function deleteMatchingServices(match) {
  const services = load()
  const removed = []
  const kept = []

  for (const service of services) {
    if (service.service_name !== (match.service_name || '')) {
      kept.push(service)
      continue
    }
    if (match.node_name && service.node_name !== match.node_name) {
      kept.push(service)
      continue
    }
    if (match.source_type && service.source_type !== match.source_type) {
      kept.push(service)
      continue
    }

    const serviceContainer = serviceContainerValue(service)

    if (match.container && serviceContainer !== match.container) {
      kept.push(service)
      continue
    }

    removed.push(service)
  }

  if (removed.length > 0) save(kept)
  return removed
}

export function touchServiceLastSeen(id) {
  const services = load()
  const service = services.find(item => item.id === id)
  if (!service) return null
  service.last_seen_at = new Date().toISOString()
  save(services)
  return service
}

export function clearMatchingServicesLastSeen(match) {
  const services = load()
  let changed = false

  for (const service of services) {
    if (service.service_name !== (match.service_name || '')) continue
    if (match.node_name && service.node_name !== match.node_name) continue
    if (match.source_type && service.source_type !== match.source_type) continue

    const serviceContainer = serviceContainerValue(service)

    if (match.container && serviceContainer !== match.container) continue

    if (service.last_seen_at !== null) {
      service.last_seen_at = null
      changed = true
    }
  }

  if (changed) save(services)
  return changed
}
