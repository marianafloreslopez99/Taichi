import { describe, expect, it, vi } from 'vitest'
import type { TextToSpeechService } from './ports'
import { playVoiceGuide } from './voiceGuide'

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
})
