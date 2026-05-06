import { useState } from 'react'
import styles from './AddPanelModal.module.css'

export default function AddPanelModal({ onClose, onSave }) {
  const [name, setName] = useState('')
  const [url,  setUrl]  = useState('')
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')

  function submit(e) {
    e.preventDefault()
    if (!url.trim()) { setError('URL обязателен'); return }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2)
    onSave({ id, name: name.trim() || url, url: url.trim(), user: user.trim(), pass })
    onClose()
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Добавить панель</h2>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <form className={styles.body} onSubmit={submit}>
          <label className={styles.label}>
            Название <span className={styles.hint}>необязательно</span>
            <input className={styles.input} placeholder="Моя панель" value={name} onChange={e => setName(e.target.value)} autoFocus />
          </label>

          <label className={styles.label}>
            URL <span className={styles.hint}>адрес панели метрик</span>
            <input className={styles.input} placeholder="http://example.com:3001" value={url} onChange={e => setUrl(e.target.value)} />
          </label>

          <div className={styles.row}>
            <label className={styles.label}>
              Пользователь
              <input className={styles.input} placeholder="admin" value={user} onChange={e => setUser(e.target.value)} />
            </label>
            <label className={styles.label}>
              Пароль
              <div className={styles.passWrap}>
                <input
                  className={styles.input}
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={pass}
                  onChange={e => setPass(e.target.value)}
                />
                <button type="button" className={styles.eye} onClick={() => setShowPass(v => !v)}>
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </label>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.footer}>
            <button type="button" className={styles.cancel} onClick={onClose}>Отмена</button>
            <button type="submit" className="btn-primary">Добавить</button>
          </div>
        </form>
      </div>
    </div>
  )
}
