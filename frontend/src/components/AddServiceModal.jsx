import { useMemo, useState } from 'react'
import shellStyles from './AddNodeModal.module.css'
import formStyles from './AddLogsModal.module.css'
import { copyText } from '../utils/clipboard'

const API = import.meta.env.VITE_API_URL ?? '/api'

export default function AddServiceModal({ onClose, onSave }) {
  const [serviceName, setServiceName] = useState('website-bot')
  const [nodeName, setNodeName] = useState('my-server')
  const [nodeIp, setNodeIp] = useState('1.2.3.4')
  const [country, setCountry] = useState('XX')
  const [mode, setMode] = useState('systemd') // systemd | file
  const [serviceUnit, setServiceUnit] = useState('my-bot.service')
  const [logPath, setLogPath] = useState('/var/log/mybot/*.log')
  const [copied, setCopied] = useState(false)
  const [created, setCreated] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const origin = window.location.origin
  const ingestUrl = `${origin}/api/logs/ingest`

  const cmd = useMemo(() => {
    const token = created?.token || '<SERVICE_TOKEN>'
    const base = [
      `curl -fsSL ${origin}/service-agent-install.sh`,
      `| NODE_NAME="${nodeName || 'my-server'}"`,
      `NODE_IP="${nodeIp || '1.2.3.4'}"`,
      `COUNTRY="${country || 'XX'}"`,
      `SERVICE_NAME="${serviceName || 'website-bot'}"`,
      mode === 'systemd'
        ? `SERVICE_UNIT="${serviceUnit || 'my-bot.service'}"`
        : `LOG_PATH="${logPath || '/var/log/mybot/*.log'}"`,
      `LOG_INGEST_URL="${ingestUrl}"`,
      `SERVICE_TOKEN="${token}"`,
      `REMWATCH_URL="${origin}"`,
      `bash`,
    ]
    return base.join(' ')
  }, [origin, ingestUrl, nodeName, nodeIp, country, serviceName, mode, serviceUnit, logPath, created])

  function copy() {
    copyText(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  async function saveService() {
    setSubmitting(true)
    setError('')
    try {
      const payload = {
        service_name: serviceName.trim(),
        node_name: nodeName.trim(),
        node_ip: nodeIp.trim(),
        country: country.trim(),
        source_type: mode,
        service_unit: mode === 'systemd' ? serviceUnit.trim() : '',
        log_path: mode === 'file' ? logPath.trim() : '',
      }
      const res = await fetch(`${API}/services`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      setCreated(data)
      onSave?.(data.service)
    } catch (err) {
      setError(err?.message || 'Не удалось создать сервис')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={shellStyles.overlay} onClick={onClose}>
      <div className={shellStyles.modal} onClick={e => e.stopPropagation()}>
        <div className={shellStyles.header}>
          <h2>Добавить сервис</h2>
          <button className={shellStyles.close} onClick={onClose}>✕</button>
        </div>

        <div className={formStyles.body}>
          <div className={formStyles.row}>
            <div className={formStyles.field}>
              <label className={shellStyles.label}>
                SERVICE_NAME
                <span className={shellStyles.hint}>идентификатор сервиса в логах</span>
              </label>
              <input className={shellStyles.input} value={serviceName} onChange={e => setServiceName(e.target.value)} />
            </div>
            <div className={formStyles.field}>
              <label className={shellStyles.label}>
                COUNTRY
                <span className={shellStyles.hint}>двухбуквенный ISO</span>
              </label>
              <input className={shellStyles.input} maxLength={2} value={country} onChange={e => setCountry(e.target.value.toUpperCase())} />
            </div>
          </div>

          <div className={formStyles.row}>
            <div className={formStyles.field}>
              <label className={shellStyles.label}>
                NODE_NAME
                <span className={shellStyles.hint}>название сервера</span>
              </label>
              <input className={shellStyles.input} value={nodeName} onChange={e => setNodeName(e.target.value)} />
            </div>
            <div className={formStyles.field}>
              <label className={shellStyles.label}>
                NODE_IP
                <span className={shellStyles.hint}>внешний IP сервера</span>
              </label>
              <input className={shellStyles.input} value={nodeIp} onChange={e => setNodeIp(e.target.value)} />
            </div>
          </div>

          <div className={formStyles.field}>
            <label className={shellStyles.label}>
              Источник логов
              <span className={shellStyles.hint}>systemd unit или путь к файлу</span>
            </label>
            <select className={shellStyles.input} value={mode} onChange={e => setMode(e.target.value)}>
              <option value="systemd">systemd unit</option>
              <option value="file">log file path</option>
            </select>
          </div>

          {mode === 'systemd' ? (
            <div className={formStyles.field}>
              <label className={shellStyles.label}>
                SERVICE_UNIT
                <span className={shellStyles.hint}>например: my-bot.service</span>
              </label>
              <input className={shellStyles.input} value={serviceUnit} onChange={e => setServiceUnit(e.target.value)} />
            </div>
          ) : (
            <div className={formStyles.field}>
              <label className={shellStyles.label}>
                LOG_PATH
                <span className={shellStyles.hint}>например: /var/log/mybot/*.log</span>
              </label>
              <input className={shellStyles.input} value={logPath} onChange={e => setLogPath(e.target.value)} />
            </div>
          )}

          <div className={formStyles.field}>
            <label className={shellStyles.label}>
              Команда установки
              <span className={shellStyles.hint}>после создания сервиса выполни на сервере, где работает сервис</span>
            </label>
            <div className={shellStyles.cmdBox}>
              <code className={shellStyles.cmd}>{cmd}</code>
              <button type="button" className={`${shellStyles.copyBtn} ${copied ? shellStyles.copied : ''}`} onClick={copy}>
                {copied ? '✓ Скопировано' : 'Копировать'}
              </button>
            </div>
          </div>

          {error && <p className={shellStyles.hint} style={{ color: '#fca5a5' }}>{error}</p>}
          {created?.token && (
            <p className={shellStyles.hint}>Токен выдан и уже привязан к сервису. Повторно в UI он не показывается.</p>
          )}

          <div className={formStyles.footer}>
            <button type="button" className="btn-primary" onClick={saveService} disabled={submitting}>
              {submitting ? 'Создаю...' : created ? 'Создано' : 'Создать сервис'}
            </button>
            <button type="button" className={formStyles.cancel} onClick={onClose}>{created ? 'Готово' : 'Закрыть'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
