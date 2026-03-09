import { useState } from 'react'
import { Settings, Check, Wifi, WifiOff, ChevronDown, ChevronUp } from 'lucide-react'
import { useConfig } from '../../lib/config-context'

export default function ConfigBar() {
  const { haseefId, setHaseefId, coreUrl, setCoreUrl, apiKey, client } = useConfig()
  const [expanded, setExpanded] = useState(!haseefId || !apiKey)
  const [healthStatus, setHealthStatus] = useState<'unknown' | 'ok' | 'error'>('unknown')
  const [checking, setChecking] = useState(false)

  const checkHealth = async () => {
    if (!client) return
    setChecking(true)
    try {
      await client.health()
      setHealthStatus('ok')
    } catch {
      setHealthStatus('error')
    }
    setChecking(false)
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Settings size={16} className="text-zinc-400" />
          <span className="text-sm font-medium">Connection</span>
          {healthStatus === 'ok' && (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <Wifi size={12} /> Connected
            </span>
          )}
          {healthStatus === 'error' && (
            <span className="flex items-center gap-1 text-xs text-red-400">
              <WifiOff size={12} /> Error
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {haseefId && (
            <span className="text-xs text-zinc-500 font-mono">{haseefId.slice(0, 8)}...</span>
          )}
          {expanded ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-zinc-800 space-y-3 pt-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Core URL</label>
              <input
                type="text"
                value={coreUrl}
                onChange={(e) => setCoreUrl(e.target.value)}
                placeholder="http://localhost:3001"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Haseef ID</label>
              <input
                type="text"
                value={haseefId}
                onChange={(e) => setHaseefId(e.target.value)}
                placeholder="uuid..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>
          {apiKey && (
            <div className="text-xs text-zinc-600">
              API Key: <span className="font-mono">{"•".repeat(apiKey.length)}</span> (from env)
            </div>
          )}
          {!apiKey && (
            <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              ⚠️ Set VITE_CORE_API_KEY in .env file
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={checkHealth}
              disabled={!client || checking}
              className="px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors disabled:opacity-40"
            >
              {checking ? 'Checking...' : 'Test Connection'}
            </button>
            {healthStatus === 'ok' && <Check size={14} className="text-emerald-400" />}
          </div>
        </div>
      )}
    </div>
  )
}
