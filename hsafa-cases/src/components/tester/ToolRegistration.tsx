import { useState, useCallback, useEffect } from 'react'
import { Wrench, Plus, Trash2, RefreshCw, Upload } from 'lucide-react'
import { useConfig } from '../../lib/config-context'
import type { ToolDefinition } from '../../lib/core-client'

const DEFAULT_TOOL: ToolDefinition = {
  name: 'greet',
  description: 'Greet a person by name',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the person to greet' },
    },
    required: ['name'],
  },
  mode: 'sync',
  timeout: 30000,
}

const EXAMPLE_TOOLS: ToolDefinition[] = [
  {
    name: 'greet',
    description: 'Greet a person by name and return a greeting message',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the person to greet' },
        style: { type: 'string', enum: ['formal', 'casual', 'funny'], description: 'Greeting style' },
      },
      required: ['name'],
    },
    mode: 'sync',
    timeout: 30000,
  },
  {
    name: 'log_event',
    description: 'Log an event to the tester console (fire and forget)',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Event message to log' },
        level: { type: 'string', enum: ['info', 'warn', 'error'], description: 'Log level' },
      },
      required: ['message'],
    },
    mode: 'fire_and_forget',
  },
  {
    name: 'ask_user',
    description: 'Ask the user a question and wait for their response',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to ask' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of answer options',
        },
      },
      required: ['question'],
    },
    mode: 'sync',
    timeout: 120000,
  },
]

export default function ToolRegistration() {
  const { client, haseefId } = useConfig()
  const [scope, setScope] = useState('tester')
  const [tools, setTools] = useState<ToolDefinition[]>([DEFAULT_TOOL])
  const [editIdx, setEditIdx] = useState<number | null>(0)
  const [editJson, setEditJson] = useState(JSON.stringify(DEFAULT_TOOL, null, 2))
  const [registeredTools, setRegisteredTools] = useState<unknown[]>([])
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')

  const loadTools = useCallback(async () => {
    if (!client || !haseefId) return
    try {
      const res = await client.listTools(haseefId)
      setRegisteredTools(res.tools ?? [])
    } catch {}
  }, [client, haseefId])

  useEffect(() => {
    loadTools()
  }, [loadTools])

  const syncTools = async () => {
    if (!client || !haseefId) return
    setSyncing(true)
    setMsg('')
    try {
      await client.syncTools(haseefId, scope, tools)
      setMsg(`Synced ${tools.length} tool(s) to scope "${scope}"`)
      await loadTools()
    } catch (err: any) {
      setMsg(`Error: ${err.message}`)
    }
    setSyncing(false)
  }

  const addTool = () => {
    const t: ToolDefinition = {
      name: `tool_${tools.length + 1}`,
      description: 'New tool',
      inputSchema: { type: 'object', properties: {}, required: [] },
      mode: 'sync',
      timeout: 30000,
    }
    setTools([...tools, t])
    setEditIdx(tools.length)
    setEditJson(JSON.stringify(t, null, 2))
  }

  const removeTool = (idx: number) => {
    setTools(tools.filter((_, i) => i !== idx))
    if (editIdx === idx) {
      setEditIdx(null)
      setEditJson('')
    }
  }

  const selectTool = (idx: number) => {
    setEditIdx(idx)
    setEditJson(JSON.stringify(tools[idx], null, 2))
  }

  const applyEdit = () => {
    if (editIdx === null) return
    try {
      const parsed = JSON.parse(editJson)
      const updated = [...tools]
      updated[editIdx] = parsed
      setTools(updated)
      setMsg('')
    } catch (err: any) {
      setMsg('Invalid JSON: ' + err.message)
    }
  }

  const loadExamples = () => {
    setTools(EXAMPLE_TOOLS)
    setEditIdx(0)
    setEditJson(JSON.stringify(EXAMPLE_TOOLS[0], null, 2))
  }

  const deleteScope = async () => {
    if (!client || !haseefId || !confirm(`Delete all tools in scope "${scope}"?`)) return
    try {
      await client.deleteScope(haseefId, scope)
      setMsg(`Deleted scope "${scope}"`)
      await loadTools()
    } catch (err: any) {
      setMsg('Error: ' + err.message)
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Wrench size={14} className="text-cyan-400" />
          Tool Registration
        </h3>
        <div className="flex gap-1">
          <button
            onClick={loadExamples}
            className="px-2 py-1 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded transition-colors"
          >
            Load Examples
          </button>
          <button
            onClick={loadTools}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
            title="Refresh registered tools"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Scope + Sync */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="text-xs text-zinc-500 mb-1 block">Scope</label>
          <input
            type="text"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
        <div className="flex gap-1 pt-4">
          <button
            onClick={syncTools}
            disabled={!client || !haseefId || syncing || tools.length === 0}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors disabled:opacity-40"
          >
            <Upload size={12} />
            {syncing ? 'Syncing...' : `Sync ${tools.length} Tool(s)`}
          </button>
          <button
            onClick={deleteScope}
            disabled={!client || !haseefId}
            className="px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            Delete Scope
          </button>
        </div>
      </div>

      {/* Tool list */}
      <div className="flex gap-2">
        <div className="w-40 shrink-0 space-y-1">
          {tools.map((t, i) => (
            <div
              key={i}
              className={`flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                editIdx === i ? 'bg-cyan-500/15 text-cyan-400' : 'hover:bg-zinc-800 text-zinc-400'
              }`}
            >
              <button onClick={() => selectTool(i)} className="text-xs font-mono truncate flex-1 text-left">
                {t.name}
              </button>
              <button
                onClick={() => removeTool(i)}
                className="p-0.5 text-zinc-600 hover:text-red-400 transition-colors"
              >
                <Trash2 size={10} />
              </button>
            </div>
          ))}
          <button
            onClick={addTool}
            className="flex items-center gap-1 w-full px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <Plus size={10} /> Add Tool
          </button>
        </div>

        {/* Editor */}
        {editIdx !== null && (
          <div className="flex-1 space-y-2">
            <textarea
              value={editJson}
              onChange={(e) => setEditJson(e.target.value)}
              rows={10}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-cyan-500/50 resize-y"
            />
            <button
              onClick={applyEdit}
              className="px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
            >
              Apply Changes
            </button>
          </div>
        )}
      </div>

      {/* Registered tools from server */}
      {registeredTools.length > 0 && (
        <div>
          <span className="text-[10px] text-zinc-500 block mb-1">
            Registered on server ({registeredTools.length})
          </span>
          <div className="flex flex-wrap gap-1">
            {registeredTools.map((t: any, i) => (
              <span
                key={i}
                className="px-2 py-0.5 text-[10px] font-mono bg-zinc-800 text-zinc-400 rounded"
                title={`${t.scope}/${t.name} (${t.mode})`}
              >
                {t.scope}/{t.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {msg && (
        <p className={`text-xs ${msg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
          {msg}
        </p>
      )}
    </div>
  )
}
