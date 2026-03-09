import { useState, useEffect, useRef, useCallback } from 'react'
import { Zap, Play, Square, Trash2, Send, Clock } from 'lucide-react'
import { useConfig } from '../../lib/config-context'
import type { ActionEvent } from '../../lib/core-client'

interface ActionEntry {
  id: number
  time: string
  action: ActionEvent
  status: 'pending' | 'responded' | 'auto'
  result?: string
}

export default function ActionStream() {
  const { client, haseefId } = useConfig()
  const [scope, setScope] = useState('tester')
  const [connected, setConnected] = useState(false)
  const [actions, setActions] = useState<ActionEntry[]>([])
  const [autoRespond, setAutoRespond] = useState(false)
  const [autoResult, setAutoResult] = useState('{ "ok": true }')
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const idRef = useRef(0)

  const connect = useCallback(() => {
    if (!client || !haseefId || abortRef.current) return

    setConnected(true)

    const controller = client.connectActionStream(
      haseefId,
      scope,
      (action) => {
        const entry: ActionEntry = {
          id: idRef.current++,
          time: new Date().toLocaleTimeString(),
          action,
          status: 'pending',
        }

        setActions((prev) => [entry, ...prev.slice(0, 99)])

        // Auto-respond if enabled
        if (autoRespond && action.mode === 'sync') {
          try {
            const result = JSON.parse(autoResult)
            client.submitActionResult(haseefId, action.actionId, result).then(() => {
              setActions((prev) =>
                prev.map((a) =>
                  a.action.actionId === action.actionId
                    ? { ...a, status: 'auto', result: autoResult }
                    : a,
                ),
              )
            })
          } catch {}
        }
      },
      () => {
        setConnected(false)
        abortRef.current = null
      },
    )

    abortRef.current = controller
  }, [client, haseefId, scope, autoRespond, autoResult])

  const disconnect = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setConnected(false)
  }, [])

  useEffect(() => {
    return () => disconnect()
  }, [disconnect])

  const respondToAction = async (actionId: string, resultStr: string) => {
    if (!client || !haseefId) return
    try {
      const result = JSON.parse(resultStr)
      await client.submitActionResult(haseefId, actionId, result)
      setActions((prev) =>
        prev.map((a) =>
          a.action.actionId === actionId
            ? { ...a, status: 'responded', result: resultStr }
            : a,
        ),
      )
    } catch (err: any) {
      alert('Error: ' + err.message)
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Zap size={14} className="text-amber-400" />
          Action Stream
          {connected && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActions([])}
            className="p-1.5 text-zinc-600 hover:text-zinc-400 rounded-lg transition-colors"
          >
            <Trash2 size={14} />
          </button>
          {connected ? (
            <button
              onClick={disconnect}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 rounded-lg transition-colors"
            >
              <Square size={10} /> Stop
            </button>
          ) : (
            <button
              onClick={connect}
              disabled={!client || !haseefId}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 rounded-lg transition-colors disabled:opacity-40"
            >
              <Play size={10} /> Connect
            </button>
          )}
        </div>
      </div>

      {/* Connection settings */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="text-xs text-zinc-500 mb-1 block">Scope</label>
          <input
            type="text"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            disabled={connected}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
          />
        </div>
        <div className="flex items-center gap-2 pt-4">
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRespond}
              onChange={(e) => setAutoRespond(e.target.checked)}
              className="rounded border-zinc-600"
            />
            Auto-respond
          </label>
        </div>
      </div>

      {autoRespond && (
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Auto-response (JSON)</label>
          <input
            type="text"
            value={autoResult}
            onChange={(e) => setAutoResult(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-amber-500/50"
          />
        </div>
      )}

      {/* Actions list */}
      <div ref={scrollRef} className="max-h-96 overflow-y-auto space-y-2">
        {actions.length === 0 ? (
          <p className="text-xs text-zinc-600 text-center py-4">
            {connected
              ? 'Waiting for tool calls from the Haseef...'
              : 'Connect to receive action requests from the Haseef'}
          </p>
        ) : (
          actions.map((entry) => (
            <ActionCard
              key={entry.id}
              entry={entry}
              onRespond={respondToAction}
            />
          ))
        )}
      </div>
    </div>
  )
}

function ActionCard({
  entry,
  onRespond,
}: {
  entry: ActionEntry
  onRespond: (actionId: string, result: string) => void
}) {
  const [resultStr, setResultStr] = useState('{ "ok": true }')
  const [expanded, setExpanded] = useState(entry.status === 'pending')

  const statusColor =
    entry.status === 'pending'
      ? 'border-amber-500/30 bg-amber-500/5'
      : entry.status === 'auto'
        ? 'border-blue-500/30 bg-blue-500/5'
        : 'border-emerald-500/30 bg-emerald-500/5'

  return (
    <div
      className={`border rounded-lg p-3 space-y-2 ${statusColor}`}
    >
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-left flex-1 min-w-0"
        >
          <span className="text-xs font-mono font-semibold text-zinc-200 truncate">
            {entry.action.name}
          </span>
          <span className="text-[10px] text-zinc-500 shrink-0">
            {entry.action.mode}
          </span>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-zinc-600">{entry.time}</span>
          {entry.status === 'pending' && (
            <Clock size={12} className="text-amber-400 animate-pulse" />
          )}
          {entry.status === 'responded' && (
            <span className="text-[10px] text-emerald-400">Responded</span>
          )}
          {entry.status === 'auto' && (
            <span className="text-[10px] text-blue-400">Auto</span>
          )}
        </div>
      </div>

      {expanded && (
        <>
          <div className="bg-zinc-900/50 rounded p-2">
            <span className="text-[10px] text-zinc-500 block mb-1">Input Args</span>
            <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap overflow-x-auto">
              {JSON.stringify(entry.action.args, null, 2)}
            </pre>
          </div>

          {entry.result && (
            <div className="bg-zinc-900/50 rounded p-2">
              <span className="text-[10px] text-zinc-500 block mb-1">Result</span>
              <pre className="text-xs font-mono text-emerald-300 whitespace-pre-wrap">
                {entry.result}
              </pre>
            </div>
          )}

          {entry.status === 'pending' && entry.action.mode === 'sync' && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={resultStr}
                onChange={(e) => setResultStr(e.target.value)}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/50"
                placeholder="Result JSON..."
              />
              <button
                onClick={() => onRespond(entry.action.actionId, resultStr)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors"
              >
                <Send size={10} /> Send
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
