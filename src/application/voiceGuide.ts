import type { Movement, VoiceCue } from '../domain/models'
import type { TextToSpeechService } from './ports'

export interface VoiceGuidePosition {
  cueIndex: number
}

export function movementVoiceGuide(movement: Movement): VoiceCue[] {
  return movement.voiceGuide.map((cue, index) => ({
    ...cue,
    text:
      index === 0
        ? `En ${movement.name}, ${cue.text.charAt(0).toLocaleLowerCase('es-MX')}${cue.text.slice(1)}`
        : cue.text,
    pauseAfterMs: Math.min(cue.pauseAfterMs, 1500),
  }))
}

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
  savedPosition?: VoiceGuidePosition,
) {
  const position = savedPosition ?? { cueIndex: 0 }
  while (position.cueIndex < guide.length) {
    if (signal.aborted) return
    const cue = guide[position.cueIndex]!
    onCue?.(cue, position.cueIndex)
    await tts.speak(cue.text)
    if (signal.aborted) return
    await waitForPause(cue.pauseAfterMs, signal)
    if (signal.aborted) return
    position.cueIndex += 1
  }
}
