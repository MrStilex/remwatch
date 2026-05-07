import { useState, useEffect, useCallback } from 'react'
import styles from './PanelMetrics.module.css'

const API = import.meta.env.VITE_API_URL ?? '/api'

function fmtBytes(b) {
  if (b == null) return '—'
  if (b >= 1e12) return (b / 1e12).toFixed(2) + ' TB'
  if (b >= 1e9)  return (b / 1e9).toFixed(2)  + ' GB'
  if (b >= 1e6)  return (b / 1e6).toFixed(1)  + ' MB'
  return b + ' B'
}

function fmtRate(bps) {
  if (bps == null) return '—'
  return `${(bps / 1e6).toFixed(2)} MB/s`
}

function pct(used, total) {
  if (!used || !total) return null
  return Math.round(used / total * 100)
}

function PctBadge({ value, warn = 70, danger = 90 }) {
  if (value == null) return <span className={styles.na}>—</span>
  const cls = value >= danger ? styles.pctDanger : value >= warn ? styles.pctWarn : styles.pctOk
  return <span className={cls}>{value}%</span>
}

function CollapseSection({ title, open, onToggle, children }) {
  return (
    <div className={styles.section}>
      <button className={styles.sectionToggle} onClick={onToggle}>
        <span>{title}</span>
        <span className={styles.chevron}>{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </div>
  )
}

export default function PanelMetrics({ panel }) {
  const [data, setData]       = useState(null)
  const [error, setError]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [metricsOpen, setMetricsOpen] = useState(true)
  const [systemOpen,  setSystemOpen]  = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: panel.url, user: panel.user, pass: panel.pass }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setData(await res.json())
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [panel.url, panel.user, panel.pass])

  useEffect(() => {
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [load])

  if (loading) return <div className={styles.state}>Загрузка...</div>
  if (error)   return <div className={styles.stateErr}>Ошибка: {error}</div>
  if (!data)   return null

  const { online, users, nodes, system } = data
  const ramPct  = pct(system?.ram_used,  system?.ram_total)
  const diskPct = pct(system?.disk_used, system?.disk_total)

  return (
    <div className={styles.wrap}>

      <CollapseSection title="Метрики" open={metricsOpen} onToggle={() => setMetricsOpen(v => !v)}>
        <div className={styles.statGrid}>
          <div className={`${styles.stat} ${styles.statNeutral}`}>
            <span className={styles.statVal}>{users.total}</span>
            <span className={styles.statLabel}>Всего</span>
          </div>
          <div className={`${styles.stat} ${styles.statSuccess}`}>
            <span className={`${styles.statVal} ${styles.green}`}>{users.active}</span>
            <span className={styles.statLabel}>Активных</span>
          </div>
          <div className={`${styles.stat} ${styles.statWarn}`}>
            <span className={`${styles.statVal} ${styles.yellow}`}>{users.limited}</span>
            <span className={styles.statLabel}>Ограничено</span>
          </div>
          <div className={`${styles.stat} ${styles.statDanger}`}>
            <span className={`${styles.statVal} ${styles.danger}`}>{users.expired}</span>
            <span className={styles.statLabel}>Истекло</span>
          </div>
        </div>

        <div className={styles.subTitle}>Онлайн</div>
        <div className={styles.onlineGrid}>
          <div className={styles.onlineStat}>
            <span className={`${styles.onlineVal} ${styles.green}`}>{online.now}</span>
            <span className={styles.onlineLabel}>Сейчас</span>
          </div>
          <div className={styles.onlineStat}>
            <span className={styles.onlineVal}>{online.today}</span>
            <span className={styles.onlineLabel}>За день</span>
          </div>
          <div className={styles.onlineStat}>
            <span className={styles.onlineVal}>{online.this_week}</span>
            <span className={styles.onlineLabel}>За неделю</span>
          </div>
          <div className={styles.onlineStat}>
            <span className={`${styles.onlineVal} ${styles.muted}`}>{online.never}</span>
            <span className={styles.onlineLabel}>Не были</span>
          </div>
        </div>

        <div className={styles.subTitle}>Ноды</div>
        <div className={styles.nodesTableWrap}>
          <table className={styles.nodesTable}>
            <thead>
              <tr>
                <th>Статус</th>
                <th>Нода</th>
                <th>Онлайн</th>
                <th>Traffic Total</th>
                <th>Traffic Speed</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map(node => (
                <tr key={node.name} className={node.status ? '' : styles.nodeOffline}>
                  <td>
                    <span className={styles.nodeStatus}>
                      <span className={`${styles.nodeDot} ${node.status ? styles.dotOnline : styles.dotOffline}`} />
                      <span className={node.status ? styles.statusOnline : styles.statusOffline}>
                        {node.status ? 'Online' : 'Offline'}
                      </span>
                    </span>
                  </td>
                  <td className={styles.nodeNameCell}>{node.name}</td>
                  <td><span className={styles.nodeUsers}>{node.status ? node.online_users : '—'}</span></td>
                  <td className={styles.nodeTraffic}>
                    ↑ {fmtBytes(node.upload_bytes)} · ↓ {fmtBytes(node.download_bytes)}
                  </td>
                  <td className={styles.nodeTrafficSpeed}>
                    ↑ {fmtRate(node.upload_bps)} · ↓ {fmtRate(node.download_bps)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapseSection>

      {system && (
        <CollapseSection title="Система" open={systemOpen} onToggle={() => setSystemOpen(v => !v)}>
          <div className={styles.sysGrid}>
            <div className={styles.sysStat}>
              <span className={styles.sysLabel}>CPU</span>
              <PctBadge value={system.cpu_percent} />
            </div>
            <div className={styles.sysStat}>
              <span className={styles.sysLabel}>RAM</span>
              <PctBadge value={ramPct} />
              <span className={styles.sysSub}>{fmtBytes(system.ram_used)} / {fmtBytes(system.ram_total)}</span>
            </div>
            <div className={styles.sysStat}>
              <span className={styles.sysLabel}>Disk</span>
              <PctBadge value={diskPct} warn={80} danger={90} />
              <span className={styles.sysSub}>{fmtBytes(system.disk_used)} / {fmtBytes(system.disk_total)}</span>
            </div>
          </div>
        </CollapseSection>
      )}

    </div>
  )
}
