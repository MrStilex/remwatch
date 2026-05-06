import { readFileSync, writeFileSync } from 'fs'

const FILE = '/tmp/remwatch-deleted-nodes.json'

function load() {
  try { return new Set(JSON.parse(readFileSync(FILE, 'utf8'))) }
  catch { return new Set() }
}

function save(set) {
  writeFileSync(FILE, JSON.stringify([...set]))
}

const deleted = load()

export function isDeleted(name) { return deleted.has(name) }

export function markDeleted(name) {
  deleted.add(name)
  save(deleted)
}

export function unmarkDeleted(name) {
  deleted.delete(name)
  save(deleted)
}
