import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, PlugZap, Plug } from 'lucide-react'
import { getScopeTools, type ScopeTool } from '../lib/api'

export default function ScopeDetailPage() {
  const { scope } = useParams<{ scope: string }>()
  const [tools, setTools] = useState<ScopeTool[]>([])
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!scope) return
    getScopeTools(scope)
      .then((res) => {
        setTools(res.tools)
        setConnected(res.connected)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [scope])

  if (loading) return <div className="p-8 text-zinc-500">Loading...</div>

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          to="/scopes"
          className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{scope}</h1>
            <span
              className={`flex items-center gap-1.5 px-2.5 py-0.5 text-xs rounded-full ${
                connected
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-zinc-800 text-zinc-500'
              }`}
            >
              {connected ? <PlugZap size={12} /> : <Plug size={12} />}
              {connected ? 'connected' : 'disconnected'}
            </span>
          </div>
          <p className="text-sm text-zinc-500 mt-1">
            {tools.length} tool{tools.length !== 1 ? 's' : ''} registered
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {tools.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          <p>No tools registered in this scope.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tools.map((t) => (
            <div
              key={t.id}
              className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold font-mono text-emerald-400">{t.name}</h3>
                  <p className="text-sm text-zinc-400 mt-1">{t.description}</p>
                </div>
              </div>

              {/* Input schema */}
              <div className="mt-3">
                <span className="text-xs text-zinc-600 uppercase tracking-wider">Input Schema</span>
                <pre className="mt-1 px-3 py-2 bg-zinc-800/80 rounded-lg text-xs text-zinc-400 font-mono overflow-x-auto">
                  {JSON.stringify(t.inputSchema, null, 2)}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
