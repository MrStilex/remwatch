import { useState } from 'react'
import styles from './AddNodeModal.module.css'

export default function AddNodeModal({ onClose }) {
  const [nodeName, setNodeName] = useState('')
  const [nodeIp,   setNodeIp]   = useState('')
  const [country,  setCountry]  = useState('')
  const [copied,   setCopied]   = useState(false)

  const lokiUrl = `http://${window.location.hostname}:3100`

  const origin = window.location.origin
  const cmd = [
    `curl -fsSL ${origin}/agent-install.sh`,
    `| NODE_NAME="${nodeName || 'my-server'}"`,
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

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        <div className={styles.header}>
          <h2>Добавить ноду</h2>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>
                Имя ноды
                <span className={styles.hint}>например: Germany #3</span>
              </label>
              <input
                className={styles.input}
                placeholder="Germany #3"
                value={nodeName}
                onChange={e => setNodeName(e.target.value)}
                autoFocus
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>
                Код страны
                <span className={styles.hint}>двухбуквенный ISO</span>
              </label>
              <input
                className={styles.input}
                placeholder="DE"
                maxLength={2}
                value={country}
                onChange={e => setCountry(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
              IP ноды
              <span className={styles.hint}>внешний IP сервера</span>
            </label>
            <input
              className={styles.input}
              placeholder="1.2.3.4"
              value={nodeIp}
              onChange={e => setNodeIp(e.target.value)}
            />
          </div>

          <div className={styles.field} style={{ marginTop: 8 }}>
            <label className={styles.label}>
              Команда установки
              <span className={styles.hint}>вставь в терминал на сервере с Remnawave</span>
            </label>
            <div className={styles.cmdBox}>
              <code className={styles.cmd}>{cmd}</code>
              <button
                className={`${styles.copyBtn} ${copied ? styles.copied : ''}`}
                onClick={copy}
              >
                {copied ? '✓ Скопировано' : 'Копировать'}
              </button>
            </div>
          </div>

          <p className={styles.note}>
            На сервере должен быть установлен Docker.
            Скрипт проверит конфликты, установит Vector и убедится что логи доходят до Loki.
          </p>
        </div>

      </div>
    </div>
  )
}
