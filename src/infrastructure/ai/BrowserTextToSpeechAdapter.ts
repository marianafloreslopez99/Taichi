import type { TextToSpeechService } from '../../application/ports'

export class BrowserTextToSpeechAdapter implements TextToSpeechService {
  private utterance: SpeechSynthesisUtterance | null = null
  private resolvePending: (() => void) | null = null

  speak(text: string): Promise<void> {
    this.stop()
    if (
      !('speechSynthesis' in window) ||
      !('SpeechSynthesisUtterance' in window)
    ) {
      return Promise.reject(
        new Error('Este navegador no puede reproducir voz.'),
      )
    }
    return new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'es-MX'
      utterance.rate = 0.88
      const voices = window.speechSynthesis.getVoices()

      const voice =
        voices.find(
          (candidate) =>
            candidate.name.includes('Dalia') && candidate.lang === 'es-MX',
        ) ??
        voices.find((candidate) => candidate.lang === 'es-MX') ??
        voices.find((candidate) => candidate.lang.startsWith('es'))

      if (voice) {
        utterance.voice = voice
      }

      utterance.onend = () => {
        this.utterance = null
        this.resolvePending = null
        resolve()
      }
      utterance.onerror = () => {
        this.utterance = null
        this.resolvePending = null
        reject(new Error('No se pudo reproducir el audio'))
      }
      this.utterance = utterance
      this.resolvePending = resolve
      window.speechSynthesis.speak(utterance)
    })
  }

  stop(): void {
    if (this.utterance && 'speechSynthesis' in window) {
      this.utterance.onend = null
      this.utterance.onerror = null
      window.speechSynthesis.cancel()
      this.utterance = null
      this.resolvePending?.()
      this.resolvePending = null
    }
  }
}
