import { useState, useEffect, useRef, useCallback } from 'react'
import { Mic, Send, Power, PowerOff, Trash2, Keyboard, Volume2, VolumeX } from 'lucide-react'
import { useConfig } from '../lib/config-context'
import { ElevenLabsTTS } from '../lib/elevenlabs-tts'
import { ElevenLabsSTT } from '../lib/elevenlabs-stt'
import type { StreamEvent } from '../lib/core-client'

const NOVA_ID = import.meta.env.VITE_SPEAKER_HASEEF_ID ?? ''
const ELEVENLABS_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY ?? ''
const ELEVENLABS_VOICE = import.meta.env.VITE_ELEVENLABS_VOICE_ID ?? ''
const SCOPE = 'speaker'

type OrbState = 'offline' | 'idle' | 'listening' | 'thinking' | 'speaking'

interface TranscriptEntry {
  id: number
  role: 'user' | 'nova'
  text: string
  streaming?: boolean
}

export default function SpeakerPage() {
  const { client } = useConfig()

  // Nova process state
  const [novaRunning, setNovaRunning] = useState(false)
  const [streamConnected, setStreamConnected] = useState(false)

  // Voice state
  const [orbState, setOrbState] = useState<OrbState>('offline')
  const [audioLevel, setAudioLevel] = useState(0)
  const [ttsEnabled, setTtsEnabled] = useState(!!ELEVENLABS_KEY)
  const [interimText, setInterimText] = useState('')

  // Transcript
  const [entries, setEntries] = useState<TranscriptEntry[]>([])
  const [showTextInput, setShowTextInput] = useState(false)
  const [textInput, setTextInput] = useState('')
  const [sending, setSending] = useState(false)

  // Refs
  const abortRef = useRef<AbortController | null>(null)
  const ttsRef = useRef<ElevenLabsTTS | null>(null)
  const sttRef = useRef<ElevenLabsSTT | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const idRef = useRef(0)
  const streamingIdRef = useRef<number | null>(null)
  const novaTextBufferRef = useRef('')
  const flushTimerRef = useRef<number | null>(null)

  // ── Auto-scroll ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries, interimText])

  // ── Check Nova status on mount ───────────────────────────────────────────

  useEffect(() => {
    if (!client) return
    client.getStatus(NOVA_ID).then(s => {
      setNovaRunning(s.running)
      if (s.running) setOrbState('idle')
    }).catch(() => {})
  }, [client])

  // ── TTS setup ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!ELEVENLABS_KEY) return

    const tts = new ElevenLabsTTS({
      apiKey: ELEVENLABS_KEY,
      voiceId: ELEVENLABS_VOICE || undefined,
      onStateChange: (state) => {
        if (state === 'speaking') setOrbState('speaking')
        else if (state === 'idle' && streamingIdRef.current === null) setOrbState('idle')
      },
      onError: (err) => console.error('[tts]', err),
    })

    ttsRef.current = tts
    return () => { tts.disconnect(); ttsRef.current = null }
  }, [])

  // ── STT setup ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!ELEVENLABS_KEY) return

    const stt = new ElevenLabsSTT({
      apiKey: ELEVENLABS_KEY,
      onTranscript: (text, isFinal) => {
        if (isFinal && text.trim()) {
          setInterimText('')
          sendToNova(text.trim())
        } else {
          setInterimText(text)
        }
      },
      onStateChange: (state) => {
        if (state === 'listening') setOrbState('listening')
        else if (state === 'transcribing') setOrbState('thinking')
        else if (state === 'idle') {
          if (orbState === 'listening' || orbState === 'thinking') setOrbState('idle')
        }
      },
      onAudioLevel: setAudioLevel,
      onError: (err) => console.error('[stt]', err),
    })

    sttRef.current = stt
    return () => { stt.destroy(); sttRef.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Connect to Nova's stream ─────────────────────────────────────────────

  const connectStream = useCallback(() => {
    if (!client || abortRef.current) return

    const controller = client.connectThinkingStream(
      NOVA_ID,
      (event: StreamEvent) => {
        if (event.type === 'run.started') {
          const msgId = idRef.current++
          streamingIdRef.current = msgId
          novaTextBufferRef.current = ''
          setOrbState('thinking')
          setEntries(prev => [...prev, {
            id: msgId,
            role: 'nova',
            text: '',
            streaming: true,
          }])

          // Start TTS utterance
          if (ttsEnabled && ttsRef.current) {
            ttsRef.current.connect().then(() => {
              ttsRef.current?.startUtterance()
            }).catch(() => {})
          }
        }

        if (event.type === 'text.delta' && event.text && streamingIdRef.current !== null) {
          const sid = streamingIdRef.current
          setEntries(prev => prev.map(m =>
            m.id === sid ? { ...m, text: m.text + event.text } : m
          ))
          setOrbState('speaking')

          // Buffer text for TTS — flush on punctuation or after delay
          if (ttsEnabled && ttsRef.current) {
            novaTextBufferRef.current += event.text

            // Flush on sentence-ending punctuation
            if (/[.!?;]\s*$/.test(novaTextBufferRef.current)) {
              ttsRef.current.sendChunk(novaTextBufferRef.current)
              novaTextBufferRef.current = ''
              if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
            } else {
              // Flush after 400ms of no new deltas
              if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
              flushTimerRef.current = window.setTimeout(() => {
                if (novaTextBufferRef.current && ttsRef.current) {
                  ttsRef.current.sendChunk(novaTextBufferRef.current)
                  novaTextBufferRef.current = ''
                }
              }, 400)
            }
          }
        }

        if (event.type === 'run.finished' && streamingIdRef.current !== null) {
          const sid = streamingIdRef.current
          streamingIdRef.current = null

          // Flush remaining text to TTS
          if (ttsEnabled && ttsRef.current) {
            if (novaTextBufferRef.current) {
              ttsRef.current.sendChunk(novaTextBufferRef.current)
              novaTextBufferRef.current = ''
            }
            if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
            ttsRef.current.finishUtterance()
          }

          setEntries(prev => prev.map(m =>
            m.id === sid ? { ...m, streaming: false } : m
          ))

          // Orb goes idle after TTS finishes (handled by TTS onStateChange)
          if (!ttsEnabled) setOrbState('idle')
        }
      },
      () => {
        setStreamConnected(false)
        abortRef.current = null
      },
    )

    abortRef.current = controller
    setStreamConnected(true)
  }, [client, ttsEnabled, orbState])

  const disconnectStream = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStreamConnected(false)
  }, [])

  useEffect(() => () => disconnectStream(), [disconnectStream])

  // ── Send message to Nova ─────────────────────────────────────────────────

  const sendToNova = useCallback(async (text: string) => {
    if (!client || !text.trim()) return

    setEntries(prev => [...prev, {
      id: idRef.current++,
      role: 'user',
      text: text.trim(),
    }])

    try {
      await client.pushEvents(NOVA_ID, [{
        eventId: `speaker-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        scope: SCOPE,
        type: 'message',
        data: { from: 'User', text: text.trim() },
        timestamp: new Date().toISOString(),
      }])
    } catch (err: any) {
      console.error('Send failed:', err.message)
    }
  }, [client])

  // ── Start / Stop Nova ────────────────────────────────────────────────────

  const toggleNova = async () => {
    if (!client) return
    try {
      if (novaRunning) {
        await client.stop(NOVA_ID)
        setNovaRunning(false)
        setOrbState('offline')
        disconnectStream()
        sttRef.current?.stopRecording()
        ttsRef.current?.stopPlayback()
      } else {
        await client.start(NOVA_ID)
        setNovaRunning(true)
        setOrbState('idle')
        setTimeout(() => connectStream(), 1000)
      }
    } catch (err: any) {
      console.error('Toggle Nova:', err.message)
    }
  }

  // ── Mic toggle ───────────────────────────────────────────────────────────

  const toggleMic = () => {
    if (!sttRef.current || !novaRunning) return

    if (sttRef.current.currentState === 'listening') {
      sttRef.current.stopRecording()
      setOrbState('idle')
    } else {
      // Stop TTS if speaking
      ttsRef.current?.stopPlayback()
      sttRef.current.startRecording()
    }
  }

  // ── Text input submit ────────────────────────────────────────────────────

  const handleTextSubmit = async () => {
    if (!textInput.trim() || sending) return
    const text = textInput.trim()
    setTextInput('')
    setSending(true)
    await sendToNova(text)
    setSending(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleTextSubmit()
    }
  }

  // ── Orb visuals ──────────────────────────────────────────────────────────

  const orbAnimClass = {
    offline: '',
    idle: 'orb-idle',
    listening: 'orb-listening',
    thinking: 'orb-thinking',
    speaking: 'orb-speaking',
  }[orbState]

  const orbGradient = {
    offline: 'from-zinc-700 to-zinc-800',
    idle: 'from-violet-600 via-indigo-600 to-blue-600',
    listening: 'from-cyan-500 via-blue-500 to-indigo-500',
    thinking: 'from-violet-500 via-purple-600 to-fuchsia-600',
    speaking: 'from-violet-500 via-purple-500 to-indigo-600',
  }[orbState]

  const orbGlow = {
    offline: '',
    idle: 'shadow-[0_0_40px_rgba(139,92,246,0.2)]',
    listening: 'shadow-[0_0_60px_rgba(56,189,248,0.4)]',
    thinking: 'shadow-[0_0_50px_rgba(168,85,247,0.3)]',
    speaking: 'shadow-[0_0_70px_rgba(139,92,246,0.5)]',
  }[orbState]

  const statusText = {
    offline: 'Nova is offline',
    idle: 'Ready',
    listening: 'Listening...',
    thinking: 'Thinking...',
    speaking: 'Speaking...',
  }[orbState]

  const statusColor = {
    offline: 'text-zinc-600',
    idle: 'text-zinc-400',
    listening: 'text-cyan-400',
    thinking: 'text-purple-400',
    speaking: 'text-violet-400',
  }[orbState]

  // ── Dynamic orb scale for mic input ──────────────────────────────────────

  const micScale = orbState === 'listening' ? 1 + audioLevel * 0.15 : 1

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] items-center">

      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div className="w-full flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-zinc-300">Nova</span>
          {novaRunning && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Online
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {ttsEnabled ? (
            <button
              onClick={() => { setTtsEnabled(false); ttsRef.current?.stopPlayback() }}
              className="p-2 text-violet-400 hover:bg-zinc-800 rounded-lg transition-colors"
              title="Disable TTS"
            >
              <Volume2 size={16} />
            </button>
          ) : (
            <button
              onClick={() => setTtsEnabled(true)}
              className="p-2 text-zinc-600 hover:bg-zinc-800 rounded-lg transition-colors"
              title="Enable TTS"
            >
              <VolumeX size={16} />
            </button>
          )}
          <button
            onClick={() => setShowTextInput(!showTextInput)}
            className={`p-2 rounded-lg transition-colors ${showTextInput ? 'text-blue-400 bg-blue-500/10' : 'text-zinc-600 hover:bg-zinc-800'}`}
            title="Toggle text input"
          >
            <Keyboard size={16} />
          </button>
          <button
            onClick={() => { setEntries([]); setInterimText('') }}
            className="p-2 text-zinc-600 hover:text-zinc-400 rounded-lg transition-colors"
            title="Clear transcript"
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={toggleNova}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              novaRunning
                ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
            }`}
          >
            {novaRunning ? <><PowerOff size={12} /> Stop</> : <><Power size={12} /> Start</>}
          </button>
        </div>
      </div>

      {/* ── Orb section ──────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex flex-col items-center justify-center py-8">

        {/* Outer ring pulses */}
        <div className="relative">
          {(orbState === 'speaking' || orbState === 'listening') && (
            <>
              <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${orbGradient} opacity-20 ring-pulse`} />
              <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${orbGradient} opacity-10 ring-pulse`} style={{ animationDelay: '0.5s' }} />
            </>
          )}

          {/* Main orb */}
          <button
            onClick={novaRunning ? toggleMic : toggleNova}
            disabled={!ELEVENLABS_KEY && novaRunning}
            className={`
              relative w-40 h-40 rounded-full cursor-pointer
              bg-gradient-to-br ${orbGradient} ${orbGlow}
              ${orbAnimClass}
              transition-all duration-500 ease-out
              flex items-center justify-center
              hover:brightness-110 active:scale-95
              disabled:cursor-default disabled:hover:brightness-100
            `}
            style={{ transform: `scale(${micScale})` }}
            title={novaRunning ? (orbState === 'listening' ? 'Stop listening' : 'Start listening') : 'Start Nova'}
          >
            {/* Inner glow */}
            <div className="absolute inset-4 rounded-full bg-white/5 backdrop-blur-sm" />

            {/* Icon */}
            <div className="relative z-10">
              {orbState === 'offline' ? (
                <Power size={36} className="text-zinc-400" />
              ) : orbState === 'listening' ? (
                <Mic size={36} className="text-white drop-shadow-lg" />
              ) : (
                <Volume2 size={36} className="text-white/80 drop-shadow-lg" />
              )}
            </div>
          </button>
        </div>

        {/* Status text */}
        <p className={`mt-6 text-sm font-medium ${statusColor} transition-colors`}>
          {statusText}
        </p>

        {/* Interim STT text */}
        {interimText && (
          <p className="mt-2 text-xs text-cyan-300/70 font-mono max-w-sm text-center animate-pulse">
            "{interimText}"
          </p>
        )}
      </div>

      {/* ── Transcript ───────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 w-full max-w-lg overflow-y-auto space-y-3 px-2 scrollbar-thin"
      >
        {entries.length === 0 && !interimText ? (
          <p className="text-center text-zinc-700 text-xs mt-4">
            {novaRunning
              ? ELEVENLABS_KEY
                ? 'Tap the orb to start speaking'
                : 'Use the text input to talk to Nova'
              : 'Start Nova to begin'}
          </p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                  entry.role === 'user'
                    ? 'bg-blue-600/15 text-blue-200 rounded-br-md'
                    : 'bg-zinc-800/60 text-zinc-200 rounded-bl-md'
                }`}
              >
                {entry.role === 'nova' && (
                  <span className="text-[10px] text-violet-400/70 font-medium block mb-0.5">Nova</span>
                )}
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {entry.text || (entry.streaming ? '' : '...')}
                  {entry.streaming && (
                    <span className="inline-block w-1 h-3.5 bg-violet-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
                  )}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Text input (toggle-able) ─────────────────────────────────── */}
      {showTextInput && (
        <div className="w-full max-w-lg mt-4 flex gap-2">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={novaRunning ? 'Type a message...' : 'Start Nova first...'}
            disabled={!novaRunning || sending}
            className="flex-1 bg-zinc-900/80 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/40 disabled:opacity-40 transition-colors"
          />
          <button
            onClick={handleTextSubmit}
            disabled={!novaRunning || !textInput.trim() || sending}
            className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
          >
            <Send size={14} />
          </button>
        </div>
      )}

      {/* ── Bottom mic hint ──────────────────────────────────────────── */}
      {novaRunning && !showTextInput && ELEVENLABS_KEY && orbState !== 'listening' && (
        <p className="mt-4 text-[11px] text-zinc-600">
          Tap the orb to speak · <button onClick={() => setShowTextInput(true)} className="text-zinc-500 hover:text-zinc-400 underline underline-offset-2">or type</button>
        </p>
      )}
    </div>
  )
}
