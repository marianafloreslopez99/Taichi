import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContinuousSpeechRecognition } from './ContinuousSpeechRecognition'
import { BrowserSpeechToTextAdapter } from './BrowserSpeechToTextAdapter'
import { VoiceController } from '../../application/voiceController'
import {
  clearVoiceEvaluation,
  exportVoiceEvaluation,
  getVoiceEvaluation,
  startVoiceEvaluation,
} from '../../application/voiceLatency'
import type {
  VoiceActivityCallbacks,
  VoiceActivityDetector,
} from './SileroVadAdapter'

class FakeVad implements VoiceActivityDetector {
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

  constructor(readonly mode: 'off' | 'observe' | 'endpoint') {}
}

class FakeRecognition {
  static instances: FakeRecognition[] = []
  lang = ''
  continuous = false
  interimResults = false
  onstart: (() => void) | null = null
  onresult:
    | ((event: {
        resultIndex?: number
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
      }) => void)
    | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  onspeechend: (() => void) | null = null
  onaudiostart: (() => void) | null = null
  onaudioend: (() => void) | null = null
  onspeechstart: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn()
  abort = vi.fn()

  constructor() {
    FakeRecognition.instances.push(this)
  }
}

beforeEach(() => {
  clearVoiceEvaluation()
  FakeRecognition.instances = []
  vi.useFakeTimers()
  vi.stubGlobal('SpeechRecognition', FakeRecognition)
})

afterEach(() => {
  clearVoiceEvaluation()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('ContinuousSpeechRecognition', () => {
  it('uses VAD silence to finish only an armed endpoint candidate', () => {
    const vad = new FakeVad('endpoint')
    const service = new ContinuousSpeechRecognition(
      vi.fn(),
      vi.fn(),
      vi.fn(),
      new VoiceController(),
      vad,
    )
    service.start()
    const recognition = FakeRecognition.instances[0]!
    vad.callbacks?.onSpeechEnd()
    expect(recognition.stop).not.toHaveBeenCalled()
    service.armVadEndpoint()
    expect(recognition.stop).toHaveBeenCalledOnce()
    vad.callbacks?.onSpeechEnd()
    expect(recognition.stop).toHaveBeenCalledOnce()
    service.stop()
    expect(vad.stop).toHaveBeenCalledWith(recognition)
  })

  it('records VAD in observe mode without changing native recognition', () => {
    const vad = new FakeVad('observe')
    const service = new ContinuousSpeechRecognition(
      vi.fn(),
      vi.fn(),
      vi.fn(),
      new VoiceController(),
      vad,
    )
    service.start()
    const recognition = FakeRecognition.instances[0]!
    service.armVadEndpoint()
    vad.callbacks?.onSpeechStart()
    vad.callbacks?.onSpeechEnd()
    expect(recognition.stop).not.toHaveBeenCalled()
    service.stop()
  })

  it('records native audio lifecycle and error reasons, and cleans replaced callbacks', () => {
    startVoiceEvaluation({
      browser: 'edge',
      device: 'desktop',
      deviceProfile: 'primary',
      noise: 'quiet',
      audioOutput: 'speakers',
      startup: 'warm',
    })
    const service = new ContinuousSpeechRecognition(vi.fn(), vi.fn())
    service.start()
    const first = FakeRecognition.instances[0]!
    first.onstart?.()
    first.onaudiostart?.()
    first.onspeechstart?.()
    first.onaudioend?.()
    first.onerror?.({ error: 'network' })
    const events = getVoiceEvaluation()!.entries.flatMap((entry) =>
      entry.kind === 'capture' ? [entry.event] : [],
    )
    expect(events.map(({ name }) => name)).toContain('audio-ended')
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'error', errorCode: 'network' }),
      ]),
    )
    expect(first.onaudiostart).toBeNull()
    expect(first.onaudioend).toBeNull()
    expect(first.onspeechstart).toBeNull()
    vi.advanceTimersByTime(500)
    expect(FakeRecognition.instances).toHaveLength(2)
    service.stop()
  })

  it('closes a continuous intervention gracefully and rearms only after end', () => {
    const onPhrase = vi.fn()
    const service = new ContinuousSpeechRecognition(onPhrase, vi.fn())
    service.start()
    const first = FakeRecognition.instances[0]!
    service.finishUtterance()
    service.finishUtterance()
    expect(first.stop).toHaveBeenCalledOnce()
    expect(first.abort).not.toHaveBeenCalled()
    const event = {
      results: [{ isFinal: true, 0: { transcript: 'Siguiente' } }],
    }
    first.onresult?.(event)
    first.onresult?.(event)
    expect(onPhrase).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(300)
    expect(FakeRecognition.instances).toHaveLength(1)
    first.onend?.()
    vi.advanceTimersByTime(300)
    expect(FakeRecognition.instances).toHaveLength(2)
    expect(FakeRecognition.instances[1]!.continuous).toBe(true)
    service.stop()
  })

  it('recovers from a missing final/end after graceful continuous closure and drops old callbacks', () => {
    const onPhrase = vi.fn()
    const service = new ContinuousSpeechRecognition(onPhrase, vi.fn())
    service.start()
    const first = FakeRecognition.instances[0]!
    const lateResult = first.onresult!
    service.finishUtterance()
    vi.advanceTimersByTime(5300)
    expect(first.abort).toHaveBeenCalledOnce()
    expect(FakeRecognition.instances).toHaveLength(2)
    lateResult({ results: [{ isFinal: true, 0: { transcript: 'Siguiente' } }] })
    expect(onPhrase).not.toHaveBeenCalled()
    service.stop()
  })

  it.each(['listening', 'reconnecting'])(
    'lets a question replace %s without a stale command or retry',
    async (phase) => {
      const controller = new VoiceController()
      const onPhrase = vi.fn()
      const onStatus = vi.fn()
      const service = new ContinuousSpeechRecognition(
        onPhrase,
        onStatus,
        undefined,
        controller,
      )
      const questions = new BrowserSpeechToTextAdapter(controller)
      service.start()
      const commandRecognition = FakeRecognition.instances[0]!
      const lateResult = commandRecognition.onresult!
      if (phase === 'reconnecting')
        commandRecognition.onerror?.({ error: 'network' })
      const pending = questions.listen()
      expect(onStatus).toHaveBeenLastCalledWith('suspended')
      expect(commandRecognition.abort).toHaveBeenCalledOnce()
      lateResult({
        results: [{ isFinal: true, 0: { transcript: 'Siguiente' } }],
      })
      vi.advanceTimersByTime(20_000)
      expect(onPhrase).not.toHaveBeenCalled()
      expect(FakeRecognition.instances).toHaveLength(2)
      const questionRecognition = FakeRecognition.instances[1]!
      questionRecognition.onresult?.({
        results: [{ isFinal: true, 0: { transcript: '¿Cómo respiro?' } }],
      })
      questionRecognition.onend?.()
      await expect(pending).resolves.toBe('¿Cómo respiro?')
      expect(controller.getState()).toEqual({ status: 'IDLE' })
      service.start()
      expect(FakeRecognition.instances).toHaveLength(3)
      service.stop()
    },
  )

  it('correlates capture events without retaining recognized speech or duplicate finals', () => {
    startVoiceEvaluation({
      browser: 'chrome',
      device: 'desktop',
      deviceProfile: 'primary',
      noise: 'quiet',
      audioOutput: 'speakers',
      startup: 'warm',
    })
    const onPhrase = vi.fn()
    const service = new ContinuousSpeechRecognition(onPhrase, vi.fn())
    service.start()
    const recognition = FakeRecognition.instances[0]!
    recognition.onstart?.()
    recognition.onresult?.({
      results: [{ isFinal: false, 0: { transcript: 'Mi texto privado' } }],
    })
    recognition.onresult?.({
      results: [
        { isFinal: false, 0: { transcript: 'Mi texto privado corregido' } },
      ],
    })
    recognition.onspeechend?.()
    recognition.onresult?.({
      results: [
        { isFinal: true, 0: { transcript: 'Mi texto privado corregido' } },
      ],
    })
    recognition.onresult?.({
      results: [
        { isFinal: true, 0: { transcript: 'Mi texto privado corregido' } },
      ],
    })
    service.stop()
    const events = getVoiceEvaluation()!.entries.flatMap((entry) =>
      entry.kind === 'capture' ? [entry.event] : [],
    )
    expect(events.map((event) => event.name)).toEqual([
      'start-requested',
      'started',
      'first-interim',
      'speech-ended',
      'final-result',
      'cancel-requested',
    ])
    expect(new Set(events.map((event) => event.captureId)).size).toBe(1)
    expect(
      events
        .filter((event) => event.resultIndex !== undefined)
        .map((event) => event.resultIndex),
    ).toEqual([0, 0])
    expect(onPhrase).toHaveBeenCalledTimes(1)
    expect(exportVoiceEvaluation()).not.toContain('Mi texto privado')
  })

  it('handles each final phrase once and restarts after an idle disconnect', () => {
    const onPhrase = vi.fn()
    const onStatus = vi.fn()
    const onInterim = vi.fn()
    const service = new ContinuousSpeechRecognition(
      onPhrase,
      onStatus,
      onInterim,
    )
    service.start()
    const first = FakeRecognition.instances[0]!
    expect(first.continuous).toBe(true)
    expect(first.interimResults).toBe(true)
    expect(first.lang).toBe('es-MX')
    first.onstart?.()
    first.onresult?.({
      results: [{ isFinal: false, 0: { transcript: 'Pau' } }],
    })
    expect(onInterim).toHaveBeenCalledExactlyOnceWith(
      'Pau',
      expect.objectContaining({ receivedAt: expect.any(Number) }),
    )
    expect(onPhrase).not.toHaveBeenCalled()
    first.onresult?.({
      results: [{ isFinal: true, 0: { transcript: 'Pausar' } }],
    })
    first.onresult?.({
      results: [{ isFinal: true, 0: { transcript: 'Pausar' } }],
    })
    expect(onPhrase).toHaveBeenCalledExactlyOnceWith(
      'Pausar',
      expect.objectContaining({ receivedAt: expect.any(Number) }),
    )
    expect(onStatus).toHaveBeenCalledWith('listening')
    first.onend?.()
    vi.advanceTimersByTime(300)
    expect(FakeRecognition.instances).toHaveLength(2)
    service.stop()
  })

  it('retries network errors but stops after permission denial', () => {
    const onStatus = vi.fn()
    const service = new ContinuousSpeechRecognition(vi.fn(), onStatus)
    service.start()
    FakeRecognition.instances[0]!.onerror?.({ error: 'network' })
    expect(onStatus).toHaveBeenLastCalledWith('reconnecting')
    vi.advanceTimersByTime(500)
    expect(FakeRecognition.instances).toHaveLength(2)
    FakeRecognition.instances[1]!.onerror?.({ error: 'not-allowed' })
    expect(onStatus).toHaveBeenLastCalledWith('blocked')
    vi.advanceTimersByTime(20_000)
    expect(FakeRecognition.instances).toHaveLength(2)
  })

  it('suspends listening for the assistant without reconnecting', () => {
    const service = new ContinuousSpeechRecognition(vi.fn(), vi.fn())
    service.start()
    const first = FakeRecognition.instances[0]!
    service.suspend()
    expect(first.abort).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(20_000)
    expect(FakeRecognition.instances).toHaveLength(1)
    service.start()
    expect(FakeRecognition.instances).toHaveLength(2)
    service.stop()
  })

  it('captures one push-to-talk phrase and waits for another explicit start', () => {
    const onPhrase = vi.fn()
    const onStatus = vi.fn()
    const service = new ContinuousSpeechRecognition(onPhrase, onStatus)
    service.start(true)
    const first = FakeRecognition.instances[0]!
    expect(first.continuous).toBe(false)
    first.onresult?.({
      results: [{ isFinal: true, 0: { transcript: 'Siguiente' } }],
    })
    expect(onPhrase).toHaveBeenCalledTimes(1)
    expect(first.abort).toHaveBeenCalledOnce()
    expect(onStatus).toHaveBeenLastCalledWith('ready')
    vi.advanceTimersByTime(20_000)
    expect(FakeRecognition.instances).toHaveLength(1)
    service.start(true)
    expect(FakeRecognition.instances).toHaveLength(2)
    service.stop()
  })

  it('finishes capture gracefully so the final phrase is not discarded', () => {
    const onPhrase = vi.fn()
    const service = new ContinuousSpeechRecognition(onPhrase, vi.fn())
    service.start(true)
    const first = FakeRecognition.instances[0]!
    service.finishUtterance()
    service.finishUtterance()
    expect(first.stop).toHaveBeenCalledOnce()
    expect(first.abort).not.toHaveBeenCalled()
    first.onresult?.({
      results: [{ isFinal: true, 0: { transcript: 'Pausar' } }],
    })
    expect(onPhrase).toHaveBeenCalledTimes(1)
    service.stop()
  })

  it.each(['silence', 'network', 'end', 'final-timeout'])(
    'does not restart a push-to-talk capture after %s',
    (reason) => {
      const onStatus = vi.fn()
      const service = new ContinuousSpeechRecognition(vi.fn(), onStatus)
      service.start(true)
      const first = FakeRecognition.instances[0]!
      if (reason === 'network') first.onerror?.({ error: 'network' })
      if (reason === 'end') first.onend?.()
      if (reason === 'final-timeout') service.finishUtterance()
      vi.advanceTimersByTime(20_000)
      expect(FakeRecognition.instances).toHaveLength(1)
      expect(onStatus).toHaveBeenLastCalledWith('ready')
      service.stop()
    },
  )

  it('reports recognition timings without altering or repeating the phrase', () => {
    const onPhrase = vi.fn()
    const onInterim = vi.fn()
    const service = new ContinuousSpeechRecognition(
      onPhrase,
      vi.fn(),
      onInterim,
    )
    service.start()
    const first = FakeRecognition.instances[0]!
    const start = performance.now()
    first.onresult?.({
      results: [{ isFinal: false, 0: { transcript: 'Pau' } }],
    })
    vi.advanceTimersByTime(100)
    first.onspeechend?.()
    vi.advanceTimersByTime(250)
    first.onresult?.({
      results: [{ isFinal: true, 0: { transcript: 'Pausar' } }],
    })
    expect(onPhrase).toHaveBeenCalledExactlyOnceWith('Pausar', {
      captureId: expect.any(Number),
      resultIndex: 0,
      firstResultAt: start,
      speechEndedAt: start + 100,
      receivedAt: start + 350,
    })
    service.stop()
  })
})
