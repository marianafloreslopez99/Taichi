import type { VoiceRecognitionTiming } from '../../application/voiceLatency'

export type ContinuousMicStatus =
  | 'off'
  | 'ready'
  | 'starting'
  | 'listening'
  | 'processing'
  | 'reconnecting'
  | 'suspended'
  | 'blocked'
  | 'unsupported'

interface RecognitionResult {
  isFinal: boolean
  0: { transcript: string }
}

interface RecognitionEvent {
  resultIndex?: number
  results: ArrayLike<RecognitionResult>
}

interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onstart: (() => void) | null
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  onspeechend?: (() => void) | null
  start(): void
  stop?(): void
  abort(): void
}

type RecognitionWindow = Window & {
  SpeechRecognition?: new () => Recognition
  webkitSpeechRecognition?: new () => Recognition
}

export class ContinuousSpeechRecognition {
  private desired = false
  private active: Recognition | null = null
  private retryTimer: number | null = null
  private networkFailures = 0
  private singleUtterance = false
  private utteranceTimer: number | null = null
  private finishingUtterance = false

  constructor(
    private readonly onPhrase: (
      text: string,
      timing: VoiceRecognitionTiming,
    ) => void,
    private readonly onStatus: (status: ContinuousMicStatus) => void,
    private readonly onInterim?: (
      text: string,
      timing: VoiceRecognitionTiming,
    ) => void,
  ) {}

  start(singleUtterance = false): void {
    this.desired = true
    this.singleUtterance = singleUtterance
    if (!this.active && this.retryTimer === null) this.connect()
  }

  suspend(): void {
    this.halt('suspended')
  }

  stop(): void {
    this.halt('off')
  }

  wait(): void {
    this.halt('ready')
  }

  finishUtterance(): void {
    if (!this.singleUtterance || !this.active || this.finishingUtterance) return
    if (!this.active.stop) {
      this.wait()
      return
    }
    try {
      this.finishingUtterance = true
      this.onStatus('processing')
      this.active.stop()
      if (this.active) this.limitUtterance(5000)
    } catch {
      this.wait()
    }
  }

  private limitUtterance(delay: number): void {
    if (this.utteranceTimer !== null) window.clearTimeout(this.utteranceTimer)
    this.utteranceTimer = window.setTimeout(() => this.wait(), delay)
  }

  private halt(status: ContinuousMicStatus): void {
    this.desired = false
    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    if (this.active) this.retire(this.active, true)
    this.onStatus(status)
  }

  private retire(recognition: Recognition, abort: boolean): void {
    if (this.utteranceTimer !== null) {
      window.clearTimeout(this.utteranceTimer)
      this.utteranceTimer = null
    }
    recognition.onstart = null
    recognition.onresult = null
    recognition.onerror = null
    recognition.onend = null
    recognition.onspeechend = null
    if (this.active === recognition) this.active = null
    if (abort) {
      try {
        recognition.abort()
      } catch {
        // The browser may already have disconnected recognition.
      }
    }
  }

  private reconnect(delayMs: number): void {
    if (!this.desired) return
    if (this.singleUtterance) {
      this.wait()
      return
    }
    this.onStatus('reconnecting')
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null
      if (this.desired) this.connect()
    }, delayMs)
  }

  private connect(): void {
    this.finishingUtterance = false
    const browser = window as RecognitionWindow
    const Constructor =
      browser.SpeechRecognition ?? browser.webkitSpeechRecognition
    if (!Constructor) {
      this.desired = false
      this.onStatus('unsupported')
      return
    }

    const recognition = new Constructor()
    this.active = recognition
    this.onStatus('starting')
    recognition.lang = 'es-MX'
    recognition.continuous = !this.singleUtterance
    recognition.interimResults = true
    const handledFinal = new Set<number>()
    const firstResults = new Map<number, number>()
    let speechEndedAt: number | undefined
    recognition.onspeechend = () => {
      speechEndedAt = performance.now()
    }
    if (this.singleUtterance) this.limitUtterance(12_000)

    recognition.onstart = () => {
      if (this.active === recognition && this.desired)
        this.onStatus('listening')
    }
    recognition.onresult = (event) => {
      for (
        let index = event.resultIndex ?? 0;
        index < event.results.length;
        index += 1
      ) {
        if (!this.desired || this.active !== recognition) break
        const result = event.results[index]
        if (!result || handledFinal.has(index)) continue
        const phrase = result[0]?.transcript.trim()
        const receivedAt = performance.now()
        if (!firstResults.has(index)) firstResults.set(index, receivedAt)
        const timing = {
          firstResultAt: firstResults.get(index)!,
          receivedAt,
          speechEndedAt,
        }
        if (!result.isFinal) {
          if (phrase) this.onInterim?.(phrase, timing)
          continue
        }
        handledFinal.add(index)
        this.networkFailures = 0
        firstResults.delete(index)
        if (phrase) this.onPhrase(phrase, timing)
        speechEndedAt = undefined
        if (this.singleUtterance && this.active === recognition) this.wait()
      }
    }
    recognition.onerror = (event) => {
      if (this.active !== recognition) return
      const fatal = [
        'not-allowed',
        'service-not-allowed',
        'audio-capture',
        'language-not-supported',
      ].includes(event.error)
      this.retire(recognition, true)
      if (fatal) {
        this.desired = false
        this.onStatus('blocked')
        return
      }
      const delay =
        event.error === 'network'
          ? Math.min(500 * 2 ** this.networkFailures++, 10_000)
          : 300
      this.reconnect(delay)
    }
    recognition.onend = () => {
      if (this.active !== recognition) return
      this.retire(recognition, false)
      this.reconnect(300)
    }

    try {
      recognition.start()
    } catch (error) {
      this.retire(recognition, true)
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        this.desired = false
        this.onStatus('blocked')
      } else {
        this.reconnect(Math.min(500 * 2 ** this.networkFailures++, 10_000))
      }
    }
  }
}
