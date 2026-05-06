import { useState } from 'react'
import styles from './AddNodeModal.module.css'
import panelStyles from './AddLogsModal.module.css'

export default function AddLogsModal({ onClose, onSave }) {
  const [name,      setName]      = useState('')
  const [panelName, setPanelName] = useState('')
  const [nodeIp,    setNodeIp]    = useState('')
  const [country,   setCountry]   = useState('')
  const [copied,    setCopied]    = useState(false)
  const [error,     setError]     = useState('')

  const origin   = window.location.origin
  const lokiUrl  = `http://${window.location.hostname}:3100`

  const cmd = [
    `curl -fsSL ${origin}/panel-install.sh`,
    `| PANEL_NAME="${panelName || 'main-panel'}"`,
    `NODE_IP="${nodeIp || '1.2.3.4'}"`,
    `COUNTRY="${country || 'XX'}"`,
    `LOKI_URL="${lokiUrl}"`,
    `REMWATCH_URL="${origin}"`,
    `bash`,
  ].join(' ')

  function copy() {
    navigator.clipboard.writeText(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function submit(e) {
    e.preventDefault()
    if (!panelName.trim()) { setError('Имя панели обязательно'); return }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2)
    onSave({ id, type: 'logs', name: name.trim() || panelName.trim(), panel_name: panelName.trim() })
    onClose()
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Логи панели</h2>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <form className={panelStyles.body} onSubmit={submit}>
          <div className={panelStyles.row}>
            <div className={panelStyles.field}>
              <label className={styles.label}>
                Имя панели
                <span className={styles.hint}>задаётся при установке (PANEL_NAME)</span>
              </label>
              <input
                className={styles.input}
                placeholder="main-panel"
                value={panelName}
                onChange={e => setPanelName(e.target.value)}
                autoFocus
              />
            </div>
            <div className={panelStyles.field}>
              <label className={styles.label}>
                Код страны
                <span className={styles.hint}>ISO двухбуквенный</span>
              </label>
              <input
                className={styles.input}
                placeholder="RU"
                maxLength={2}
                value={country}
                onChange={e => setCountry(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <div className={panelStyles.field}>
            <label className={styles.label}>
              IP сервера панели
              <span className={styles.hint}>внешний IP где стоит Remnawave</span>
            </label>
            <input
              className={styles.input}
              placeholder="188.208.103.117"
              value={nodeIp}
              onChange={e => setNodeIp(e.target.value)}
            />
          </div>

          <div className={panelStyles.field}>
            <label className={styles.label}>
              Название карточки
              <span className={styles.hint}>необязательно</span>
            </label>
            <input
              className={styles.input}
              placeholder="Мой сервер"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className={panelStyles.field} style={{ marginTop: 4 }}>
            <label className={styles.label}>
              Команда установки
              <span className={styles.hint}>вставь в терминал на сервере с Remnawave</span>
            </label>
            <div className={styles.cmdBox}>
              <code className={styles.cmd}>{cmd}</code>
              <button type="button" className={`${styles.copyBtn} ${copied ? styles.copied : ''}`} onClick={copy}>
                {copied ? '✓ Скопировано' : 'Копировать'}
              </button>
            </div>
          </div>

          <p className={styles.note}>
            Устанавливает Vector (читает docker-логи) и Node Exporter на сервер с Remnawave.
            Логи появятся в карточке через ~минуту после запуска.
          </p>

          {error && <p className={panelStyles.error}>{error}</p>}

          <div className={panelStyles.footer}>
            <button type="button" className={panelStyles.cancel} onClick={onClose}>Отмена</button>
            <button type="submit" className="btn-primary">Добавить карточку</button>
          </div>
        </form>
      </div>
    </div>
  )
}
