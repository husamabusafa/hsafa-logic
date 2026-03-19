// =============================================================================
// ElevenLabs STT — Speech-to-text via microphone recording
//
// Records audio from the microphone using MediaRecorder, then sends the
// completed recording to ElevenLabs Scribe API for transcription.
// Simpler than WebSocket-based streaming STT — no interim results,
// but much less complexity.
// =============================================================================

export type STTState = 'idle' | 'connecting' | 'listening' | 'transcribing' | 'error'

export interface ElevenLabsSTTOptions {
  apiKey: string
  onTranscript?: (text: string, isFinal: boolean) => void
  onStateChange?: (state: STTState) => void
  onAudioLevel?: (level: number) => void
  onError?: (error: string) => void
}

const STT_MODEL = 'scribe_v1'

export class ElevenLabsSTT {
  private mediaStream: MediaStream | null = null
  private mediaRecorder: MediaRecorder | null = null
  private analyser: AnalyserNode | null = null
  private audioContext: AudioContext | null = null
  private levelInterval: number | null = null
  private recordedChunks: Blob[] = []
  private state: STTState = 'idle'

  private apiKey: string
  onTranscript?: (text: string, isFinal: boolean) => void
  onStateChange?: (state: STTState) => void
  onAudioLevel?: (level: number) => void
  onError?: (error: string) => void

  constructor(opts: ElevenLabsSTTOptions) {
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

      // Set up MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      this.recordedChunks = []
      this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType })

      this.mediaRecorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) {
          this.recordedChunks.push(ev.data)
        }
      }

      this.mediaRecorder.start(100)
      this.setState('listening')
    } catch (err: any) {
      this.setState('error')
      this.onError?.(err.message || 'Microphone access denied')
      this.cleanup()
    }
  }

  // ── Stop recording and transcribe ──────────────────────────────────────

  stopRecording(): void {
    if (this.state !== 'listening') {
      this.cleanup()
      this.setState('idle')
      return
    }

    this.setState('transcribing')

    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.onstop = async () => {
        await this.transcribeRecording()
        this.cleanup()
      }
      this.mediaRecorder.stop()
    } else {
      this.cleanup()
      this.setState('idle')
    }
  }

  private async transcribeRecording(): Promise<void> {
    if (this.recordedChunks.length === 0) {
      this.setState('idle')
      return
    }

    const audioBlob = new Blob(this.recordedChunks, { type: 'audio/webm' })
    this.recordedChunks = []

    // Skip very short recordings (< 0.5s worth of data)
    if (audioBlob.size < 5000) {
      this.setState('idle')
      return
    }

    try {
      const formData = new FormData()
      formData.append('file', audioBlob, 'recording.webm')
      formData.append('model_id', STT_MODEL)

      const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
        },
        body: formData,
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error')
        throw new Error(`STT failed (${response.status}): ${errorText}`)
      }

      const result = await response.json() as { text?: string; language_code?: string }
      const text = result.text?.trim() || ''

      if (text) {
        this.onTranscript?.(text, true)
      }

      this.setState('idle')
    } catch (err: any) {
      console.error('[elevenlabs-stt] Transcription error:', err)
      this.onError?.(err.message || 'Transcription failed')
      this.setState('error')
      // Recover to idle
      setTimeout(() => this.setState('idle'), 1000)
    }
  }

  // ── Internal ────────────────────────────────────────────────────────────

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
  }
}
