// cpu_prev: node_ip -> { ts, idle, total }
const cpuPrev = new Map()

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
  const idle  = sum(m, 'node_cpu_seconds_total{') // filtered below
  let cpu_idle_total = 0, cpu_all_total = 0
  for (const [k, v] of Object.entries(m)) {
    if (!k.startsWith('node_cpu_seconds_total{')) continue
    cpu_all_total += v
    if (k.includes('mode="idle"')) cpu_idle_total += v
  }

  let cpu_percent = null
  const prev = cpuPrev.get(node_ip)
  if (prev && now - prev.ts < 120_000) {
    const dTotal = cpu_all_total - prev.total
    const dIdle  = cpu_idle_total - prev.idle
    if (dTotal > 0) cpu_percent = Math.round((1 - dIdle / dTotal) * 100)
  }
  cpuPrev.set(node_ip, { ts: now, idle: cpu_idle_total, total: cpu_all_total })

  return { cpu_percent, ram_used, ram_total, disk_used, disk_total }
}
