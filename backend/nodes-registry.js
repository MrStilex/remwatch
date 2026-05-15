import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const DIR  = join(dirname(fileURLToPath(import.meta.url)), 'data')
const FILE = join(DIR, 'nodes-registry.json')

function load() {
  try { return JSON.parse(readFileSync(FILE, 'utf8')) }
  catch { return [] }
}

function save(nodes) {
  mkdirSync(DIR, { recursive: true })
  writeFileSync(FILE, JSON.stringify(nodes, null, 2))
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export function getAll() { return load() }

export function addNode({ name, node_ip, country }) {
  const nodes = load()
  const node  = { id: genId(), name, node_ip: node_ip || null, country: country || '' }
  nodes.push(node)
  save(nodes)
  return node
}

export function removeNode(id) {
  save(load().filter(n => n.id !== id))
}

export function getById(id) {
  return load().find(n => n.id === id) ?? null
}

// Сохранить IP обнаруженный из Loki (для автомигрированных нод без IP)
export function patchNodeIp(id, node_ip) {
  const nodes = load()
  const node  = nodes.find(n => n.id === id)
  if (node && !node.node_ip && node_ip) {
    node.node_ip = node_ip
    save(nodes)
  }
}

export function getByName(name) {
  return load().find(n => n.name === name) ?? null
}

export function getRules(id) {
  return load().find(n => n.id === id)?.log_rules ?? []
}

export function addRule(id, { name, keywords }) {
  const nodes = load()
  const node  = nodes.find(n => n.id === id)
  if (!node) return null
  const rule = { id: genId(), name, keywords }
  node.log_rules = [...(node.log_rules ?? []), rule]
  save(nodes)
  return rule
}

export function removeRule(nodeId, ruleId) {
  const nodes = load()
  const node  = nodes.find(n => n.id === nodeId)
  if (!node) return
  node.log_rules = (node.log_rules ?? []).filter(r => r.id !== ruleId)
  save(nodes)
}
