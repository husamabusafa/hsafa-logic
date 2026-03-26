import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Radio, Trash2 } from 'lucide-react'
import {
  getHaseef,
  updateHaseef,
  deleteHaseef,
  listScopes,
  type Haseef,
  type ScopeInfo,
} from '../lib/api'

export default function HaseefDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [haseef, setHaseef] = useState<Haseef | null>(null)
  const [allScopes, setAllScopes] = useState<ScopeInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Editable fields
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [model, setModel] = useState('')
  const [instructions, setInstructions] = useState('')
  const [profileJson, setProfileJson] = useState('')
  const [activeScopes, setActiveScopes] = useState<string[]>([])

  useEffect(() => {
    if (!id) return
    Promise.all([getHaseef(id), listScopes()])
      .then(([hRes, sRes]) => {
        const h = hRes.haseef
        setHaseef(h)
        setName(h.name)
        setDescription(h.description ?? '')
        const m = h.configJson?.model
        setModel(
          typeof m === 'string' ? m
          : typeof m === 'object' && m !== null ? (m as Record<string, unknown>).model as string ?? ''
          : ''
        )
        setInstructions((h.configJson?.instructions as string) ?? '')
        setProfileJson(h.profileJson ? JSON.stringify(h.profileJson, null, 2) : '{}')
        setActiveScopes(h.scopes ?? [])
        setAllScopes(sRes.scopes)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  const handleSave = async () => {
    if (!id || !haseef) return
    try {
      setSaving(true)
      setError('')
      setSuccess('')

      let parsedProfile: Record<string, unknown> = {}
      try {
        parsedProfile = JSON.parse(profileJson)
      } catch {
        setError('Invalid JSON in profile')
        return
      }

      const configJson = {
        ...haseef.configJson,
        model,
        instructions: instructions.trim() || undefined,
      }

      const { haseef: updated } = await updateHaseef(id, {
        name: name.trim(),
        description: description.trim() || undefined,
        configJson,
        profileJson: parsedProfile,
        scopes: activeScopes,
      })

      setHaseef(updated)
      setSuccess('Saved successfully')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!id) return
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    try {
      await deleteHaseef(id)
      navigate('/haseefs')
    } catch (err: any) {
      setError(err.message)
    }
  }

  const toggleScope = (scope: string) => {
    setActiveScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    )
  }

  if (loading) {
    return <div className="p-8 text-zinc-500">Loading...</div>
  }

  if (!haseef) {
    return <div className="p-8 text-red-400">Haseef not found</div>
  }

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          to="/haseefs"
          className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-2xl font-bold flex-1">{haseef.name}</h1>
        <Link
          to={`/live/${id}`}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-400 hover:text-emerald-400 border border-zinc-700 rounded-lg transition-colors"
        >
          <Radio size={14} />
          Live Feed
        </Link>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-sm">
          {success}
        </div>
      )}

      <div className="space-y-6">
        {/* Basic Info */}
        <section className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Basic Info
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm text-zinc-500">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
              />
            </label>
            <label className="block">
              <span className="text-sm text-zinc-500">Description</span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
              />
            </label>
          </div>
          <label className="block mt-4">
            <span className="text-sm text-zinc-500">ID</span>
            <input
              value={haseef.id}
              readOnly
              className="mt-1 w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-sm text-zinc-500 font-mono cursor-default"
            />
          </label>
        </section>

        {/* Model & Instructions */}
        <section className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Model & Instructions
          </h2>
          <label className="block">
            <span className="text-sm text-zinc-500">Model</span>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="mt-1 w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm font-mono focus:outline-none focus:border-emerald-500"
              placeholder="anthropic:claude-sonnet-4-20250514"
            />
          </label>
          <label className="block mt-4">
            <span className="text-sm text-zinc-500">Instructions</span>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={6}
              className="mt-1 w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500 resize-y"
              placeholder="You are a helpful assistant..."
            />
          </label>
        </section>

        {/* Scopes */}
        <section className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Active Scopes
          </h2>
          <p className="text-xs text-zinc-600 mb-3">
            Toggle which scopes this haseef has access to. Only connected scopes provide tools.
          </p>
          {allScopes.length === 0 ? (
            <p className="text-sm text-zinc-600">No scopes registered yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allScopes.map((s) => {
                const active = activeScopes.includes(s.name)
                return (
                  <button
                    key={s.name}
                    onClick={() => toggleScope(s.name)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      active
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                        : 'bg-zinc-800/50 border-zinc-700 text-zinc-500 hover:border-zinc-600'
                    }`}
                  >
                    <div
                      className={`w-2 h-2 rounded-full ${
                        s.connected ? 'bg-emerald-500' : 'bg-zinc-600'
                      }`}
                    />
                    {s.name}
                    <span className="text-xs opacity-60">({s.toolCount} tools)</span>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {/* Profile JSON */}
        <section className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Profile JSON
          </h2>
          <p className="text-xs text-zinc-600 mb-3">
            Identity fields used for event routing (phone, email, robotId, etc.)
          </p>
          <textarea
            value={profileJson}
            onChange={(e) => setProfileJson(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm font-mono focus:outline-none focus:border-emerald-500 resize-y"
          />
        </section>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 border border-red-500/20 rounded-lg transition-colors"
          >
            <Trash2 size={14} />
            Delete Haseef
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Save size={14} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
