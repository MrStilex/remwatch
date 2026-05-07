import { useState, useEffect, useRef, useCallback } from 'react'
import styles from './PanelLogs.module.css'

const API = import.meta.env.VITE_API_URL ?? '/api'
const MAX_ENTRIES = 500

function fmtTime(iso) {
  try { return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }
  catch { return '' }
}

function isError(e) { return e.error_type === 'error' }
function isWarn(e)  { return e.error_type === 'warn' }

export default function PanelLogs({ panel }) {
  const [entries, setEntries]   = useState([])
  const [errCount, setErrCount] = useState(0)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const seenRef    = useRef(new Set())
  const bottomRef  = useRef(null)
  const autoScroll = useRef(true)
  const logAreaRef = useRef(null)

  const fetchLogs = useCallback(async (since) => {
    const params = new URLSearchParams({ node: panel.panel_name, limit: '200', since })
    const res = await fetch(`${API}/logs?${params}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }, [panel.panel_name])

  // Начальная загрузка
  useEffect(() => {
    fetchLogs('1h')
      .then(data => {
        const sorted = [...data].sort((a, b) => a.ts < b.ts ? -1 : 1)
        sorted.forEach(e => seenRef.current.add(e.ts + e.message))
        setEntries(sorted.slice(-MAX_ENTRIES))
        setErrCount(sorted.filter(isError).length)
        setError(null)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [fetchLogs])

  // Polling каждые 10 секунд
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const data = await fetchLogs('2m')
        const sorted = [...data].sort((a, b) => a.ts < b.ts ? -1 : 1)
        const fresh = sorted.filter(e => !seenRef.current.has(e.ts + e.message))
        if (!fresh.length) return
        fresh.forEach(e => seenRef.current.add(e.ts + e.message))
        setEntries(prev => [...prev, ...fresh].slice(-MAX_ENTRIES))
        setErrCount(prev => prev + fresh.filter(isError).length)
      } catch {}
    }, 10_000)
    return () => clearInterval(t)
  }, [fetchLogs])

  // Автоскролл
  useEffect(() => {
    if (!autoScroll.current) return
    const el = logAreaRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [entries.length])

  function onScroll() {
    const el = logAreaRef.current
    if (!el) return
    autoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  if (loading) return <div className={styles.state}>Загрузка логов...</div>
  if (error)   return <div className={styles.stateErr}>Ошибка: {error}</div>

  return (
    <div className={styles.wrap}>
      <div className={styles.topBar}>
        <div className={styles.topLeft}>
          <span className={styles.panelLabel}>{panel.panel_name}</span>
          <span className={errCount > 0 ? styles.errBadge : styles.okBadge}>
            {errCount > 0 ? `${errCount} ошибок` : 'Ошибок нет'}
          </span>
        </div>
        <span className={styles.liveLabel}>● Live</span>
      </div>

      <div className={styles.logArea} ref={logAreaRef} onScroll={onScroll}>
        {entries.length === 0 && (
          <div className={styles.empty}>
            Логи не найдены.<br />
            Убедись что установлен агент и имя панели совпадает.
          </div>
        )}
        {entries.map((e, i) => (
          <div
            key={i}
            className={`${styles.logLine} ${isError(e) ? styles.logErr : isWarn(e) ? styles.logWarn : ''}`}
          >
            <span className={styles.logContainer}>{e.container || e.node_name}</span>
            <span className={styles.logTs}>{fmtTime(e.ts)}</span>
            <span className={styles.logMsg}>{e.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
