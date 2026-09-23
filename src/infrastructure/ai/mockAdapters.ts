import type {
  SpeechToTextService,
  TextToSpeechService,
} from '../../application/ports'
import { delay, MOCK_TIMING } from './mockTiming'

export class MockSpeechToTextAdapter implements SpeechToTextService {
  async transcribe(_audio: Blob): Promise<string> {
    void _audio
    await delay(MOCK_TIMING.transcription)
    return '¿Qué tan flexionadas deben estar mis rodillas?'
  }
}

export class MockTextToSpeechAdapter implements TextToSpeechService {
  private utterance: SpeechSynthesisUtterance | null = null
  private resolvePending: (() => void) | null = null

  speak(text: string): Promise<void> {
    this.stop()
    if (
      !('speechSynthesis' in window) ||
      !('SpeechSynthesisUtterance' in window)
    ) {
      return delay(MOCK_TIMING.speakingFallback)
    }
    return new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'es-MX'
      utterance.rate = 0.88
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
