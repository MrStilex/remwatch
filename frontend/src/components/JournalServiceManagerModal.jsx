import { useEffect, useMemo, useState } from 'react'
import AddServiceModal from './AddServiceModal'
import shellStyles from './AddNodeModal.module.css'
import styles from './JournalServiceManagerModal.module.css'
import { copyText } from '../utils/clipboard'

const API = import.meta.env.VITE_API_URL ?? '/api'

function uninstallCmd() {
  return [
    'docker rm -f remwatch-vector remwatch-node-exporter 2>/dev/null || true',
    'rm -rf docker-compose.yml .env vector',
  ].join(' && ')
}

function lokiDeleteCmd(serviceName) {
  return `curl -sS -X POST 'http://<loki-host>:3100/loki/api/v1/delete?query=%7Bservice_name%3D%22${encodeURIComponent(serviceName)}%22%7D&start=1970-01-01T00:00:00Z&end=$(date -u +%Y-%m-%dT%H:%M:%SZ)'`
}

export default function JournalServiceManagerModal({ onClose }) {
  const [services, setServices] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState('')
  const hasRows = services.length > 0

  const sorted = useMemo(
    () => [...services].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [services]
  )

  async function loadServices() {
    setError('')
    try {
      const res = await fetch(`${API}/services`, { credentials: 'include' })
      const data = await res.json().catch(() => [])
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      setServices(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err?.message || 'Не удалось загрузить сервисы')
      setServices([])
    }
  }

  async function addService() {
    await loadServices()
  }

  async function removeService(id) {
    const res = await fetch(`${API}/services/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (!res.ok) return
    await loadServices()
    setSelected(null)
  }

  useEffect(() => {
    void loadServices()
  }, [])

  function fmtTs(value) {
    if (!value) return '—'
    try {
      return new Date(value).toLocaleString('ru-RU')
    } catch {
      return value
    }
  }

  function statusLabel(service) {
    if (service.status === 'revoked') return 'Revoked'
    return service.last_seen_at ? 'Active' : 'Waiting'
  }

  return (
    <div className={shellStyles.overlay} onClick={onClose}>
      <div className={`${shellStyles.modal} ${styles.modalWide}`} onClick={e => e.stopPropagation()}>
        <div className={shellStyles.header}>
          <h2>Управление сервисами</h2>
          <button className={shellStyles.close} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          <div className={styles.topBar}>
            <p className={styles.muted}>Сервисы хранятся на backend. Токен и ingest-контур привязываются к этой записи.</p>
            <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Добавить</button>
          </div>

          {error && <p className={styles.muted} style={{ color: '#fca5a5' }}>{error}</p>}

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Node</th>
                  <th>Источник</th>
                  <th>Статус</th>
                  <th>Last Seen</th>
                  <th>Создан</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {hasRows ? sorted.map(s => (
                  <tr key={s.id}>
                    <td>{s.service_name}</td>
                    <td>{s.node_name || '—'} <span className={styles.dim}>{s.node_ip || ''}</span></td>
                    <td>{s.source_type === 'systemd' ? s.service_unit : s.log_path}</td>
                    <td>{statusLabel(s)}</td>
                    <td>{fmtTs(s.last_seen_at)}</td>
                    <td>{fmtTs(s.created_at)}</td>
                    <td className={styles.actions}>
                      <button className={styles.trashBtn} onClick={() => setSelected(s)} title="Удалить сервис">🗑</button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="7" className={styles.empty}>Сервисов пока нет.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {selected && (
            <div className={styles.removeBox}>
              <p><strong>Удалить сервис:</strong> {selected.service_name}</p>
              <p className={styles.muted}>
                Удаление здесь отключает серверную привязку сервиса. Агент на сервере и старые логи в Loki удаляются отдельными командами.
              </p>

              <div className={styles.cmdLine}>
                <code>{uninstallCmd()}</code>
                <button onClick={() => copyText(uninstallCmd())}>Копировать деинсталлятор</button>
              </div>

              <div className={styles.cmdLine}>
                <code>{lokiDeleteCmd(selected.service_name)}</code>
                <button onClick={() => copyText(lokiDeleteCmd(selected.service_name))}>Копировать удаление логов</button>
              </div>

              <div className={styles.removeActions}>
                <button className={styles.cancelBtn} onClick={() => setSelected(null)}>Отмена</button>
                <button className={styles.removeBtn} onClick={() => removeService(selected.id)}>Удалить из списка</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <AddServiceModal
          onClose={() => setShowAdd(false)}
          onSave={addService}
        />
      )}
    </div>
  )
}
