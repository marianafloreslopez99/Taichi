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
  onCue?: (cue: VoiceCue, index: number) => void,
) {
  for (const [index, cue] of guide.entries()) {
    if (signal.aborted) return
    onCue?.(cue, index)
    await tts.speak(cue.text)
    if (signal.aborted) return
    await waitForPause(cue.pauseAfterMs, signal)
  }
}
