import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import AddNodeModal from '../components/AddNodeModal'
import styles from './Nodes.module.css'

const API = import.meta.env.VITE_API_URL ?? '/api'

const COLUMNS = [
  { key: 'status',    label: 'Статус' },
  { key: 'name',      label: 'Нода' },
  { key: 'country',   label: 'Страна' },
  { key: 'ip',        label: 'IP' },
  { key: 'cpu',       label: 'CPU' },
  { key: 'ram',       label: 'RAM' },
  { key: 'disk',      label: 'Disk' },
  { key: 'errors',    label: 'Ошибок / 1ч' },
  { key: 'last_seen', label: 'Посл. лог' },
]

const DEFAULT_VISIBLE = Object.fromEntries(COLUMNS.map(c => [c.key, true]))

function loadVisible() {
  try {
    const saved = JSON.parse(localStorage.getItem('rw_nodes_cols') || 'null')
    if (saved && typeof saved === 'object') return { ...DEFAULT_VISIBLE, ...saved }
  } catch {}
  return { ...DEFAULT_VISIBLE }
}

function timeSince(iso) {
  if (!iso) return '—'
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (diff < 60) return `${diff}с назад`
  if (diff < 3600) return `${Math.floor(diff / 60)}м назад`
  if (diff < 86400) return `${Math.floor(diff / 3600)}ч назад`
  return `${Math.floor(diff / 86400)}д назад`
}

function Pct({ pct, warn = 70, danger = 90 }) {
  if (pct == null) return <span className={styles.na}>—</span>
  const cls = pct >= danger ? styles.pctDanger : pct >= warn ? styles.pctWarn : styles.pctOk
  return <span className={cls}>{pct}%</span>
}

function sortNodes(nodes, col, dir) {
  if (!col) return nodes
  const mult = dir === 'asc' ? 1 : -1
  return [...nodes].sort((a, b) => {
    let av, bv
    switch (col) {
      case 'status':
        av = a.status === 'online' ? 0 : 1
        bv = b.status === 'online' ? 0 : 1
        break
      case 'name':    av = a.name ?? ''; bv = b.name ?? ''; break
      case 'country': av = a.country ?? ''; bv = b.country ?? ''; break
      case 'ip':      av = a.node_ip ?? ''; bv = b.node_ip ?? ''; break
      case 'cpu':     av = a.cpu_percent ?? -1; bv = b.cpu_percent ?? -1; break
      case 'ram':
        av = a.ram_total ? a.ram_used / a.ram_total : -1
        bv = b.ram_total ? b.ram_used / b.ram_total : -1
        break
      case 'disk':
        av = a.disk_total ? a.disk_used / a.disk_total : -1
        bv = b.disk_total ? b.disk_used / b.disk_total : -1
        break
      case 'errors':    av = a.errors_1h ?? 0; bv = b.errors_1h ?? 0; break
      case 'last_seen': av = a.last_seen ?? ''; bv = b.last_seen ?? ''; break
      default: return 0
    }
    if (av < bv) return -mult
    if (av > bv) return  mult
    return 0
  })
}

function SortIcon({ active, dir }) {
  if (!active) return <span className={styles.sortIdle}>↕</span>
  return <span className={styles.sortActive}>{dir === 'asc' ? '↑' : '↓'}</span>
}

export default function Nodes() {
  const navigate = useNavigate()
  const [showModal, setShowModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [nodes, setNodes]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [visible, setVisible] = useState(loadVisible)
  const settingsRef = useRef(null)

  async function load() {
    try {
      const res = await fetch(`${API}/nodes`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setNodes(await res.json())
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function deleteNode(name) {
    if (!confirm(`Удалить ноду «${name}» и все её логи из Loki?`)) return
    setDeleting(name)
    try {
      const res = await fetch(`${API}/nodes/${encodeURIComponent(name)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await load()
    } catch (e) {
      alert(`Ошибка удаления: ${e.message}`)
    } finally {
      setDeleting(null)
    }
  }

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  function toggleCol(key) {
    setVisible(prev => {
      const next = { ...prev, [key]: !prev[key] }
      localStorage.setItem('rw_nodes_cols', JSON.stringify(next))
      return next
    })
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!showSettings) return
    function onClick(e) {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setShowSettings(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showSettings])

  const sorted = sortNodes(nodes, sortCol, sortDir)

  function Th({ col, children }) {
    return (
      <th className={styles.thSortable} onClick={() => handleSort(col)}>
        {children}
        <SortIcon active={sortCol === col} dir={sortDir} />
      </th>
    )
  }

  return (
    <main className="page">
      <div className={styles.header}>
        <h1>Ноды</h1>
        <div className={styles.headerActions}>
          <div className={styles.settingsWrap} ref={settingsRef}>
            <button className={styles.settingsBtn} onClick={() => setShowSettings(v => !v)} title="Настройка колонок">
              ⚙ Колонки
            </button>
            {showSettings && (
              <div className={styles.settingsDropdown}>
                <div className={styles.settingsTitle}>Видимость колонок</div>
                {COLUMNS.map(c => (
                  <label key={c.key} className={styles.settingsRow}>
                    <input
                      type="checkbox"
                      checked={!!visible[c.key]}
                      onChange={() => toggleCol(c.key)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            + Добавить ноду
          </button>
        </div>
      </div>

      {loading && <p className={styles.hint}>Загрузка...</p>}
      {error   && <p className={styles.error}>Ошибка: {error}</p>}
      {!loading && !error && nodes.length === 0 && (
        <p className={styles.hint}>Нет подключённых нод.</p>
      )}

      {nodes.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {visible.status    && <Th col="status">Статус</Th>}
                {visible.name      && <Th col="name">Нода</Th>}
                {visible.country   && <Th col="country">Страна</Th>}
                {visible.ip        && <Th col="ip">IP</Th>}
                {visible.cpu       && <Th col="cpu">CPU</Th>}
                {visible.ram       && <Th col="ram">RAM</Th>}
                {visible.disk      && <Th col="disk">Disk</Th>}
                {visible.errors    && <Th col="errors">Ошибок / 1ч</Th>}
                {visible.last_seen && <Th col="last_seen">Посл. лог</Th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(n => {
                const ramPct  = n.ram_total  ? Math.round(n.ram_used  / n.ram_total  * 100) : null
                const diskPct = n.disk_total ? Math.round(n.disk_used / n.disk_total * 100) : null
                return (
                  <tr key={n.name}>
                    {visible.status && (
                      <td>
                        <span className={`${styles.dot} ${styles[n.status]}`} />
                        {n.status === 'online' ? 'Online' : 'Offline'}
                      </td>
                    )}
                    {visible.name      && (
                      <td
                        className={`${styles.name} ${styles.nameLink}`}
                        onClick={() => navigate(`/nodes/${encodeURIComponent(n.name)}`)}
                      >{n.name}</td>
                    )}
                    {visible.country   && <td>{n.country || '—'}</td>}
                    {visible.ip        && <td className={styles.mono}>{n.node_ip || '—'}</td>}
                    {visible.cpu       && <td><Pct pct={n.cpu_percent} /></td>}
                    {visible.ram       && <td><Pct pct={ramPct} /></td>}
                    {visible.disk      && <td><Pct pct={diskPct} warn={80} danger={90} /></td>}
                    {visible.errors    && <td className={n.errors_1h > 0 ? styles.errCount : ''}>{n.errors_1h}</td>}
                    {visible.last_seen && <td className={styles.mono}>{timeSince(n.last_seen)}</td>}
                    <td>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => deleteNode(n.name)}
                        disabled={deleting === n.name}
                        title="Удалить ноду и все её логи"
                      >{deleting === n.name ? '...' : '✕'}</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <AddNodeModal onClose={() => setShowModal(false)} />}
    </main>
  )
}
