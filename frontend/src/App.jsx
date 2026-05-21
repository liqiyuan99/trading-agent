import { NavLink, Route, Routes } from 'react-router-dom'
import { History } from './pages/History.jsx'
import { NewAnalysis } from './pages/NewAnalysis.jsx'
import { RunDetail } from './pages/RunDetail.jsx'
import { Schedules } from './pages/Schedules.jsx'
import { Settings } from './pages/Settings.jsx'

function NavItem({ to, end, children }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          isActive
            ? 'bg-blue-600 text-white'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-2">
          <span className="font-bold text-gray-900 mr-4 text-lg">StockResearch</span>
          <NavItem to="/" end>New Analysis</NavItem>
          <NavItem to="/history">History</NavItem>
          <NavItem to="/schedules">Schedules</NavItem>
          <NavItem to="/settings">Settings</NavItem>
        </div>
      </nav>
      <main className="max-w-5xl mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<NewAnalysis />} />
          <Route path="/history" element={<History />} />
          <Route path="/runs/:id" element={<RunDetail />} />
          <Route path="/schedules" element={<Schedules />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}
