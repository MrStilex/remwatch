import { useState, useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

const API = import.meta.env.VITE_API_URL ?? '/api'

export default function AuthGuard({ children }) {
  const [state, setState] = useState('loading') // loading | ok | firstLogin | unauth
  const location = useLocation()

  useEffect(() => {
    fetch(`${API}/auth/check`, { credentials: 'include' })
      .then(async r => {
        if (!r.ok) { setState('unauth'); return }
        const d = await r.json()
        setState(d.firstLogin ? 'firstLogin' : 'ok')
      })
      .catch(() => setState('unauth'))
  }, [location.pathname])

  if (state === 'loading') return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'#4b5563', fontSize:14 }}>
      Загрузка...
    </div>
  )
  if (state === 'unauth') return <Navigate to="/login" replace />
  if (state === 'firstLogin' && location.pathname !== '/change-password')
    return <Navigate to="/change-password" replace />
  return children
}
