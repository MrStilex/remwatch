// prev state: node_ip -> { ts, cpu_idle, cpu_total, net_rx, net_tx }
const prev = new Map()

// Background poller: keeps delta data fresh so first API call already has values
const knownIps = new Set()

async function pollIp(ip) {
  try { await scrapeSystem(ip) } catch {}
}

export function registerIpsForPolling(ips) {
  const newIps = ips.filter(ip => ip && !knownIps.has(ip))
  for (const ip of newIps) {
    knownIps.add(ip)
    // Warmup: two immediate scrapes with 5s gap to establish delta
    pollIp(ip)
    setTimeout(() => pollIp(ip), 5_000)
  }
}

setInterval(() => {
  for (const ip of knownIps) pollIp(ip)
}, 20_000)

const NET_SKIP = /^(lo|docker|veth|br-|tun|dummy|virbr|cni|flannel|cilium)/

function parseLines(text) {
  const out = {}
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const spaceIdx = line.lastIndexOf(' ')
    if (spaceIdx === -1) continue
    const key = line.slice(0, spaceIdx)
    const val = parseFloat(line.slice(spaceIdx + 1))
    if (!isNaN(val)) out[key] = val
  }
  return out
}

function get(m, prefix) {
  for (const [k, v] of Object.entries(m)) {
    if (k === prefix || k.startsWith(prefix + '{')) return v
  }
  return null
}

function sum(m, prefix) {
  let total = 0
  for (const [k, v] of Object.entries(m)) {
    if (k === prefix || k.startsWith(prefix + '{')) total += v
  }
  return total
}

function getRootFs(m, metric) {
  for (const [k, v] of Object.entries(m)) {
    if (!k.startsWith(metric + '{')) continue
    if (k.includes('mountpoint="/"') && !k.includes('fstype="tmpfs"') && !k.includes('fstype="overlay"')) return v
  }
  return null
}

export async function scrapeSystem(node_ip) {
  let text
  try {
    const res = await fetch(`http://${node_ip}:9100/metrics`, {
      signal: AbortSignal.timeout(2500),
    })
    if (!res.ok) return null
    text = await res.text()
  } catch {
    return null
  }

  const m = parseLines(text)

  // ── RAM ────────────────────────────────────────────────────────────────────
  const ram_total = get(m, 'node_memory_MemTotal_bytes')
  const ram_avail = get(m, 'node_memory_MemAvailable_bytes')
  const ram_used  = ram_total != null && ram_avail != null ? ram_total - ram_avail : null

  // ── Disk (root /) ──────────────────────────────────────────────────────────
  const disk_total = getRootFs(m, 'node_filesystem_size_bytes')
  const disk_avail = getRootFs(m, 'node_filesystem_avail_bytes')
  const disk_used  = disk_total != null && disk_avail != null ? disk_total - disk_avail : null

  // ── CPU (delta between calls) ──────────────────────────────────────────────
  const now = Date.now()
  let cpu_idle_total = 0, cpu_all_total = 0
  for (const [k, v] of Object.entries(m)) {
    if (!k.startsWith('node_cpu_seconds_total{')) continue
    cpu_all_total += v
    if (k.includes('mode="idle"')) cpu_idle_total += v
  }

  // ── Network (delta between calls) ─────────────────────────────────────────
  // Sum all non-virtual interfaces
  let net_rx = 0, net_tx = 0
  for (const [k, v] of Object.entries(m)) {
    const rxMatch = k.match(/^node_network_receive_bytes_total\{device="([^"]+)"/)
    const txMatch = k.match(/^node_network_transmit_bytes_total\{device="([^"]+)"/)
    if (rxMatch && !NET_SKIP.test(rxMatch[1])) net_rx += v
    if (txMatch && !NET_SKIP.test(txMatch[1])) net_tx += v
  }

  let cpu_percent = null, net_rx_bps = null, net_tx_bps = null
  const p = prev.get(node_ip)
  if (p && now - p.ts < 120_000) {
    const dtSec = (now - p.ts) / 1000
    const dCpuTotal = cpu_all_total - p.cpu_total
    const dCpuIdle  = cpu_idle_total - p.cpu_idle
    if (dCpuTotal > 0) cpu_percent = Math.round((1 - dCpuIdle / dCpuTotal) * 100)
    if (net_rx >= p.net_rx) net_rx_bps = Math.round((net_rx - p.net_rx) / dtSec)
    if (net_tx >= p.net_tx) net_tx_bps = Math.round((net_tx - p.net_tx) / dtSec)
  }
  prev.set(node_ip, { ts: now, cpu_idle: cpu_idle_total, cpu_total: cpu_all_total, net_rx, net_tx })

  return { cpu_percent, ram_used, ram_total, disk_used, disk_total, net_rx_bps, net_tx_bps }
}
