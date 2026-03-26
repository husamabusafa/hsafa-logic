import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { listRuns, listHaseefs, type Run, type Haseef } from '../lib/api'

const statusConfig = {
  running: { icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Running' },
  completed: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Completed' },
  failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Failed' },
}

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([])
  const [haseefMap, setHaseefMap] = useState<Record<string, Haseef>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterHaseef, setFilterHaseef] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  useEffect(() => {
    Promise.all([
      listRuns({ limit: 50, haseefId: filterHaseef || undefined, status: filterStatus || undefined }),
      listHaseefs(),
    ])
      .then(([rRes, hRes]) => {
        setRuns(rRes.runs)
        const map: Record<string, Haseef> = {}
        for (const h of hRes.haseefs) map[h.id] = h
        setHaseefMap(map)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [filterHaseef, filterStatus])

  const haseefs = Object.values(haseefMap)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Runs</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {runs.length} run{runs.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <select
            value={filterHaseef}
            onChange={(e) => { setLoading(true); setFilterHaseef(e.target.value) }}
            className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Haseefs</option>
            {haseefs.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => { setLoading(true); setFilterStatus(e.target.value) }}
            className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Statuses</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-zinc-500 text-sm">Loading...</div>
      ) : runs.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <Clock size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg">No runs found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map((r) => {
            const cfg = statusConfig[r.status] ?? statusConfig.completed
            const Icon = cfg.icon
            const hName = haseefMap[r.haseefId]?.name ?? r.haseefId.slice(0, 8)

            return (
              <div
                key={r.id}
                className="flex items-center gap-4 px-5 py-3.5 bg-zinc-900/60 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors"
              >
                {/* Status */}
                <div className={`shrink-0 p-1.5 rounded-lg ${cfg.bg}`}>
                  <Icon size={16} className={cfg.color} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/haseefs/${r.haseefId}`}
                      className="font-semibold text-sm hover:text-emerald-400 transition-colors"
                    >
                      {hName}
                    </Link>
                    {r.triggerScope && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-zinc-800 text-zinc-500">
                        {r.triggerScope}:{r.triggerType ?? '?'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-600 mt-0.5 font-mono">
                    {r.id.slice(0, 8)}... · {r.stepCount} steps · {r.promptTokens + r.completionTokens} tokens · {r.durationMs}ms
                  </p>
                </div>

                {/* Time */}
                <div className="text-xs text-zinc-600 shrink-0 text-right">
                  {new Date(r.startedAt).toLocaleString()}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
