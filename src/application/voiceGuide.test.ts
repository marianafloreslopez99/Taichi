import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TextToSpeechService } from './ports'
import { playVoiceGuide, type VoiceGuidePosition } from './voiceGuide'

afterEach(() => vi.useRealTimers())

describe('playVoiceGuide', () => {
  it('announces the matching image before speaking and stops cue updates on abort', async () => {
    const controller = new AbortController()
    const onCue = vi.fn()
    const guide = [
      { text: 'Primera', pauseAfterMs: 0, image: '1.jpg' },
      { text: 'Segunda', pauseAfterMs: 0, image: '2.jpg' },
    ]
    const tts: TextToSpeechService = {
      speak: vi.fn(async () => {
        expect(onCue).toHaveBeenCalledWith(guide[0], 0)
        controller.abort()
      }),
      stop: vi.fn(),
    }
    await playVoiceGuide(guide, tts, controller.signal, onCue)
    expect(onCue).toHaveBeenCalledTimes(1)
    expect(tts.speak).toHaveBeenCalledTimes(1)
  })

  it('narrates every cue in order', async () => {
    const tts: TextToSpeechService = {
      speak: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
    }
    await playVoiceGuide(
      [
        { text: 'Primera', pauseAfterMs: 0 },
        { text: 'Segunda', pauseAfterMs: 0 },
      ],
      tts,
      new AbortController().signal,
    )
    expect(tts.speak).toHaveBeenNthCalledWith(1, 'Primera')
    expect(tts.speak).toHaveBeenNthCalledWith(2, 'Segunda')
  })

  it('does not continue after the current narration is cancelled', async () => {
    let finishSpeaking: () => void = () => {}
    const tts: TextToSpeechService = {
      speak: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishSpeaking = resolve
          }),
      ),
      stop: vi.fn(),
    }
    const controller = new AbortController()
    const playback = playVoiceGuide(
      [
        { text: 'Primera', pauseAfterMs: 0 },
        { text: 'Segunda', pauseAfterMs: 0 },
      ],
      tts,
      controller.signal,
    )
    await Promise.resolve()
    controller.abort()
    finishSpeaking()
    await playback
    expect(tts.speak).toHaveBeenCalledTimes(1)
  })

  it('repeats the whole current instruction after successive interruptions without replaying earlier ones', async () => {
    const guide = [
      { text: 'Primera instrucción', pauseAfterMs: 0 },
      { text: 'Respira y levanta los brazos', pauseAfterMs: 0 },
    ]
    const position: VoiceGuidePosition = { cueIndex: 1 }
    const tts: TextToSpeechService = {
      speak: vi.fn(),
      stop: vi.fn(),
    }
    for (let interruption = 0; interruption < 2; interruption += 1) {
      const controller = new AbortController()
      vi.mocked(tts.speak).mockImplementationOnce(async () => {
        controller.abort()
      })
      await playVoiceGuide(guide, tts, controller.signal, undefined, position)
    }
    vi.mocked(tts.speak).mockResolvedValueOnce()
    await playVoiceGuide(
      guide,
      tts,
      new AbortController().signal,
      undefined,
      position,
    )
    expect(vi.mocked(tts.speak).mock.calls.map(([text]) => text)).toEqual([
      'Respira y levanta los brazos',
      'Respira y levanta los brazos',
      'Respira y levanta los brazos',
    ])
    expect(position.cueIndex).toBe(guide.length)
    await playVoiceGuide(
      guide,
      tts,
      new AbortController().signal,
      undefined,
      position,
    )
    expect(tts.speak).toHaveBeenCalledTimes(3)
  })

  it('repeats the current instruction when paused during its waiting interval, then continues normally', async () => {
    vi.useFakeTimers()
    const guide = [
      { text: 'Primera', pauseAfterMs: 3000 },
      { text: 'Segunda', pauseAfterMs: 0 },
    ]
    const position: VoiceGuidePosition = { cueIndex: 0 }
    const tts: TextToSpeechService = {
      speak: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
    }
    const controller = new AbortController()
    const playback = playVoiceGuide(
      guide,
      tts,
      controller.signal,
      undefined,
      position,
    )
    await vi.advanceTimersByTimeAsync(1200)
    controller.abort()
    await playback
    expect(position.cueIndex).toBe(0)
    await vi.advanceTimersByTimeAsync(10000)
    const resumed = playVoiceGuide(
      guide,
      tts,
      new AbortController().signal,
      undefined,
      position,
    )
    await vi.advanceTimersByTimeAsync(2999)
    expect(tts.speak).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    await resumed
    expect(vi.mocked(tts.speak).mock.calls.map(([text]) => text)).toEqual([
      'Primera',
      'Primera',
      'Segunda',
    ])
  })
})
