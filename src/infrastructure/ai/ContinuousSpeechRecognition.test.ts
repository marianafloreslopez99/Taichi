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
  start = vi.fn()
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
    expect(onInterim).toHaveBeenCalledExactlyOnceWith('Pau')
    expect(onPhrase).not.toHaveBeenCalled()
    first.onresult?.({
      results: [{ isFinal: true, 0: { transcript: 'Pausar' } }],
    })
    first.onresult?.({
      results: [{ isFinal: true, 0: { transcript: 'Pausar' } }],
    })
    expect(onPhrase).toHaveBeenCalledExactlyOnceWith('Pausar')
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
})
