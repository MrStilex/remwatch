import { useState } from 'react'
import styles from './AddNodeModal.module.css'
import panelStyles from './AddLogsModal.module.css'
import { copyText } from '../utils/clipboard'

export default function AddSubpageModal({ onClose, onSave }) {
  const [name,        setName]        = useState('')
  const [serviceName, setServiceName] = useState('subscription-page')
  const [copied,      setCopied]      = useState(false)
  const [error,       setError]       = useState('')

  const origin  = window.location.origin
  const lokiUrl = `http://${window.location.hostname}:3100`

  const cmd = [
    `curl -fsSL ${origin}/subpage-install.sh`,
    `| SERVICE_NAME="${serviceName || 'subscription-page'}"`,
    `LOKI_URL="${lokiUrl}"`,
    `REMWATCH_URL="${origin}"`,
    `bash`,
  ].join(' ')

  function copy() {
    copyText(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function submit(e) {
    e.preventDefault()
    if (!serviceName.trim()) { setError('Имя сервиса обязательно'); return }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2)
    onSave({
      id,
      type: 'subpage',
      name: name.trim() || serviceName.trim(),
      service_name: serviceName.trim(),
    })
    onClose()
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Логи страницы подписки</h2>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <form className={panelStyles.body} onSubmit={submit}>
          <div className={panelStyles.field}>
            <label className={styles.label}>
              Имя сервиса
              <span className={styles.hint}>задаётся при установке (SERVICE_NAME)</span>
            </label>
            <input
              className={styles.input}
              placeholder="subscription-page"
              value={serviceName}
              onChange={e => setServiceName(e.target.value)}
              autoFocus
            />
          </div>

          <div className={panelStyles.field}>
            <label className={styles.label}>
              Название карточки
              <span className={styles.hint}>необязательно</span>
            </label>
            <input
              className={styles.input}
              placeholder="Страница подписки"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className={panelStyles.field} style={{ marginTop: 4 }}>
            <label className={styles.label}>
              Команда установки
              <span className={styles.hint}>вставь в терминал на сервере со страницей подписки</span>
            </label>
            <div className={styles.cmdBox}>
              <code className={styles.cmd}>{cmd}</code>
              <button type="button" className={`${styles.copyBtn} ${copied ? styles.copied : ''}`} onClick={copy}>
                {copied ? '✓ Скопировано' : 'Копировать'}
              </button>
            </div>
          </div>

          <p className={styles.note}>
            Устанавливает Vector на сервер со страницей подписки.
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
