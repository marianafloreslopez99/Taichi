import { useCallback, useEffect, useRef, useState } from 'react'
import { voiceServices } from '../../app/services'
import {
  practiceGuidance,
  readGuidanceSeen,
  rememberGuidance,
  type PracticeGuidanceId,
} from '../../application/practiceInteraction'

export function usePracticeGuidance() {
  const [activeTip, setActiveTip] = useState<PracticeGuidanceId | null>(null)
  const [audioError, setAudioError] = useState(false)
  const seenRef = useRef(readGuidanceSeen())
  const skipRef = useRef<(() => void) | null>(null)

  const clearTip = useCallback(() => {
    skipRef.current = null
    setActiveTip(null)
  }, [])

  useEffect(
    () => () => {
      skipRef.current?.()
      skipRef.current = null
    },
    [],
  )

  const playTip = useCallback(
    async (id: PracticeGuidanceId, signal: AbortSignal) => {
      if (signal.aborted || seenRef.current.has(id)) return
      setActiveTip(id)
      setAudioError(false)
      let finish: () => void = () => {}
      const interruption = new Promise<void>((resolve) => {
        finish = resolve
      })
      const skip = () => {
        voiceServices.tts.stop()
        finish()
      }
      skipRef.current = skip
      signal.addEventListener('abort', finish, { once: true })
      try {
        await Promise.race([
          voiceServices.tts.speak(practiceGuidance[id].text),
          interruption,
        ])
        if (!signal.aborted) {
          seenRef.current.add(id)
          rememberGuidance(id)
        }
      } catch {
        if (!signal.aborted) setAudioError(true)
      } finally {
        signal.removeEventListener('abort', finish)
        if (skipRef.current === skip) {
          skipRef.current = null
          setActiveTip(null)
        }
      }
    },
    [],
  )

  return {
    activeTip,
    audioError,
    playTip,
    clearTip,
    skipTip: () => skipRef.current?.(),
  }
}
