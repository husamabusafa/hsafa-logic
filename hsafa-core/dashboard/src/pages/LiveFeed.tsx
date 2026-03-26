import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Radio, Trash2 } from 'lucide-react'
import { connectHaseefStream, getHaseef, type Haseef } from '../lib/api'

interface StreamEvent {
  id: number
  timestamp: string
  data: unknown
}

export default function LiveFeedPage() {
  const { id } = useParams<{ id: string }>()
  const [haseef, setHaseef] = useState<Haseef | null>(null)
  const [events, setEvents] = useState<StreamEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const counterRef = useRef(0)

  useEffect(() => {
    if (!id) return
    getHaseef(id)
      .then(({ haseef }) => setHaseef(haseef))
      .catch((err) => setError(err.message))
  }, [id])

  useEffect(() => {
    if (!id) return

    setConnected(true)
    const disconnect = connectHaseefStream(
      id,
      (data) => {
        counterRef.current++
        setEvents((prev) => {
          const next = [
            ...prev,
            {
              id: counterRef.current,
              timestamp: new Date().toISOString(),
              data,
            },
          ]
          // Keep last 200 events
          return next.slice(-200)
        })
      },
      () => {
        setConnected(false)
      },
    )

    return () => {
      disconnect()
      setConnected(false)
    }
  }, [id])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events])

  return (
    <div className="p-8 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <Link
          to={`/haseefs/${id}`}
          className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">
            Live Feed — {haseef?.name ?? id?.slice(0, 8)}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <div
              className={`w-2 h-2 rounded-full ${
                connected ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'
              }`}
            />
            <span className="text-xs text-zinc-500">
              {connected ? 'Connected to stream' : 'Disconnected'}
            </span>
          </div>
        </div>
        <button
          onClick={() => setEvents([])}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-lg transition-colors"
        >
          <Trash2 size={14} />
          Clear
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm shrink-0">
          {error}
        </div>
      )}

      {/* Event stream */}
      <div
        ref={scrollRef}
        className="flex-1 bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-y-auto font-mono text-xs"
      >
        {events.length === 0 ? (
          <div className="flex items-center justify-center h-full text-zinc-600">
            <div className="text-center">
              <Radio size={32} className="mx-auto mb-2 opacity-30" />
              <p>Waiting for events...</p>
              <p className="text-zinc-700 mt-1">Events will appear here when the haseef thinks.</p>
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-1">
            {events.map((e) => (
              <div key={e.id} className="flex gap-2">
                <span className="text-zinc-600 shrink-0 w-20">
                  {new Date(e.timestamp).toLocaleTimeString()}
                </span>
                <pre className="text-zinc-400 whitespace-pre-wrap break-all">
                  {typeof e.data === 'string' ? e.data : JSON.stringify(e.data, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
