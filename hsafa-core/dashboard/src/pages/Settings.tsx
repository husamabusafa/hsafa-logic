import { useState } from 'react'
import { Key, CheckCircle2, XCircle } from 'lucide-react'
import { getApiKey, setApiKey } from '../lib/api'

export default function SettingsPage() {
  const [key, setKey] = useState(getApiKey())
  const [saved, setSaved] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)

  const handleSave = () => {
    setApiKey(key.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleTest = async () => {
    setTestResult(null)
    try {
      const res = await fetch('/api/haseefs', {
        headers: { 'x-api-key': key.trim() },
      })
      setTestResult(res.ok ? 'success' : 'error')
    } catch {
      setTestResult('error')
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <section className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Key size={14} />
          API Key
        </h2>
        <p className="text-xs text-zinc-600 mb-3">
          The API key is stored in your browser's localStorage and sent as the <code className="text-zinc-400">x-api-key</code> header on every request.
        </p>

        <div className="flex gap-2">
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm font-mono focus:outline-none focus:border-emerald-500"
            placeholder="your-api-key"
          />
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {saved ? 'Saved!' : 'Save'}
          </button>
          <button
            onClick={handleTest}
            className="px-4 py-2 border border-zinc-700 hover:border-zinc-600 text-zinc-300 rounded-lg text-sm transition-colors"
          >
            Test
          </button>
        </div>

        {testResult && (
          <div
            className={`mt-3 flex items-center gap-2 text-sm ${
              testResult === 'success' ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {testResult === 'success' ? (
              <>
                <CheckCircle2 size={14} /> Connection successful
              </>
            ) : (
              <>
                <XCircle size={14} /> Connection failed — check your API key
              </>
            )}
          </div>
        )}
      </section>

      <section className="mt-6 bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          About
        </h2>
        <div className="text-sm text-zinc-500 space-y-1">
          <p>Hsafa Core v7 Dashboard</p>
          <p>
            Core API proxied via Vite dev server to{' '}
            <code className="text-zinc-400">localhost:3001</code>
          </p>
        </div>
      </section>
    </div>
  )
}
