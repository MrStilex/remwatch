import { useMemo, useState } from 'react'
import styles from './Logs.module.css'
import JournalServiceManagerModal from '../components/JournalServiceManagerModal'

const API = import.meta.env.VITE_API_URL ?? '/api'

function fmtTs(iso) {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso ?? ''
  }
}

export default function Logs() {
  const [query, setQuery] = useState('')
  const [node, setNode] = useState('')
  const [serviceName, setServiceName] = useState('')
  const [level, setLevel] = useState('')
  const [periodMode, setPeriodMode] = useState('preset') // preset | all | custom
  const [since, setSince] = useState('24h')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [limit, setLimit] = useState('500')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showManager, setShowManager] = useState(false)

  const hasFilters = useMemo(
    () => !!query || !!node || !!serviceName || !!level || periodMode !== 'preset' || since !== '24h',
    [query, node, serviceName, level, periodMode, since]
  )

  async function searchLogs(e) {
    e?.preventDefault?.()
    setLoading(true)
    setError('')
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 20_000)
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set('search', query.trim())
      if (node.trim()) params.set('node', node.trim())
      if (serviceName.trim()) params.set('service_name', serviceName.trim())
      if (level) params.set('level', level)
      params.set('limit', limit)

      if (periodMode === 'all') {
        params.set('since', 'all')
      } else if (periodMode === 'custom' && start && end) {
        params.set('start', new Date(start).toISOString())
        params.set('end', new Date(end).toISOString())
      } else {
        params.set('since', since)
      }

      const res = await fetch(`${API}/logs?${params}`, {
        credentials: 'include',
        signal: ctrl.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setRows(await res.json())
    } catch (err) {
      if (err?.name === 'AbortError') {
        setError('Запрос к логам превысил 20 секунд. Сузь период или добавь фильтры.')
      } else {
        setError(err.message || 'Ошибка загрузки логов')
      }
    } finally {
      clearTimeout(timeout)
      setLoading(false)
    }
  }

  function resetFilters() {
    setQuery('')
    setNode('')
    setServiceName('')
    setLevel('')
    setPeriodMode('preset')
    setSince('24h')
    setStart('')
    setEnd('')
    setLimit('500')
    setRows([])
    setError('')
  }

  return (
    <main className={`page ${styles.logsPage}`}>
      <div className={styles.header}>
        <div>
          <h1>Website/Bot Journal</h1>
        </div>
        <button className={`btn-primary ${styles.addServiceBtn}`} type="button" onClick={() => setShowManager(true)}>
          Управление
        </button>
      </div>

      <form className={styles.filters} onSubmit={searchLogs}>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span>Поиск</span>
            <input
              className={styles.input}
              placeholder="Ошибка, user_id, endpoint..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span>Node Name</span>
            <input
              className={styles.input}
              placeholder="например: Germany #3"
              value={node}
              onChange={e => setNode(e.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span>Service Name</span>
            <input
              className={styles.input}
              placeholder="например: subscription-page"
              value={serviceName}
              onChange={e => setServiceName(e.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span>Level</span>
            <select className={styles.input} value={level} onChange={e => setLevel(e.target.value)}>
              <option value="">Любой</option>
              <option value="info">info</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
            </select>
          </label>

          <label className={styles.field}>
            <span>Период</span>
            <select className={styles.input} value={periodMode} onChange={e => setPeriodMode(e.target.value)}>
              <option value="preset">Предустановленный</option>
              <option value="all">Весь период</option>
              <option value="custom">Произвольный</option>
            </select>
          </label>

          {periodMode === 'preset' && (
            <label className={styles.field}>
              <span>Интервал</span>
              <select className={styles.input} value={since} onChange={e => setSince(e.target.value)}>
                <option value="15m">15m</option>
                <option value="1h">1h</option>
                <option value="6h">6h</option>
                <option value="24h">24h</option>
                <option value="7d">7d</option>
                <option value="30d">30d</option>
              </select>
            </label>
          )}

          {periodMode === 'custom' && (
            <>
              <label className={styles.field}>
                <span>Start</span>
                <input className={styles.input} type="datetime-local" value={start} onChange={e => setStart(e.target.value)} />
              </label>
              <label className={styles.field}>
                <span>End</span>
                <input className={styles.input} type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} />
              </label>
            </>
          )}

          <label className={styles.field}>
            <span>Лимит</span>
            <select className={styles.input} value={limit} onChange={e => setLimit(e.target.value)}>
              <option value="100">100</option>
              <option value="500">500</option>
              <option value="1000">1000</option>
              <option value="2000">2000</option>
            </select>
          </label>
        </div>

        <div className={styles.actions}>
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Загрузка...' : 'Показать логи'}
          </button>
          {hasFilters && (
            <button type="button" className={styles.resetBtn} onClick={resetFilters}>
              Сбросить
            </button>
          )}
        </div>
      </form>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.ts}-${i}`}>
                <td className={styles.message}>{row.message}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan="1" className={styles.empty}>Нет логов для выбранных фильтров.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showManager && (
        <JournalServiceManagerModal onClose={() => setShowManager(false)} />
      )}
    </main>
  )
}
