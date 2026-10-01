import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserSpeechToTextAdapter } from './BrowserSpeechToTextAdapter'

class FakeRecognition {
  static current: FakeRecognition
  lang = ''
  continuous = true
  interimResults = false
  onresult:
    | ((event: {
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
      }) => void)
    | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  abort = vi.fn()
  stop = vi.fn(() => this.onend?.())

  constructor() {
    FakeRecognition.current = this
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('BrowserSpeechToTextAdapter', () => {
  it('returns the recognized Spanish question and reports interim text', async () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition)
    const adapter = new BrowserSpeechToTextAdapter()
    const onInterim = vi.fn()
    const pending = adapter.listen(undefined, onInterim)
    const recognition = FakeRecognition.current
    expect(recognition.lang).toBe('es-MX')
    expect(recognition.start).toHaveBeenCalledOnce()
    recognition.onresult?.({
      results: [{ isFinal: false, 0: { transcript: 'Cómo' } }],
    })
    recognition.onresult?.({
      results: [{ isFinal: true, 0: { transcript: '¿Cómo respiro?' } }],
    })
    await expect(pending).resolves.toBe('¿Cómo respiro?')
    expect(onInterim).toHaveBeenCalledWith('¿Cómo respiro?')
  })

  it('stops the microphone when the question is cancelled', async () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition)
    const adapter = new BrowserSpeechToTextAdapter()
    const controller = new AbortController()
    const pending = adapter.listen(controller.signal)
    const recognition = FakeRecognition.current
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(recognition.abort).toHaveBeenCalledOnce()
  })

  it('reports unsupported browsers so the user can write instead', async () => {
    const adapter = new BrowserSpeechToTextAdapter()
    await expect(adapter.listen()).rejects.toThrow(
      'no admite preguntas por voz',
    )
  })
})
