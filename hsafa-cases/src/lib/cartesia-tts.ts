// =============================================================================
// Cartesia TTS — WebSocket streaming text-to-speech
//
// Streams text chunks (from Nova's text.delta) to Cartesia's sonic-3 model
// and plays back audio in real-time using Web Audio API.
// =============================================================================

const SAMPLE_RATE = 24000
const WS_VERSION = '2025-04-16'
const MODEL_ID = 'sonic-2'
const DEFAULT_VOICE_ID = 'a0e99841-438c-4a64-b679-ae501e7d6091'

export type TTSState = 'disconnected' | 'idle' | 'buffering' | 'speaking' | 'error'

export interface CartesiaTTSOptions {
  apiKey: string
  voiceId?: string
  onStateChange?: (state: TTSState) => void
  onError?: (error: string) => void
}

export class CartesiaTTS {
  private ws: WebSocket | null = null
  private audioContext: AudioContext | null = null
  private voiceId: string
  private apiKey: string
  private currentContextId: string | null = null
  private nextPlayTime = 0
  private state: TTSState = 'disconnected'
  private playingSources = 0

  onStateChange?: (state: TTSState) => void
  onError?: (error: string) => void

  constructor(opts: CartesiaTTSOptions) {
    this.apiKey = opts.apiKey
    this.voiceId = opts.voiceId || DEFAULT_VOICE_ID
    this.onStateChange = opts.onStateChange
    this.onError = opts.onError
  }

  private setState(s: TTSState) {
    if (this.state === s) return
    this.state = s
    this.onStateChange?.(s)
  }

  get currentState() { return this.state }

  // ── Connect ──────────────────────────────────────────────────────────────

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) { resolve(); return }

      const url = `wss://api.cartesia.ai/tts/websocket?api_key=${this.apiKey}&cartesia_version=${WS_VERSION}`
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        console.log('[cartesia] Connected')
        this.setState('idle')
        resolve()
      }

      this.ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'chunk' && msg.data) {
            this.playAudioChunk(msg.data)
          } else if (msg.type === 'done') {
            // Context finished — will go idle when audio finishes
          } else if (msg.error) {
            console.error('[cartesia] Error:', msg.error)
            this.onError?.(msg.error)
          }
        } catch {}
      }

      this.ws.onerror = () => {
        this.setState('error')
        this.onError?.('WebSocket error')
        reject(new Error('Cartesia WebSocket error'))
      }

      this.ws.onclose = () => {
        console.log('[cartesia] Disconnected')
        this.setState('disconnected')
        this.ws = null
      }
    })
  }

  disconnect() {
    this.ws?.close()
    this.ws = null
    this.currentContextId = null
    this.setState('disconnected')
  }

  // ── Utterance lifecycle ──────────────────────────────────────────────────

  startUtterance(): string {
    const contextId = `nova-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    this.currentContextId = contextId
    this.nextPlayTime = 0
    this.setState('buffering')
    return contextId
  }

  sendChunk(text: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.currentContextId) return
    if (!text.trim()) return

    const isFirst = this.nextPlayTime === 0 && this.playingSources === 0

    if (isFirst) {
      // First chunk — include full config
      this.ws.send(JSON.stringify({
        model_id: MODEL_ID,
        transcript: text,
        voice: { mode: 'id', id: this.voiceId },
        output_format: {
          container: 'raw',
          encoding: 'pcm_s16le',
          sample_rate: SAMPLE_RATE,
        },
        language: 'en',
        context_id: this.currentContextId,
        continue: true,
      }))
    } else {
      // Continuation chunk
      this.ws.send(JSON.stringify({
        transcript: text,
        context_id: this.currentContextId,
        continue: true,
      }))
    }
  }

  finishUtterance() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.currentContextId) return

    // Flush — signal end of text input
    this.ws.send(JSON.stringify({
      transcript: '',
      context_id: this.currentContextId,
      continue: false,
    }))
  }

  // ── Audio playback ───────────────────────────────────────────────────────

  private ensureAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume()
    }
    return this.audioContext
  }

  private playAudioChunk(base64Data: string) {
    const ctx = this.ensureAudioContext()

    // Decode base64 → Int16 PCM → Float32
    const binary = atob(base64Data)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    const int16 = new Int16Array(bytes.buffer)
    const float32 = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768
    }

    if (float32.length === 0) return

    // Create buffer and schedule playback
    const buffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE)
    buffer.copyToChannel(float32, 0)

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)

    const now = ctx.currentTime
    const startTime = Math.max(now + 0.02, this.nextPlayTime)
    source.start(startTime)
    this.nextPlayTime = startTime + buffer.duration

    this.playingSources++
    this.setState('speaking')

    source.onended = () => {
      this.playingSources--
      if (this.playingSources <= 0) {
        this.playingSources = 0
        this.setState('idle')
      }
    }
  }

  // ── Stop playback ────────────────────────────────────────────────────────

  stopPlayback() {
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
    this.playingSources = 0
    this.nextPlayTime = 0
    this.currentContextId = null
    this.setState('idle')
  }
}
