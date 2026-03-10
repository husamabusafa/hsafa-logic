// =============================================================================
// Deepgram STT — WebSocket live speech-to-text
//
// Captures microphone audio via MediaRecorder, streams to Deepgram's
// real-time transcription API, and returns transcript callbacks.
// =============================================================================

export type STTState = 'idle' | 'connecting' | 'listening' | 'error'

export interface DeepgramSTTOptions {
  apiKey: string
  onTranscript?: (text: string, isFinal: boolean) => void
  onStateChange?: (state: STTState) => void
  onAudioLevel?: (level: number) => void
  onError?: (error: string) => void
}

export class DeepgramSTT {
  private ws: WebSocket | null = null
  private mediaStream: MediaStream | null = null
  private mediaRecorder: MediaRecorder | null = null
  private analyser: AnalyserNode | null = null
  private audioContext: AudioContext | null = null
  private levelInterval: number | null = null
  private state: STTState = 'idle'

  private apiKey: string
  onTranscript?: (text: string, isFinal: boolean) => void
  onStateChange?: (state: STTState) => void
  onAudioLevel?: (level: number) => void
  onError?: (error: string) => void

  constructor(opts: DeepgramSTTOptions) {
    this.apiKey = opts.apiKey
    this.onTranscript = opts.onTranscript
    this.onStateChange = opts.onStateChange
    this.onAudioLevel = opts.onAudioLevel
    this.onError = opts.onError
  }

  get currentState() { return this.state }

  private setState(s: STTState) {
    if (this.state === s) return
    this.state = s
    this.onStateChange?.(s)
  }

  // ── Start recording ─────────────────────────────────────────────────────

  async startRecording(): Promise<void> {
    if (this.state === 'listening' || this.state === 'connecting') return

    this.setState('connecting')

    try {
      // Get microphone
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })

      // Set up audio level monitoring
      this.audioContext = new AudioContext()
      const source = this.audioContext.createMediaStreamSource(this.mediaStream)
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 256
      source.connect(this.analyser)

      this.levelInterval = window.setInterval(() => {
        if (!this.analyser) return
        const data = new Uint8Array(this.analyser.frequencyBinCount)
        this.analyser.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        this.onAudioLevel?.(avg / 255) // normalized 0-1
      }, 50)

      // Connect to Deepgram WebSocket
      const params = new URLSearchParams({
        model: 'nova-3',
        punctuate: 'true',
        interim_results: 'true',
        endpointing: '300',
        vad_events: 'true',
        encoding: 'opus',
        sample_rate: '48000',
      })

      const wsUrl = `wss://api.deepgram.com/v1/listen?${params}`
      this.ws = new WebSocket(wsUrl, ['token', this.apiKey])

      this.ws.onopen = () => {
        console.log('[deepgram] Connected')
        this.startMediaRecorder()
        this.setState('listening')
      }

      this.ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'Results') {
            const alt = msg.channel?.alternatives?.[0]
            if (alt?.transcript) {
              this.onTranscript?.(alt.transcript, msg.is_final ?? false)
            }
          }
        } catch {}
      }

      this.ws.onerror = () => {
        this.setState('error')
        this.onError?.('Deepgram WebSocket error')
        this.cleanup()
      }

      this.ws.onclose = () => {
        console.log('[deepgram] Disconnected')
        if (this.state === 'listening') {
          this.setState('idle')
        }
      }
    } catch (err: any) {
      this.setState('error')
      this.onError?.(err.message || 'Microphone access denied')
      this.cleanup()
    }
  }

  // ── Stop recording ──────────────────────────────────────────────────────

  stopRecording(): void {
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop()
    }

    // Send close message to Deepgram
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'CloseStream' }))
      setTimeout(() => this.ws?.close(), 500)
    }

    this.cleanup()
    this.setState('idle')
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private startMediaRecorder() {
    if (!this.mediaStream) return

    // Use webm/opus — well supported in browsers and Deepgram
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType })

    this.mediaRecorder.ondataavailable = (ev) => {
      if (ev.data.size > 0 && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(ev.data)
      }
    }

    // Send chunks every 100ms for low latency
    this.mediaRecorder.start(100)
  }

  private cleanup() {
    if (this.levelInterval) {
      clearInterval(this.levelInterval)
      this.levelInterval = null
    }

    if (this.mediaRecorder) {
      if (this.mediaRecorder.state !== 'inactive') {
        try { this.mediaRecorder.stop() } catch {}
      }
      this.mediaRecorder = null
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop())
      this.mediaStream = null
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {})
      this.audioContext = null
      this.analyser = null
    }

    this.onAudioLevel?.(0)
  }

  destroy() {
    this.stopRecording()
    this.ws?.close()
    this.ws = null
  }
}
