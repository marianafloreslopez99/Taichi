import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContinuousSpeechRecognition } from './ContinuousSpeechRecognition'

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
  start = vi.fn()
  stop = vi.fn()
  abort = vi.fn()

  constructor() {
    FakeRecognition.instances.push(this)
  }
}

beforeEach(() => {
  FakeRecognition.instances = []
  vi.useFakeTimers()
  vi.stubGlobal('SpeechRecognition', FakeRecognition)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('ContinuousSpeechRecognition', () => {
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
      firstResultAt: start,
      speechEndedAt: start + 100,
      receivedAt: start + 350,
    })
    service.stop()
  })
})
