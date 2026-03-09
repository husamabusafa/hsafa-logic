import { useState, useEffect, useCallback } from 'react'
import { Power, PowerOff, RefreshCw, Circle } from 'lucide-react'
import { useConfig } from '../../lib/config-context'
import type { HaseefInfo } from '../../lib/core-client'

export default function StatusPanel() {
  const { client, haseefId } = useConfig()
  const [running, setRunning] = useState(false)
  const [haseef, setHaseef] = useState<HaseefInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!client || !haseefId) return
    setLoading(true)
    setError('')
    try {
      const [statusRes, infoRes] = await Promise.all([
        client.getStatus(haseefId),
        client.getHaseef(haseefId),
      ])
      setRunning(statusRes.running)
      setHaseef(infoRes.haseef)
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }, [client, haseefId])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 10000)
    return () => clearInterval(interval)
  }, [refresh])

  const toggleProcess = async () => {
    if (!client || !haseefId) return
    setLoading(true)
    try {
      if (running) {
        await client.stop(haseefId)
      } else {
        await client.start(haseefId)
      }
      await refresh()
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }

  if (!client || !haseefId) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-sm text-zinc-500">Configure connection above to see status.</p>
      </div>
    )
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Circle
            size={10}
            className={running ? 'text-emerald-400 fill-emerald-400' : 'text-zinc-600 fill-zinc-600'}
          />
          <h3 className="text-sm font-semibold">
            {haseef?.name ?? 'Haseef'}
          </h3>
          <span className={`text-xs px-2 py-0.5 rounded-full ${running ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
            {running ? 'Running' : 'Stopped'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={refresh}
            disabled={loading}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={toggleProcess}
            disabled={loading}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              running
                ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
            }`}
          >
            {running ? <PowerOff size={12} /> : <Power size={12} />}
            {running ? 'Stop' : 'Start'}
          </button>
        </div>
      </div>

      {haseef && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="bg-zinc-800/50 rounded-lg p-2">
            <span className="text-zinc-500">Model</span>
            <p className="text-zinc-300 font-mono mt-0.5 truncate">
              {(haseef.configJson as any)?.model?.model ?? '—'}
            </p>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-2">
            <span className="text-zinc-500">Provider</span>
            <p className="text-zinc-300 font-mono mt-0.5">
              {(haseef.configJson as any)?.model?.provider ?? '—'}
            </p>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-2">
            <span className="text-zinc-500">Created</span>
            <p className="text-zinc-300 mt-0.5">
              {new Date(haseef.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-2">
            <span className="text-zinc-500">ID</span>
            <p className="text-zinc-300 font-mono mt-0.5 truncate" title={haseef.id}>
              {haseef.id.slice(0, 12)}...
            </p>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
