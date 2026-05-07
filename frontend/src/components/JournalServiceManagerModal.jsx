import { useMemo, useState } from 'react'
import AddServiceModal from './AddServiceModal'
import shellStyles from './AddNodeModal.module.css'
import styles from './JournalServiceManagerModal.module.css'
import { copyText } from '../utils/clipboard'

const STORAGE_KEY = 'rw_journal_services'

function loadServices() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function saveServices(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

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
  const [services, setServices] = useState(loadServices)
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState(null)
  const hasRows = services.length > 0

  const sorted = useMemo(
    () => [...services].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [services]
  )

  function addService(service) {
    const next = [...services, service]
    setServices(next)
    saveServices(next)
  }

  function removeService(id) {
    const next = services.filter(s => s.id !== id)
    setServices(next)
    saveServices(next)
    setSelected(null)
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
            <p className={styles.muted}>Здесь сохраняются добавленные сервисы Journal.</p>
            <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Добавить</button>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Node</th>
                  <th>Источник</th>
                  <th>Создан</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {hasRows ? sorted.map(s => (
                  <tr key={s.id}>
                    <td>{s.service_name}</td>
                    <td>{s.node_name || '—'} <span className={styles.dim}>{s.node_ip || ''}</span></td>
                    <td>{s.mode === 'systemd' ? s.service_unit : s.log_path}</td>
                    <td>{new Date(s.created_at).toLocaleString('ru-RU')}</td>
                    <td className={styles.actions}>
                      <button className={styles.trashBtn} onClick={() => setSelected(s)} title="Удалить сервис">🗑</button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="5" className={styles.empty}>Сервисов пока нет.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {selected && (
            <div className={styles.removeBox}>
              <p><strong>Удалить сервис:</strong> {selected.service_name}</p>
              <p className={styles.muted}>
                Удаление здесь удаляет сервис из списка в UI. Логи в Loki и агент на сервере удаляются отдельными командами.
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
