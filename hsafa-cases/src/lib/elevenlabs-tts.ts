// =============================================================================
// ElevenLabs TTS — WebSocket streaming text-to-speech
//
// Streams text chunks to ElevenLabs' eleven_multilingual_v2 model
// and plays back audio in real-time using Web Audio API.
// =============================================================================

const TTS_MODEL = 'eleven_multilingual_v2'
const SAMPLE_RATE = 44100

export type TTSState = 'disconnected' | 'idle' | 'buffering' | 'speaking' | 'error'

export interface ElevenLabsTTSOptions {
  apiKey: string
  voiceId?: string
  onStateChange?: (state: TTSState) => void
  onError?: (error: string) => void
}

// Default voice IDs
export const DEFAULT_MALE_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb'   // George
export const DEFAULT_FEMALE_VOICE_ID = 'albaa6OioIhKtKdCEkQw' // Sarah

export class ElevenLabsTTS {
  private ws: WebSocket | null = null
  private audioContext: AudioContext | null = null
  private voiceId: string
  private apiKey: string
  private state: TTSState = 'disconnected'
  private nextPlayTime = 0
  private playingSources = 0
  private audioChunks: ArrayBuffer[] = []

  onStateChange?: (state: TTSState) => void
  onError?: (error: string) => void

  constructor(opts: ElevenLabsTTSOptions) {
    this.apiKey = opts.apiKey
    this.voiceId = opts.voiceId || DEFAULT_MALE_VOICE_ID
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

      const url = `wss://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream-input?model_id=${TTS_MODEL}&output_format=pcm_44100`
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        console.log('[elevenlabs-tts] Connected')
        // Send BOS (beginning of stream) message
        this.ws!.send(JSON.stringify({
          text: ' ',
          xi_api_key: this.apiKey,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
          generation_config: {
            chunk_length_schedule: [120, 160, 250, 290],
          },
        }))
        this.setState('idle')
        resolve()
      }

      this.ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.audio) {
            this.playAudioChunk(msg.audio)
          }
          if (msg.error) {
            console.error('[elevenlabs-tts] Error:', msg.error)
            this.onError?.(typeof msg.error === 'string' ? msg.error : JSON.stringify(msg.error))
          }
        } catch {}
      }

      this.ws.onerror = () => {
        this.setState('error')
        this.onError?.('WebSocket error')
        reject(new Error('ElevenLabs WebSocket error'))
      }

      this.ws.onclose = () => {
        console.log('[elevenlabs-tts] Disconnected')
        this.setState('disconnected')
        this.ws = null
      }
    })
  }

  disconnect() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Send EOS (end of stream)
      this.ws.send(JSON.stringify({ text: '' }))
    }
    this.ws?.close()
    this.ws = null
    this.setState('disconnected')
  }

  // ── Utterance lifecycle ──────────────────────────────────────────────────

  startUtterance(): string {
    const contextId = `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    this.nextPlayTime = 0
    this.audioChunks = []
    this.setState('buffering')
    return contextId
  }

  sendChunk(text: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    if (!text.trim()) return

    this.ws.send(JSON.stringify({
      text,
      try_trigger_generation: true,
    }))
  }

  finishUtterance() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    // Send flush — empty string signals end of text input for this generation
    this.ws.send(JSON.stringify({
      text: '',
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
    this.audioChunks = []
    this.setState('idle')
  }
}
