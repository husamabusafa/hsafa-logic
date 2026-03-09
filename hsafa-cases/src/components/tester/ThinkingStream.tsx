import { useState, useEffect, useRef, useCallback } from 'react'
import { Brain, Play, Square, Trash2, ChevronDown } from 'lucide-react'
import { useConfig } from '../../lib/config-context'
import type { StreamEvent } from '../../lib/core-client'

interface StreamEntry {
  id: number
  time: string
  event: StreamEvent
}

const EVENT_COLORS: Record<string, string> = {
  'text.delta': 'text-zinc-300',
  'tool.started': 'text-yellow-400',
  'tool-input.delta': 'text-amber-300',
  'tool.ready': 'text-blue-400',
  'tool.done': 'text-emerald-400',
  'tool.error': 'text-red-400',
  'step.finish': 'text-purple-400',
  'run.start': 'text-cyan-400',
  'run.finish': 'text-cyan-400',
}

const EVENT_LABELS: Record<string, string> = {
  'text.delta': 'TEXT',
  'tool.started': 'TOOL START',
  'tool-input.delta': 'TOOL INPUT',
  'tool.ready': 'TOOL READY',
  'tool.done': 'TOOL DONE',
  'tool.error': 'TOOL ERROR',
  'step.finish': 'STEP',
  'run.start': 'RUN START',
  'run.finish': 'RUN FINISH',
}

export default function ThinkingStream() {
  const { client, haseefId } = useConfig()
  const [connected, setConnected] = useState(false)
  const [entries, setEntries] = useState<StreamEntry[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const [textAccum, setTextAccum] = useState('')
  const [toolInputAccum, setToolInputAccum] = useState<Record<string, string>>({})
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const idRef = useRef(0)

  const addEntry = useCallback((event: StreamEvent) => {
    setEntries((prev) => {
      const next = [...prev, { id: idRef.current++, time: new Date().toLocaleTimeString(), event }]
      return next.length > 500 ? next.slice(-500) : next
    })
  }, [])

  const connect = useCallback(() => {
    if (!client || !haseefId || abortRef.current) return

    setConnected(true)

    const controller = client.connectThinkingStream(
      haseefId,
      (event) => {
        addEntry(event)

        if (event.type === 'text.delta' && event.text) {
          setTextAccum((prev) => prev + event.text)
        }

        if (event.type === 'tool-input.delta' && event.streamId && event.delta) {
          setToolInputAccum((prev) => ({
            ...prev,
            [event.streamId!]: (prev[event.streamId!] ?? '') + event.delta,
          }))
        }

        if (event.type === 'tool.ready' || event.type === 'tool.done' || event.type === 'tool.error') {
          if (event.streamId) {
            setToolInputAccum((prev) => {
              const next = { ...prev }
              delete next[event.streamId!]
              return next
            })
          }
        }

        if (event.type === 'step.finish' || event.type === 'run.finish') {
          setTextAccum('')
        }
      },
      () => {
        setConnected(false)
        abortRef.current = null
      },
    )

    abortRef.current = controller
  }, [client, haseefId, addEntry])

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

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries, autoScroll])

  const renderEventContent = (event: StreamEvent) => {
    switch (event.type) {
      case 'text.delta':
        return <span className="text-zinc-300 font-mono text-xs">{event.text}</span>
      case 'tool.started':
        return <span className="font-mono text-xs">{event.toolName}</span>
      case 'tool-input.delta':
        return (
          <span className="font-mono text-xs">
            <span className="text-zinc-500">{event.toolName}</span>{' '}
            <span className="text-amber-200">{event.delta}</span>
          </span>
        )
      case 'tool.ready':
        return (
          <span className="font-mono text-xs">
            <span className="text-blue-300">{event.toolName}</span>
            <span className="text-zinc-500">(</span>
            <span className="text-zinc-400">{JSON.stringify(event.args)}</span>
            <span className="text-zinc-500">)</span>
          </span>
        )
      case 'tool.done':
        return (
          <span className="font-mono text-xs">
            <span className="text-emerald-300">{event.toolName}</span>
            <span className="text-zinc-500"> → </span>
            <span className="text-zinc-400">{JSON.stringify(event.result)?.slice(0, 200)}</span>
          </span>
        )
      case 'tool.error':
        return (
          <span className="font-mono text-xs">
            <span className="text-red-300">{event.toolName}</span>
            <span className="text-zinc-500"> → </span>
            <span className="text-red-400">{event.error}</span>
          </span>
        )
      case 'step.finish':
        return <span className="text-xs text-purple-300">reason: {event.finishReason}</span>
      default:
        return <span className="font-mono text-xs text-zinc-500">{JSON.stringify(event).slice(0, 200)}</span>
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3 flex flex-col">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Brain size={14} className="text-purple-400" />
          Consciousness Stream
          {connected && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1.5 rounded-lg transition-colors ${autoScroll ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-500 hover:text-zinc-300'}`}
            title="Auto-scroll"
          >
            <ChevronDown size={14} />
          </button>
          <button
            onClick={() => { setEntries([]); setTextAccum(''); setToolInputAccum({}) }}
            className="p-1.5 text-zinc-600 hover:text-zinc-400 rounded-lg transition-colors"
            title="Clear"
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
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 rounded-lg transition-colors disabled:opacity-40"
            >
              <Play size={10} /> Connect
            </button>
          )}
        </div>
      </div>

      {/* Live accumulators */}
      {(textAccum || Object.keys(toolInputAccum).length > 0) && (
        <div className="space-y-2">
          {textAccum && (
            <div className="bg-zinc-800/50 rounded-lg p-2">
              <span className="text-[10px] text-zinc-500 block mb-1">Internal Text</span>
              <p className="text-xs text-zinc-300 font-mono whitespace-pre-wrap">{textAccum}</p>
            </div>
          )}
          {Object.entries(toolInputAccum).map(([streamId, partial]) => (
            <div key={streamId} className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-2">
              <span className="text-[10px] text-amber-400 block mb-1">
                Building tool input... <span className="text-zinc-500">{streamId.slice(0, 8)}</span>
              </span>
              <p className="text-xs text-amber-200 font-mono whitespace-pre-wrap">{partial}</p>
            </div>
          ))}
        </div>
      )}

      {/* Event log */}
      <div
        ref={scrollRef}
        className="max-h-80 overflow-y-auto space-y-0.5 scrollbar-thin"
      >
        {entries.length === 0 ? (
          <p className="text-xs text-zinc-600 text-center py-4">
            {connected ? 'Waiting for events...' : 'Connect to watch the Haseef think in real-time'}
          </p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="flex items-start gap-2 text-xs py-0.5 hover:bg-zinc-800/30 px-1 rounded">
              <span className="text-zinc-600 shrink-0 w-16">{entry.time}</span>
              <span
                className={`shrink-0 w-20 text-right font-mono text-[10px] ${EVENT_COLORS[entry.event.type] ?? 'text-zinc-500'}`}
              >
                {EVENT_LABELS[entry.event.type] ?? entry.event.type}
              </span>
              <div className="min-w-0 flex-1 overflow-hidden">
                {renderEventContent(entry.event)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
