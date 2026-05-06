import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './Login.module.css'
import cpStyles from './ChangePassword.module.css'

const API = import.meta.env.VITE_API_URL ?? '/api'

export default function ChangePassword() {
  const navigate = useNavigate()
  const [current,  setCurrent]  = useState('')
  const [next,     setNext]     = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (next !== confirm) { setError('Пароли не совпадают'); return }
    if (next.length < 8)  { setError('Минимум 8 символов'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Ошибка'); return }
      navigate('/', { replace: true })
    } catch {
      setError('Нет связи с сервером')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>◈</span>
          <span className={styles.logoText}>remwatch</span>
        </div>
        <p className={cpStyles.notice}>
          Это первый вход. Пожалуйста, смените пароль по умолчанию.
        </p>

        <form onSubmit={submit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Текущий пароль</label>
            <input className={styles.input} type="password" value={current}
              onChange={e => setCurrent(e.target.value)} placeholder="••••••••" autoFocus required />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Новый пароль</label>
            <input className={styles.input} type="password" value={next}
              onChange={e => setNext(e.target.value)} placeholder="Минимум 8 символов" required />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Повторите новый пароль</label>
            <input className={styles.input} type="password" value={confirm}
              onChange={e => setConfirm(e.target.value)} placeholder="••••••••" required />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button className={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Сохранение...' : 'Сменить пароль'}
          </button>
        </form>
      </div>
    </div>
  )
}
