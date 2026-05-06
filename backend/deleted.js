import { readFileSync, writeFileSync } from 'fs'

const FILE = '/tmp/remwatch-deleted-nodes.json'

function load() {
  try {
    const raw = JSON.parse(readFileSync(FILE, 'utf8'))
    // Поддержка старого формата (массив строк) и нового (объект name->timestamp)
    if (Array.isArray(raw)) {
      const map = {}
      for (const name of raw) map[name] = 0
      return map
    }
    return raw
  } catch {
    return {}
  }
}

function save(map) {
  writeFileSync(FILE, JSON.stringify(map))
}

let deleted = load()

export function isDeleted(name)    { return name in deleted }
export function getDeletedAt(name) { return deleted[name] ?? 0 }

export function markDeleted(name) {
  deleted[name] = Date.now()
  save(deleted)
}

export function unmarkDeleted(name) {
  delete deleted[name]
  save(deleted)
}
