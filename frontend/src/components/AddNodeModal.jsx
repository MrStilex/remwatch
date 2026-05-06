import { useState } from 'react'
import styles from './AddNodeModal.module.css'
import { copyText } from '../utils/clipboard'

const API = import.meta.env.VITE_API_URL ?? '/api'

function CmdLine({ text }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    copyText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className={styles.cmdBox}>
      <code className={styles.cmd}>{text}</code>
      <button
        type="button"
        className={`${styles.copyBtn} ${copied ? styles.copied : ''}`}
        onClick={copy}
      >{copied ? '✓' : 'Копировать'}</button>
    </div>
  )
}

export default function AddNodeModal({ onClose, onAdded }) {
  const [nodeName, setNodeName] = useState('')
  const [nodeIp,   setNodeIp]   = useState('')
  const [country,  setCountry]  = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [done,     setDone]     = useState(false)

  const origin  = window.location.origin
  const lokiUrl = `http://${window.location.hostname}:3100`

  const cmd = [
    `curl -fsSL ${origin}/agent-install.sh`,
    `| NODE_NAME="${nodeName || 'my-server'}"`,
    `NODE_IP="${nodeIp || '1.2.3.4'}"`,
    `COUNTRY="${country || 'XX'}"`,
    `LOKI_URL="${lokiUrl}"`,
    `REMWATCH_URL="${origin}"`,
    `bash`,
  ].join(' ')

  async function submit(e) {
    e.preventDefault()
    if (!nodeName.trim()) { setError('Имя ноды обязательно'); return }
    if (!nodeIp.trim())   { setError('IP обязателен'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API}/nodes`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ name: nodeName.trim(), node_ip: nodeIp.trim(), country: country.trim() }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${res.status}`)
      }
      setDone(true)
      onAdded?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Добавить ноду</h2>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {!done ? (
            <form onSubmit={submit}>
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

              {error && <p className={styles.err}>{error}</p>}

              <div className={styles.footer}>
                <button type="button" className={styles.cancel} onClick={onClose}>Отмена</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Добавляю...' : 'Добавить ноду'}
                </button>
              </div>
            </form>
          ) : (
            <>
              <p className={styles.success}>
                Нода <strong>{nodeName}</strong> добавлена. Следуй инструкции:
              </p>

              <div className={styles.steps}>

                <div className={styles.step}>
                  <div className={styles.stepHeader}>
                    <span className={styles.stepNum}>1</span>
                    <span className={styles.stepTitle}>Смонтируй логи remnanode</span>
                  </div>
                  <p className={styles.stepDesc}>
                    Добавь строку в <code>volumes:</code> в файле{' '}
                    <code>/opt/remnanode/docker-compose.yml</code>:
                  </p>
                  <CmdLine text="      - /var/log/remnanode-supervisor:/var/log/supervisor" />
                  <p className={styles.stepDesc}>Затем перезапусти контейнер:</p>
                  <CmdLine text="cd /opt/remnanode && docker compose up -d" />
                </div>

                <div className={styles.step}>
                  <div className={styles.stepHeader}>
                    <span className={styles.stepNum}>2</span>
                    <span className={styles.stepTitle}>Установи агент мониторинга</span>
                  </div>
                  <p className={styles.stepDesc}>Вставь в терминал на сервере:</p>
                  <CmdLine text={cmd} />
                </div>

              </div>

              <p className={styles.note}>
                На сервере должен быть установлен Docker.
                Нода уже видна в списке — метрики появятся после запуска агента.
              </p>

              <div className={styles.footer}>
                <button className="btn-primary" onClick={onClose}>Готово</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
