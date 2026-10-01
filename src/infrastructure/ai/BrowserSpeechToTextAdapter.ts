import type { SpeechToTextService } from '../../application/ports'

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
    recognition.lang = 'es-MX'
    recognition.continuous = false
    recognition.interimResults = true

    return new Promise<string>((resolve, reject) => {
      let settled = false
      let finalText = ''
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', cancel)
        recognition.onresult = null
        recognition.onerror = null
        recognition.onend = null
        if (this.active === recognition) this.active = null
        if (error) reject(error)
        else if (finalText.trim()) resolve(finalText.trim())
        else
          reject(new Error('No se escuchó una pregunta. Inténtalo de nuevo.'))
      }
      const cancel = () => {
        recognition.abort()
        finish(new DOMException('Cancelado', 'AbortError'))
      }
      signal?.addEventListener('abort', cancel, { once: true })
      recognition.onresult = (event) => {
        let interim = ''
        let completed = ''
        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index]
          if (!result) continue
          if (result.isFinal) completed += `${result[0].transcript} `
          else interim += `${result[0].transcript} `
        }
        finalText = completed.trim()
        onInterim?.(`${completed}${interim}`.trim())
        if (finalText) recognition.stop()
      }
      recognition.onerror = (event) => {
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
      recognition.onend = () => finish()
      try {
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
    this.active?.abort()
    this.active = null
  }
}
