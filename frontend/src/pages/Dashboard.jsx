import { useState, useRef, useEffect } from 'react'
import AddPanelModal from '../components/AddPanelModal'
import AddLogsModal  from '../components/AddLogsModal'
import PanelMetrics  from '../components/PanelMetrics'
import PanelLogs     from '../components/PanelLogs'
import styles from './Dashboard.module.css'

function usePanels() {
  const [panels, setPanels] = useState(() => {
    try { return JSON.parse(localStorage.getItem('rw_panels') ?? '[]') }
    catch { return [] }
  })

  function save(next) {
    setPanels(next)
    localStorage.setItem('rw_panels', JSON.stringify(next))
  }

  function add(panel)  { save([...panels, panel]) }
  function remove(id)  { save(panels.filter(p => p.id !== id)) }

  return { panels, add, remove }
}

function AddMenu({ onSelect }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function pick(type) {
    setOpen(false)
    onSelect(type)
  }

  return (
    <div className={styles.addWrap} ref={ref}>
      <button className="btn-primary" onClick={() => setOpen(v => !v)}>
        + Добавить
      </button>
      {open && (
        <div className={styles.addMenu}>
          <button className={styles.addMenuItem} onClick={() => pick('metrics')}>
            <span className={styles.addIcon}>📊</span>
            <span>
              <span className={styles.addMenuLabel}>Метрики панели</span>
              <span className={styles.addMenuSub}>Пользователи, ноды, трафик</span>
            </span>
          </button>
          <button className={styles.addMenuItem} onClick={() => pick('logs')}>
            <span className={styles.addIcon}>📋</span>
            <span>
              <span className={styles.addMenuLabel}>Логи панели</span>
              <span className={styles.addMenuSub}>Ошибки и события в реальном времени</span>
            </span>
          </button>
          <button className={styles.addMenuItem} disabled>
            <span className={styles.addIcon}>🌐</span>
            <span>
              <span className={styles.addMenuLabel}>Логи страницы подписки</span>
              <span className={styles.addMenuSub}>Скоро</span>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}

function PanelCard({ panel, onRemove }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardMeta}>
          <span className={styles.cardType}>
            {panel.type === 'logs' ? '📋' : '📊'}
          </span>
          <span className={styles.cardName}>{panel.name}</span>
        </div>
        <button className={styles.removeBtn} onClick={() => onRemove(panel.id)} title="Удалить панель">✕</button>
      </div>
      <div className={styles.cardBody}>
        {panel.type === 'logs'
          ? <PanelLogs    panel={panel} />
          : <PanelMetrics panel={panel} />
        }
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [modal, setModal] = useState(null) // null | 'metrics' | 'logs'
  const { panels, add, remove } = usePanels()

  return (
    <main className="page">
      <div className={styles.header}>
        <h1>Dashboard</h1>
        <AddMenu onSelect={setModal} />
      </div>

      {panels.length === 0 && (
        <div className={styles.empty}>
          <p>Нет панелей. Нажми «+ Добавить» чтобы подключить источник данных.</p>
        </div>
      )}

      <div className={styles.grid}>
        {panels.map(panel => (
          <PanelCard key={panel.id} panel={panel} onRemove={remove} />
        ))}
      </div>

      {modal === 'metrics' && (
        <AddPanelModal onClose={() => setModal(null)} onSave={p => { add({ ...p, type: 'metrics' }); setModal(null) }} />
      )}
      {modal === 'logs' && (
        <AddLogsModal onClose={() => setModal(null)} onSave={p => { add(p); setModal(null) }} />
      )}
    </main>
  )
}
