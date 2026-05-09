import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'data')
const FILE = join(DIR, 'log-deletions.json')

function load() {
  try { return JSON.parse(readFileSync(FILE, 'utf8')) }
  catch { return [] }
}

function save(items) {
  mkdirSync(DIR, { recursive: true })
  writeFileSync(FILE, JSON.stringify(items, null, 2))
}

export function addLogDeletionTombstone(item) {
  const items = load()
  items.push({
    service_name: item.service_name || '',
    node_name: item.node_name || '',
    source_type: item.source_type || '',
    container: item.container || '',
    deleted_at: new Date().toISOString(),
  })
  save(items)
}

export function findLatestMatchingTombstone(item) {
  const items = load()
    .filter(entry =>
      entry.service_name === (item.service_name || '') &&
      (!entry.node_name || entry.node_name === (item.node_name || '')) &&
      (!entry.source_type || entry.source_type === (item.source_type || '')) &&
      (!entry.container || entry.container === (item.container || ''))
    )
    .sort((a, b) => (a.deleted_at < b.deleted_at ? 1 : -1))

  return items[0] ?? null
}
