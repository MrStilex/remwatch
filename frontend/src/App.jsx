import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom'
import AuthGuard      from './components/AuthGuard'
import Dashboard      from './pages/Dashboard'
import Nodes          from './pages/Nodes'
import NodeDetail     from './pages/NodeDetail'
import Logs           from './pages/Logs'
import Alerts         from './pages/Alerts'
import Login          from './pages/Login'
import ChangePassword from './pages/ChangePassword'

const API = import.meta.env.VITE_API_URL ?? '/api'

function Sidebar() {
  const navigate = useNavigate()

  async function logout() {
    await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' })
    navigate('/login', { replace: true })
  }

  return (
    <aside className="sidebar">
      <h2>remwatch</h2>
      <NavLink to="/"       end>Dashboard</NavLink>
      <NavLink to="/nodes"  >Nodes</NavLink>
      <NavLink to="/logs"   >Logs</NavLink>
      <NavLink to="/alerts" >Alerts</NavLink>
      <button className="sidebar-logout" onClick={logout}>Выйти</button>
    </aside>
  )
}

function AppLayout() {
  return (
    <AuthGuard>
      <div className="layout">
        <Sidebar />
        <Routes>
          <Route path="/"            element={<Dashboard />} />
          <Route path="/nodes"       element={<Nodes />} />
          <Route path="/nodes/:name" element={<NodeDetail />} />
          <Route path="/logs"        element={<Logs />} />
          <Route path="/alerts"      element={<Alerts />} />
          <Route path="*"            element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </AuthGuard>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"           element={<Login />} />
        <Route path="/change-password" element={<AuthGuard><ChangePassword /></AuthGuard>} />
        <Route path="/*"               element={<AppLayout />} />
      </Routes>
    </BrowserRouter>
  )
}
