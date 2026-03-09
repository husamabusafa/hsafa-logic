import { useState } from 'react'
import { Send, Plus, Trash2 } from 'lucide-react'
import { useConfig } from '../../lib/config-context'

const PRESETS = [
  {
    label: 'Text Message',
    event: {
      scope: 'tester',
      type: 'message',
      data: { from: 'Husam', text: '' },
    },
  },
  {
    label: 'Sensor Update',
    event: {
      scope: 'iot',
      type: 'sensor_update',
      data: { device: 'thermometer-1', temperature: 23.5, unit: 'celsius' },
    },
  },
  {
    label: 'Reminder',
    event: {
      scope: 'cron',
      type: 'reminder',
      data: { message: 'Time to check in' },
    },
  },
  {
    label: 'Custom JSON',
    event: {
      scope: 'custom',
      type: 'event',
      data: {},
    },
  },
]

export default function EventPusher() {
  const { client, haseefId } = useConfig()
  const [scope, setScope] = useState('tester')
  const [type, setType] = useState('message')
  const [dataStr, setDataStr] = useState('{\n  "from": "Husam",\n  "text": "Hello!"\n}')
  const [sending, setSending] = useState(false)
  const [log, setLog] = useState<Array<{ time: string; status: 'ok' | 'error'; msg: string }>>([])

  const pushEvent = async () => {
    if (!client || !haseefId) return
    setSending(true)
    try {
      const data = JSON.parse(dataStr)
      const event = {
        eventId: `tester-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        scope,
        type,
        data,
        timestamp: new Date().toISOString(),
      }
      const res = await client.pushEvents(haseefId, [event])
      setLog((prev) => [
        { time: new Date().toLocaleTimeString(), status: 'ok', msg: `Pushed ${res.pushed} event(s) — ${scope}:${type}` },
        ...prev.slice(0, 49),
      ])
    } catch (err: any) {
      setLog((prev) => [
        { time: new Date().toLocaleTimeString(), status: 'error', msg: err.message },
        ...prev.slice(0, 49),
      ])
    }
    setSending(false)
  }

  const applyPreset = (idx: number) => {
    const p = PRESETS[idx]
    setScope(p.event.scope)
    setType(p.event.type)
    setDataStr(JSON.stringify(p.event.data, null, 2))
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Send size={14} className="text-blue-400" />
          Event Pusher
        </h3>
        <div className="flex gap-1">
          {PRESETS.map((p, i) => (
            <button
              key={i}
              onClick={() => applyPreset(i)}
              className="px-2 py-1 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Scope</label>
          <input
            type="text"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-blue-500/50"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Type</label>
          <input
            type="text"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-blue-500/50"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-zinc-500 mb-1 block">Data (JSON)</label>
        <textarea
          value={dataStr}
          onChange={(e) => setDataStr(e.target.value)}
          rows={4}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono text-zinc-100 focus:outline-none focus:border-blue-500/50 resize-y"
        />
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={pushEvent}
          disabled={!client || !haseefId || sending}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-40"
        >
          <Plus size={14} />
          {sending ? 'Pushing...' : 'Push Event'}
        </button>
        {log.length > 0 && (
          <button
            onClick={() => setLog([])}
            className="p-1.5 text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {log.length > 0 && (
        <div className="max-h-32 overflow-y-auto space-y-1">
          {log.map((entry, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="text-zinc-600 shrink-0">{entry.time}</span>
              <span className={entry.status === 'ok' ? 'text-emerald-400' : 'text-red-400'}>
                {entry.msg}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
