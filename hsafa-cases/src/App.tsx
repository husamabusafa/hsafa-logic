import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { FlaskConical, Mic, Gamepad2 } from 'lucide-react'
import { ConfigProvider } from './lib/config-context'
import TesterPage from './pages/Tester'
import SpeakerPage from './pages/Speaker'
import GamerPage from './pages/Gamer'

const tabs = [
  { path: '/tester', label: 'Tester', icon: FlaskConical },
  { path: '/speaker', label: 'Speaker', icon: Mic },
  { path: '/gamer', label: 'Gamer', icon: Gamepad2 },
]

export default function App() {
  return (
    <ConfigProvider>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
        <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
            <h1 className="text-lg font-semibold tracking-tight">
              <span className="text-emerald-400">hsafa</span>
              <span className="text-zinc-400">-cases</span>
            </h1>
            <nav className="flex gap-1">
              {tabs.map((tab) => (
                <NavLink
                  key={tab.path}
                  to={tab.path}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                    }`
                  }
                >
                  <tab.icon size={16} />
                  {tab.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
          <Routes>
            <Route path="/" element={<Navigate to="/tester" replace />} />
            <Route path="/tester" element={<TesterPage />} />
            <Route path="/speaker" element={<SpeakerPage />} />
            <Route path="/gamer" element={<GamerPage />} />
          </Routes>
        </main>
      </div>
    </ConfigProvider>
  )
}
