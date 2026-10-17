import {
  nextVoiceCaptureId,
  recordVoiceCaptureEvent,
  type VoiceCaptureEvent,
  type VoiceRecognitionTiming,
} from '../../application/voiceLatency'
import {
  VoiceController,
  type VoiceIntervention,
} from '../../application/voiceController'
import { VOICE_FINALIZATION_TIMEOUT_MS } from '../../application/voiceConfig'
import {
  SileroVadAdapter,
  type VoiceActivityDetector,
} from './SileroVadAdapter'

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
  onaudiostart?: (() => void) | null
  onaudioend?: (() => void) | null
  onspeechstart?: (() => void) | null
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
  private capture: VoiceIntervention | null = null
  private vadEndpointArmed = false
  private vadSpeechEnded = false

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
    private readonly controller = new VoiceController(),
    private readonly vad: VoiceActivityDetector = new SileroVadAdapter(),
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
    if (!this.active || !this.controller.requestFinish(this.capture)) return
    if (!this.active.stop) {
      this.finishTimeout()
      return
    }
    try {
      this.onStatus('processing')
      this.recordEvent('finish-requested')
      this.active.stop()
      if (this.active) this.limitUtterance(VOICE_FINALIZATION_TIMEOUT_MS)
    } catch {
      this.finishTimeout()
    }
  }

  armVadEndpoint(): void {
    if (this.vad.mode !== 'endpoint' || !this.active) return
    this.vadEndpointArmed = true
    if (this.vadSpeechEnded) this.finishFromVad()
  }

  private finishFromVad(): void {
    if (!this.vadEndpointArmed || !this.active) return
    this.vadEndpointArmed = false
    this.recordEvent('vad-endpoint-requested')
    this.finishUtterance()
  }

  private limitUtterance(delay: number): void {
    if (this.utteranceTimer !== null) window.clearTimeout(this.utteranceTimer)
    const intervention = this.capture
    this.utteranceTimer = window.setTimeout(() => {
      if (!this.controller.isCurrent(intervention)) return
      if (delay === VOICE_FINALIZATION_TIMEOUT_MS)
        this.recordEvent('finalization-timeout')
      this.finishTimeout()
    }, delay)
  }

  private finishTimeout(): void {
    if (this.singleUtterance) this.wait()
    else {
      if (this.active) this.retire(this.active, true, true)
      this.reconnect(300)
    }
  }

  private halt(status: ContinuousMicStatus): void {
    this.desired = false
    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    if (this.active) this.retire(this.active, true)
    this.controller.end(this.capture)
    this.capture = null
    this.onStatus(status)
  }

  private retire(
    recognition: Recognition,
    abort: boolean,
    retainLease = false,
  ): void {
    this.vad.stop(recognition)
    if (abort && this.active === recognition)
      this.recordEvent('cancel-requested')
    if (this.utteranceTimer !== null) {
      window.clearTimeout(this.utteranceTimer)
      this.utteranceTimer = null
    }
    recognition.onstart = null
    recognition.onresult = null
    recognition.onerror = null
    recognition.onend = null
    recognition.onspeechend = null
    recognition.onaudiostart = null
    recognition.onaudioend = null
    recognition.onspeechstart = null
    if (this.active === recognition) {
      this.active = null
      if (!retainLease) {
        this.controller.end(this.capture)
        this.capture = null
      }
    }
    if (abort) {
      try {
        recognition.abort()
      } catch {
        // The browser may already have disconnected recognition.
      }
    }
  }

  private recordEvent(
    name: VoiceCaptureEvent['name'],
    resultIndex?: number,
    errorCode?: string,
  ): void {
    if (!this.capture) return
    recordVoiceCaptureEvent({
      name,
      captureId: this.capture.id,
      captureKind: this.capture.kind,
      ...(resultIndex !== undefined ? { resultIndex } : {}),
      ...(errorCode ? { errorCode } : {}),
    })
  }

  private reconnect(delayMs: number): void {
    if (!this.desired) return
    if (this.singleUtterance) {
      this.wait()
      return
    }
    const intervention = this.capture
    if (!this.controller.isCurrent(intervention)) {
      this.halt('suspended')
      return
    }
    this.controller.reconnect(intervention)
    this.onStatus('reconnecting')
    this.retryTimer = window.setTimeout(() => {
      if (!this.controller.isCurrent(intervention)) return
      this.retryTimer = null
      if (this.desired && this.controller.isCurrent(intervention))
        this.connect()
    }, delayMs)
  }

  private connect(): void {
    const browser = window as RecognitionWindow
    const Constructor =
      browser.SpeechRecognition ?? browser.webkitSpeechRecognition
    if (!Constructor) {
      this.halt('unsupported')
      return
    }

    this.controller.end(this.capture)
    this.capture = null

    const recognition = new Constructor()
    const captureId = nextVoiceCaptureId()
    let intervention: VoiceIntervention
    try {
      intervention = this.controller.begin(
        captureId,
        this.singleUtterance ? 'push-to-talk' : 'continuous',
        () => this.halt('suspended'),
      )
    } catch {
      this.desired = false
      this.onStatus('blocked')
      return
    }
    this.active = recognition
    this.capture = intervention
    this.vadEndpointArmed = false
    this.vadSpeechEnded = false
    const isCurrent = () =>
      this.active === recognition && this.controller.isCurrent(intervention)
    this.onStatus('starting')
    recognition.lang = 'es-MX'
    recognition.continuous = !this.singleUtterance
    recognition.interimResults = true
    const handledFinal = new Set<number>()
    const firstResults = new Map<number, number>()
    let speechEndedAt: number | undefined
    recognition.onaudiostart = () => {
      if (isCurrent()) this.recordEvent('audio-started')
    }
    recognition.onaudioend = () => {
      if (isCurrent()) this.recordEvent('audio-ended')
    }
    recognition.onspeechstart = () => {
      if (isCurrent()) {
        speechEndedAt = undefined
        this.recordEvent('speech-started')
      }
    }
    recognition.onspeechend = () => {
      if (!isCurrent()) return
      speechEndedAt = performance.now()
      this.recordEvent('speech-ended')
    }
    this.vad.start(recognition, 'command', {
      onReady: () => {
        if (isCurrent()) this.recordEvent('vad-ready')
      },
      onSpeechStart: () => {
        if (!isCurrent()) return
        this.vadSpeechEnded = false
        this.recordEvent('vad-speech-started')
      },
      onSpeechEnd: () => {
        if (!isCurrent()) return
        this.vadSpeechEnded = true
        this.recordEvent('vad-speech-ended')
        if (this.vad.mode === 'endpoint') this.finishFromVad()
      },
      onMisfire: () => {
        if (isCurrent()) this.recordEvent('vad-misfire')
      },
      onError: () => {
        if (isCurrent()) this.recordEvent('vad-error')
      },
    })
    if (this.singleUtterance) this.limitUtterance(12_000)

    recognition.onstart = () => {
      if (isCurrent() && this.desired) {
        this.recordEvent('started')
        this.onStatus('listening')
      }
    }
    recognition.onresult = (event) => {
      for (
        let index = event.resultIndex ?? 0;
        index < event.results.length;
        index += 1
      ) {
        if (!this.desired || !isCurrent()) break
        const result = event.results[index]
        if (!result || handledFinal.has(index)) continue
        const phrase = result[0]?.transcript.trim()
        const receivedAt = performance.now()
        if (!firstResults.has(index)) {
          firstResults.set(index, receivedAt)
          if (!result.isFinal) this.recordEvent('first-interim', index)
        }
        const timing = {
          captureId,
          resultIndex: index,
          firstResultAt: firstResults.get(index)!,
          receivedAt,
          speechEndedAt,
        }
        if (!result.isFinal) {
          if (phrase) this.onInterim?.(phrase, timing)
          continue
        }
        handledFinal.add(index)
        this.recordEvent('final-result', index)
        this.networkFailures = 0
        firstResults.delete(index)
        if (phrase) this.onPhrase(phrase, timing)
        this.vadEndpointArmed = false
        this.vadSpeechEnded = false
        speechEndedAt = undefined
        if (this.singleUtterance && this.active === recognition) this.wait()
      }
    }
    recognition.onerror = (event) => {
      if (!isCurrent()) return
      const errorCode = [
        'no-speech',
        'aborted',
        'network',
        'not-allowed',
        'service-not-allowed',
        'audio-capture',
        'language-not-supported',
        'bad-grammar',
      ].includes(event.error)
        ? event.error
        : 'other'
      this.recordEvent('error', undefined, errorCode)
      const fatal = [
        'not-allowed',
        'service-not-allowed',
        'audio-capture',
        'language-not-supported',
      ].includes(event.error)
      this.retire(recognition, true, !fatal && !this.singleUtterance)
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
      if (!isCurrent()) return
      this.recordEvent('ended')
      this.retire(recognition, false, !this.singleUtterance)
      this.reconnect(300)
    }

    try {
      this.recordEvent('start-requested')
      recognition.start()
    } catch (error) {
      this.retire(
        recognition,
        true,
        !(error instanceof DOMException && error.name === 'NotAllowedError') &&
          !this.singleUtterance,
      )
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        this.desired = false
        this.onStatus('blocked')
      } else {
        this.reconnect(Math.min(500 * 2 ** this.networkFailures++, 10_000))
      }
    }
  }
}
