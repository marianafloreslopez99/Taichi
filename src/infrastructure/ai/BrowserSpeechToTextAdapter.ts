import type { SpeechToTextService } from '../../application/ports'
import {
  nextVoiceCaptureId,
  recordVoiceCaptureEvent,
  type VoiceCaptureEvent,
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

interface RecognitionResult {
  isFinal: boolean
  0: { transcript: string }
}

interface RecognitionEvent {
  results: ArrayLike<RecognitionResult>
}

interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onstart?: (() => void) | null
  onspeechend?: (() => void) | null
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
  stop(): void
}

type RecognitionWindow = Window & {
  SpeechRecognition?: new () => Recognition
  webkitSpeechRecognition?: new () => Recognition
}

export class BrowserSpeechToTextAdapter implements SpeechToTextService {
  private active: Recognition | null = null
  private cancelActive: (() => void) | null = null

  constructor(
    private readonly controller = new VoiceController(),
    private readonly vad: VoiceActivityDetector = new SileroVadAdapter(),
  ) {}

  listen(
    signal?: AbortSignal,
    onInterim?: (text: string) => void,
  ): Promise<string> {
    const browser = window as RecognitionWindow
    const Constructor =
      browser.SpeechRecognition ?? browser.webkitSpeechRecognition
    if (!Constructor) {
      return Promise.reject(
        new Error(
          'Este navegador no admite preguntas por voz. Puedes escribir tu pregunta.',
        ),
      )
    }
    if (signal?.aborted) {
      return Promise.reject(new DOMException('Cancelado', 'AbortError'))
    }

    this.stop()
    const recognition = new Constructor()
    this.active = recognition
    const captureId = nextVoiceCaptureId()
    const recordEvent = (
      name: VoiceCaptureEvent['name'],
      resultIndex?: number,
    ) =>
      recordVoiceCaptureEvent({
        name,
        captureId,
        captureKind: 'question',
        ...(resultIndex !== undefined ? { resultIndex } : {}),
      })
    recognition.lang = 'es-MX'
    recognition.continuous = false
    recognition.interimResults = true

    return new Promise<string>((resolve, reject) => {
      let settled = false
      let intervention: VoiceIntervention | null = null
      let finalizationTimer: number | null = null
      let finalText = ''
      const firstInterim = new Set<number>()
      const finalResults = new Set<number>()
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        this.vad.stop(recognition)
        if (finalizationTimer !== null) window.clearTimeout(finalizationTimer)
        signal?.removeEventListener('abort', cancel)
        recognition.onresult = null
        recognition.onerror = null
        recognition.onend = null
        recognition.onstart = null
        recognition.onspeechend = null
        this.controller.end(intervention)
        if (this.active === recognition) {
          this.active = null
          this.cancelActive = null
        }
        if (error) reject(error)
        else if (finalText.trim()) resolve(finalText.trim())
        else
          reject(new Error('No se escuchó una pregunta. Inténtalo de nuevo.'))
      }
      const cancel = () => {
        if (settled) return
        recordEvent('cancel-requested')
        finish(new DOMException('Cancelado', 'AbortError'))
        try {
          recognition.abort()
        } catch {
          /* Already disconnected. */
        }
      }
      this.cancelActive = cancel
      signal?.addEventListener('abort', cancel, { once: true })
      const isCurrent = () =>
        !settled && this.controller.isCurrent(intervention)
      const requestFinish = (source: 'result' | 'vad') => {
        if (!this.controller.requestFinish(intervention)) return false
        if (source === 'vad') recordEvent('vad-endpoint-requested')
        recordEvent('finish-requested')
        finalizationTimer = window.setTimeout(() => {
          if (!isCurrent()) return
          recordEvent('finalization-timeout')
          // Preserve a final transcript if one arrived. Silence alone never
          // promotes an interim transcript into a question.
          finish()
          try {
            recognition.abort()
          } catch {
            /* Already disconnected. */
          }
        }, VOICE_FINALIZATION_TIMEOUT_MS)
        try {
          recognition.stop()
        } catch (error) {
          finish(
            error instanceof Error
              ? error
              : new Error('No se pudo finalizar el micrófono.'),
          )
          try {
            recognition.abort()
          } catch {
            /* Already disconnected. */
          }
        }
        return true
      }
      recognition.onstart = () => {
        if (isCurrent()) recordEvent('started')
      }
      recognition.onspeechend = () => {
        if (isCurrent()) recordEvent('speech-ended')
      }
      recognition.onresult = (event) => {
        if (!isCurrent()) return
        let interim = ''
        let completed = ''
        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index]
          if (!result) continue
          if (result.isFinal) {
            completed += `${result[0].transcript} `
            if (!finalResults.has(index)) {
              finalResults.add(index)
              recordEvent('final-result', index)
            }
          } else {
            interim += `${result[0].transcript} `
            if (!firstInterim.has(index)) {
              firstInterim.add(index)
              recordEvent('first-interim', index)
            }
          }
        }
        finalText = completed.trim()
        onInterim?.(`${completed}${interim}`.trim())
        if (finalText) requestFinish('result')
      }
      recognition.onerror = (event) => {
        if (!isCurrent()) return
        recordEvent('error')
        const error =
          event.error === 'not-allowed' || event.error === 'service-not-allowed'
            ? new DOMException('Permiso denegado', 'NotAllowedError')
            : event.error === 'audio-capture'
              ? new DOMException('Micrófono no disponible', 'NotFoundError')
              : new Error(
                  event.error === 'no-speech'
                    ? 'No se escuchó una pregunta. Inténtalo de nuevo.'
                    : 'No pudimos transcribir la pregunta. Inténtalo de nuevo.',
                )
        finish(error)
      }
      recognition.onend = () => {
        if (!isCurrent()) return
        recordEvent('ended')
        finish()
      }
      try {
        intervention = this.controller.begin(captureId, 'question', cancel)
        this.vad.start(recognition, 'question', {
          onReady: () => {
            if (isCurrent()) recordEvent('vad-ready')
          },
          onSpeechStart: () => {
            if (isCurrent()) recordEvent('vad-speech-started')
          },
          onSpeechEnd: () => {
            if (!isCurrent()) return
            recordEvent('vad-speech-ended')
            if (this.vad.mode === 'endpoint') requestFinish('vad')
          },
          onMisfire: () => {
            if (isCurrent()) recordEvent('vad-misfire')
          },
          onError: () => {
            if (isCurrent()) recordEvent('vad-error')
          },
        })
        recordEvent('start-requested')
        recognition.start()
      } catch (error) {
        finish(
          error instanceof Error
            ? error
            : new Error('No pudimos iniciar el micrófono.'),
        )
      }
    })
  }

  stop(): void {
    this.cancelActive?.()
  }
}
