import type { VoiceCue } from '../domain/models'
import type { TextToSpeechService } from './ports'

function waitForPause(milliseconds: number, signal: AbortSignal) {
  if (milliseconds === 0 || signal.aborted) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const timeout = window.setTimeout(finish, milliseconds)
    signal.addEventListener('abort', finish, { once: true })

    function finish() {
      window.clearTimeout(timeout)
      signal.removeEventListener('abort', finish)
      resolve()
    }
  })
}

export async function playVoiceGuide(
  guide: VoiceCue[],
  tts: TextToSpeechService,
  signal: AbortSignal,
) {
  for (const cue of guide) {
    if (signal.aborted) return
    await tts.speak(cue.text)
    if (signal.aborted) return
    await waitForPause(cue.pauseAfterMs, signal)
  }
}
