import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserSpeechToTextAdapter } from './BrowserSpeechToTextAdapter'
import {
  clearVoiceEvaluation,
  exportVoiceEvaluation,
  getVoiceEvaluation,
  startVoiceEvaluation,
} from '../../application/voiceLatency'
import { VoiceController } from '../../application/voiceController'
import type {
  VoiceActivityCallbacks,
  VoiceActivityDetector,
} from './SileroVadAdapter'

class FakeVad implements VoiceActivityDetector {
  readonly mode = 'endpoint'
  callbacks: VoiceActivityCallbacks | null = null
  start = vi.fn(
    (
      _owner: object,
      _profile: 'command' | 'question',
      callbacks: VoiceActivityCallbacks,
    ) => {
      this.callbacks = callbacks
    },
  )
  stop = vi.fn()
  destroy = vi.fn(async () => undefined)
}

class FakeRecognition {
  static current: FakeRecognition
  lang = ''
  continuous = true
  interimResults = false
  onstart: (() => void) | null = null
  onspeechend: (() => void) | null = null
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

afterEach(() => {
  clearVoiceEvaluation()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('BrowserSpeechToTextAdapter', () => {
  it('asks native recognition for a final question when VAD detects silence', async () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition)
    const vad = new FakeVad()
    const adapter = new BrowserSpeechToTextAdapter(new VoiceController(), vad)
    const pending = adapter.listen()
    const recognition = FakeRecognition.current
    recognition.stop.mockImplementation(() => {})
    recognition.onresult?.({
      results: [{ isFinal: false, 0: { transcript: 'Cómo respiro' } }],
    })
    vad.callbacks?.onSpeechEnd()
    expect(recognition.stop).toHaveBeenCalledOnce()
    recognition.onresult?.({
      results: [{ isFinal: true, 0: { transcript: '¿Cómo respiro?' } }],
    })
    recognition.onend?.()
    await expect(pending).resolves.toBe('¿Cómo respiro?')
    expect(vad.stop).toHaveBeenCalledWith(recognition)
  })

  it('preserves a definitive question if the browser omits end after stop', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('SpeechRecognition', FakeRecognition)
    const adapter = new BrowserSpeechToTextAdapter()
    const pending = adapter.listen()
    const recognition = FakeRecognition.current
    recognition.stop.mockImplementation(() => {})
    recognition.onresult?.({
      results: [{ isFinal: true, 0: { transcript: '¿Cómo respiro?' } }],
    })
    await vi.advanceTimersByTimeAsync(5000)
    await expect(pending).resolves.toBe('¿Cómo respiro?')
    expect(recognition.abort).toHaveBeenCalledOnce()
    expect(recognition.onend).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('releases failed finalization and reports the error instead of hanging', async () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition)
    const adapter = new BrowserSpeechToTextAdapter()
    const pending = adapter.listen()
    const recognition = FakeRecognition.current
    recognition.stop.mockImplementation(() => {
      throw new Error('Finalización fallida')
    })
    expect(() =>
      recognition.onresult?.({
        results: [{ isFinal: true, 0: { transcript: '¿Cómo respiro?' } }],
      }),
    ).not.toThrow()
    await expect(pending).rejects.toThrow('Finalización fallida')
    expect(recognition.abort).toHaveBeenCalledOnce()
    expect(recognition.onresult).toBeNull()
  })

  it('cancels immediately without waiting for the browser to emit end and ignores late results', async () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition)
    const adapter = new BrowserSpeechToTextAdapter()
    const onInterim = vi.fn()
    const pending = adapter.listen(undefined, onInterim)
    const recognition = FakeRecognition.current
    const lateResult = recognition.onresult!
    adapter.stop()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(recognition.abort).toHaveBeenCalledOnce()
    expect(recognition.onresult).toBeNull()
    expect(recognition.onend).toBeNull()
    lateResult({
      results: [{ isFinal: true, 0: { transcript: 'Resultado tardío' } }],
    })
    expect(onInterim).not.toHaveBeenCalled()
  })

  it('requests graceful completion only once for repeated final results', async () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition)
    const adapter = new BrowserSpeechToTextAdapter()
    const pending = adapter.listen()
    const recognition = FakeRecognition.current
    recognition.stop.mockImplementation(() => {})
    const event = {
      results: [{ isFinal: true, 0: { transcript: '¿Cómo respiro?' } }],
    }
    recognition.onresult?.(event)
    recognition.onresult?.(event)
    expect(recognition.stop).toHaveBeenCalledOnce()
    recognition.onend?.()
    await expect(pending).resolves.toBe('¿Cómo respiro?')
  })

  it('measures question capture through graceful completion without storing the question', async () => {
    startVoiceEvaluation({
      browser: 'chrome',
      device: 'desktop',
      deviceProfile: 'primary',
      noise: 'quiet',
      audioOutput: 'speakers',
      startup: 'warm',
    })
    vi.stubGlobal('SpeechRecognition', FakeRecognition)
    const adapter = new BrowserSpeechToTextAdapter()
    const pending = adapter.listen()
    const recognition = FakeRecognition.current
    recognition.onstart?.()
    recognition.onresult?.({
      results: [{ isFinal: false, 0: { transcript: 'Pregunta privada' } }],
    })
    recognition.onspeechend?.()
    recognition.onresult?.({
      results: [{ isFinal: true, 0: { transcript: 'Pregunta privada' } }],
    })
    await expect(pending).resolves.toBe('Pregunta privada')
    const events = getVoiceEvaluation()!.entries.flatMap((entry) =>
      entry.kind === 'capture' ? [entry.event] : [],
    )
    expect(events.map((event) => event.name)).toEqual([
      'start-requested',
      'started',
      'first-interim',
      'speech-ended',
      'final-result',
      'finish-requested',
      'ended',
    ])
    expect(events.every((event) => event.captureKind === 'question')).toBe(true)
    expect(new Set(events.map((event) => event.captureId)).size).toBe(1)
    expect(exportVoiceEvaluation()).not.toContain('Pregunta privada')
  })

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
