import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Play, Square, Radio, Trash2, ExternalLink } from 'lucide-react'
import {
  listHaseefs,
  createHaseef,
  deleteHaseef,
  startHaseef,
  stopHaseef,
  getHaseefStatus,
  type Haseef,
} from '../lib/api'

export default function HaseefsPage() {
  const [haseefs, setHaseefs] = useState<Haseef[]>([])
  const [statuses, setStatuses] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      const { haseefs: list } = await listHaseefs()
      setHaseefs(list)

      const statusMap: Record<string, boolean> = {}
      await Promise.all(
        list.map(async (h) => {
          try {
            const { running } = await getHaseefStatus(h.id)
            statusMap[h.id] = running
          } catch {
            statusMap[h.id] = false
          }
        }),
      )
      setStatuses(statusMap)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleToggleProcess = async (h: Haseef) => {
    try {
      if (statuses[h.id]) {
        await stopHaseef(h.id)
      } else {
        await startHaseef(h.id)
      }
      setStatuses((s) => ({ ...s, [h.id]: !s[h.id] }))
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleDelete = async (h: Haseef) => {
    if (!confirm(`Delete "${h.name}"? This cannot be undone.`)) return
    try {
      await deleteHaseef(h.id)
      setHaseefs((prev) => prev.filter((x) => x.id !== h.id))
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Haseefs</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {haseefs.length} haseef{haseefs.length !== 1 ? 's' : ''} registered
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          New Haseef
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="text-zinc-500 text-sm">Loading...</div>
      ) : haseefs.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <p className="text-lg mb-2">No haseefs yet</p>
          <p className="text-sm">Create your first haseef to get started.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {haseefs.map((h) => (
            <div
              key={h.id}
              className="flex items-center gap-4 px-5 py-4 bg-zinc-900/60 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors"
            >
              {/* Status dot */}
              <div className="shrink-0">
                {statuses[h.id] ? (
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                ) : (
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-600" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <Link
                  to={`/haseefs/${h.id}`}
                  className="text-base font-semibold text-zinc-100 hover:text-emerald-400 transition-colors"
                >
                  {h.name}
                </Link>
                {h.description && (
                  <p className="text-sm text-zinc-500 truncate mt-0.5">{h.description}</p>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  {h.scopes.length > 0 ? (
                    h.scopes.map((s) => (
                      <span
                        key={s}
                        className="px-2 py-0.5 text-xs rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700"
                      >
                        {s}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-zinc-600">no scopes</span>
                  )}
                </div>
              </div>

              {/* Model badge */}
              <div className="shrink-0 text-right">
                <span className="text-xs text-zinc-500 font-mono">
                  {typeof h.configJson?.model === 'string'
                    ? h.configJson.model
                    : typeof h.configJson?.model === 'object' && h.configJson.model !== null
                      ? (h.configJson.model as Record<string, unknown>).model as string ?? JSON.stringify(h.configJson.model)
                      : 'no model'}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <Link
                  to={`/live/${h.id}`}
                  className="p-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                  title="Live feed"
                >
                  <Radio size={16} />
                </Link>
                <button
                  onClick={() => handleToggleProcess(h)}
                  className={`p-2 rounded-lg transition-colors ${
                    statuses[h.id]
                      ? 'text-amber-400 hover:bg-amber-500/10'
                      : 'text-emerald-500 hover:bg-emerald-500/10'
                  }`}
                  title={statuses[h.id] ? 'Stop process' : 'Start process'}
                >
                  {statuses[h.id] ? <Square size={16} /> : <Play size={16} />}
                </button>
                <button
                  onClick={() => handleDelete(h)}
                  className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load() }}
        />
      )}
    </div>
  )
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [model, setModel] = useState('anthropic:claude-sonnet-4-20250514')
  const [instructions, setInstructions] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    try {
      setSaving(true)
      await createHaseef({
        name: name.trim(),
        description: description.trim() || undefined,
        configJson: {
          model,
          instructions: instructions.trim() || undefined,
        },
      })
      onCreated()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md shadow-2xl"
      >
        <h2 className="text-lg font-semibold mb-4">New Haseef</h2>

        {error && (
          <div className="mb-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <label className="block mb-3">
          <span className="text-sm text-zinc-400">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
            placeholder="Atlas"
            autoFocus
          />
        </label>

        <label className="block mb-3">
          <span className="text-sm text-zinc-400">Description</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
            placeholder="A friendly assistant"
          />
        </label>

        <label className="block mb-3">
          <span className="text-sm text-zinc-400">Model</span>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm font-mono focus:outline-none focus:border-emerald-500"
          />
        </label>

        <label className="block mb-4">
          <span className="text-sm text-zinc-400">Instructions</span>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={3}
            className="mt-1 w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500 resize-none"
            placeholder="You are a helpful assistant..."
          />
        </label>

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  )
}
