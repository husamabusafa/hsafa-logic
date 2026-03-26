import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Network, Plug, PlugZap, ChevronRight } from 'lucide-react'
import { listScopes, type ScopeInfo } from '../lib/api'

export default function ScopesPage() {
  const [scopes, setScopes] = useState<ScopeInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listScopes()
      .then(({ scopes }) => setScopes(scopes))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const connected = scopes.filter((s) => s.connected).length
  const total = scopes.length

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Scopes</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {total} scope{total !== 1 ? 's' : ''} registered, {connected} connected
        </p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-zinc-500 text-sm">Loading...</div>
      ) : scopes.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <Network size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg mb-2">No scopes registered</p>
          <p className="text-sm">Services register scopes when they connect via the SDK.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {scopes.map((s) => (
            <Link
              key={s.id}
              to={`/scopes/${s.name}`}
              className="flex items-center gap-4 px-5 py-4 bg-zinc-900/60 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors group"
            >
              {/* Connection icon */}
              <div className="shrink-0">
                {s.connected ? (
                  <PlugZap size={20} className="text-emerald-500" />
                ) : (
                  <Plug size={20} className="text-zinc-600" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold">{s.name}</span>
                  <span
                    className={`px-2 py-0.5 text-xs rounded-full ${
                      s.connected
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-zinc-800 text-zinc-500'
                    }`}
                  >
                    {s.connected ? 'connected' : 'disconnected'}
                  </span>
                </div>
                <p className="text-sm text-zinc-500 mt-0.5">
                  {s.toolCount} tool{s.toolCount !== 1 ? 's' : ''}
                  {s.lastSeenAt && (
                    <span className="ml-2 text-zinc-600">
                      last seen {new Date(s.lastSeenAt).toLocaleString()}
                    </span>
                  )}
                </p>
              </div>

              {/* Arrow */}
              <ChevronRight
                size={18}
                className="text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0"
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
