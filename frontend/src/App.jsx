import { useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { History } from './pages/History.jsx'
import { NewAnalysis } from './pages/NewAnalysis.jsx'
import { RunDetail } from './pages/RunDetail.jsx'
import { Schedules } from './pages/Schedules.jsx'
import { Settings } from './pages/Settings.jsx'

const NAV_LINKS = [
  { to: '/', end: true, label: 'New Analysis' },
  { to: '/history', label: 'History' },
  { to: '/schedules', label: 'Schedules' },
  { to: '/settings', label: 'Settings' },
]

function NavItem({ to, end, children, onClick }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `block px-4 py-2 rounded-md text-sm font-medium transition-colors ${
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
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-gray-900 text-lg">StockResearch</span>

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center gap-2">
            {NAV_LINKS.map(l => (
              <NavItem key={l.to} to={l.to} end={l.end}>{l.label}</NavItem>
            ))}
          </div>

          {/* Mobile hamburger */}
          <button
            className="sm:hidden p-2 rounded-md text-gray-600 hover:bg-gray-100"
            onClick={() => setMenuOpen(v => !v)}
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="sm:hidden border-t border-gray-100 px-4 py-2 flex flex-col gap-1">
            {NAV_LINKS.map(l => (
              <NavItem key={l.to} to={l.to} end={l.end} onClick={() => setMenuOpen(false)}>
                {l.label}
              </NavItem>
            ))}
          </div>
        )}
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
