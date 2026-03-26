import { NavLink, Outlet } from 'react-router-dom'
import { Brain, Network, History, Settings, Radio } from 'lucide-react'

const nav = [
  { to: '/haseefs', label: 'Haseefs', icon: Brain },
  { to: '/scopes', label: 'Scopes', icon: Network },
  { to: '/runs', label: 'Runs', icon: History },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function Layout() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      {/* Sidebar */}
      <aside className="w-56 border-r border-zinc-800 bg-zinc-900/60 flex flex-col shrink-0">
        <div className="h-14 flex items-center px-5 border-b border-zinc-800">
          <span className="text-lg font-semibold tracking-tight">
            <span className="text-emerald-400">hsafa</span>
            <span className="text-zinc-500"> core</span>
          </span>
        </div>

        <nav className="flex-1 py-3 px-3 space-y-0.5">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-5 py-3 border-t border-zinc-800">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Radio size={12} className="text-emerald-500 animate-pulse" />
            <span>v7 Dashboard</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
