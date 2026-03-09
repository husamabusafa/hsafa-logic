import { useState, useEffect } from 'react'
import { Users, Check } from 'lucide-react'
import { useConfig } from '../../lib/config-context'
import type { HaseefInfo } from '../../lib/core-client'

export default function HaseefPicker() {
  const { client, haseefId, setHaseefId } = useConfig()
  const [haseefs, setHaseefs] = useState<HaseefInfo[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!client) return
    setLoading(true)
    client
      .listHaseefs()
      .then((res) => setHaseefs(res.haseefs))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [client])

  if (!client) return null
  if (loading) return <p className="text-xs text-zinc-500 py-2">Loading haseefs...</p>
  if (haseefs.length === 0) return null

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Users size={14} className="text-violet-400" />
        Available Haseefs
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        {haseefs.map((h) => (
          <button
            key={h.id}
            onClick={() => setHaseefId(h.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
              haseefId === h.id
                ? 'bg-violet-500/15 border border-violet-500/30 text-violet-300'
                : 'bg-zinc-800/50 border border-zinc-800 hover:border-zinc-700 text-zinc-400'
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{h.name}</p>
              <p className="text-[10px] font-mono text-zinc-500 truncate">{h.id}</p>
            </div>
            {haseefId === h.id && <Check size={14} className="text-violet-400 shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  )
}
