import { useEffect, useState } from 'react'
import styles from './Alerts.module.css'

const API = import.meta.env.VITE_API_URL ?? '/api'

function fmtTs(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('ru-RU')
  } catch {
    return iso
  }
}

export default function Alerts() {
  const [since, setSince] = useState('1h')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [deletingKey, setDeletingKey] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function loadSources() {
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const params = new URLSearchParams()
      params.set('since', since)

      const res = await fetch(`${API}/logs/files?${params.toString()}`, { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = await res.json()
      setItems(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err?.message || 'Не удалось загрузить логи')
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSources()
  }, [])

  async function deleteSource(item) {
    const key = `${item.service_name}|${item.node_name}|${item.source_type}|${item.container}`
    const isWideDelete = item.delete_scope !== 'exact'
    const ok = window.confirm(
      isWideDelete
        ? `Удалить логи по service_name?\nservice=${item.service_name}\n\nВнимание: будут затронуты все потоки этого сервиса.`
        : `Удалить логи источника?\nservice=${item.service_name}\nnode=${item.node_name}\nsource=${item.source_type}\ncontainer=${item.container}`
    )
    if (!ok) return

    setDeletingKey(key)
    setError('')
    setNotice('')
    try {
      const params = new URLSearchParams({
        service_name: item.service_name || '',
        node_name: item.node_name || '',
        source_type: item.source_type || '',
        container: item.container || '',
      })

      const res = await fetch(`${API}/logs/files/delete?${params.toString()}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_name: item.service_name,
          node_name: item.node_name,
          source_type: item.source_type,
          container: item.container,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      setNotice('Удаление поставлено в очередь Loki.')
      await loadSources()
    } catch (err) {
      setError(err?.message || 'Не удалось удалить логи')
    } finally {
      setDeletingKey('')
    }
  }

  return (
    <main className={`page ${styles.page}`}>
      <div className={styles.header}>
        <h1>Logs</h1>
      </div>

      <div className={styles.controls}>
        <select className={styles.input} value={since} onChange={e => setSince(e.target.value)}>
          <option value="15m">15m</option>
          <option value="1h">1h</option>
          <option value="6h">6h</option>
          <option value="24h">24h</option>
          <option value="7d">7d</option>
          <option value="all">All</option>
        </select>
        <button className="btn-primary" type="button" onClick={loadSources} disabled={loading}>
          {loading ? 'Загрузка...' : 'Показать'}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {notice && <p className={styles.notice}>{notice}</p>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Service</th>
              <th>Node</th>
              <th>IP</th>
              <th>Type</th>
              <th>Файл / Unit</th>
              <th>Last Update</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={`${item.service_name}-${item.node_name}-${item.container}-${idx}`}>
                <td>{item.service_name || '—'}</td>
                <td>{item.node_name || '—'}</td>
                <td>{item.node_ip || '—'}</td>
                <td>{item.source_type || '—'}</td>
                <td className={styles.pathCell}>{item.source_path || item.container || '—'}</td>
                <td>{fmtTs(item.last_seen)}</td>
                <td>{item.binding_status || (item.last_seen ? 'active' : 'discovered')}</td>
                <td>
                  <button
                    className={styles.deleteBtn}
                    type="button"
                    onClick={() => deleteSource(item)}
                    disabled={deletingKey === `${item.service_name}|${item.node_name}|${item.source_type}|${item.container}`}
                  >
                    {deletingKey === `${item.service_name}|${item.node_name}|${item.source_type}|${item.container}` ? 'Удаление...' : 'Удалить'}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan="8" className={styles.empty}>Нет лог-источников.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}
