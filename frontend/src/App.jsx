import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import Dashboard  from './pages/Dashboard'
import Nodes      from './pages/Nodes'
import NodeDetail from './pages/NodeDetail'
import Logs       from './pages/Logs'
import Alerts     from './pages/Alerts'

export default function App() {
  return (
    <BrowserRouter>
      <div className="layout">
        <aside className="sidebar">
          <h2>remwatch</h2>
          <NavLink to="/"       end>Dashboard</NavLink>
          <NavLink to="/nodes"  >Nodes</NavLink>
          <NavLink to="/logs"   >Logs</NavLink>
          <NavLink to="/alerts" >Alerts</NavLink>
        </aside>

        <Routes>
          <Route path="/"            element={<Dashboard />} />
          <Route path="/nodes"       element={<Nodes />} />
          <Route path="/nodes/:name" element={<NodeDetail />} />
          <Route path="/logs"        element={<Logs />} />
          <Route path="/alerts"      element={<Alerts />} />
          <Route path="*"            element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
