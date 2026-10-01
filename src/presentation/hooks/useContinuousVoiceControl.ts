import { useEffect, useRef, useState } from 'react'
import {
  ContinuousSpeechRecognition,
  type ContinuousMicStatus,
} from '../../infrastructure/ai/ContinuousSpeechRecognition'

export function useContinuousVoiceControl(
  active: boolean,
  onPhrase: (text: string) => void,
  onInterim?: (text: string) => void,
) {
  const [enabled, setEnabled] = useState(true)
  const [status, setStatus] = useState<ContinuousMicStatus>('off')
  const onPhraseRef = useRef(onPhrase)
  const onInterimRef = useRef(onInterim)
  const listenerRef = useRef<ContinuousSpeechRecognition | null>(null)
  onPhraseRef.current = onPhrase
  onInterimRef.current = onInterim

  useEffect(() => {
    let mounted = true
    const listener = new ContinuousSpeechRecognition(
      (text) => onPhraseRef.current(text),
      (nextStatus) => {
        if (mounted) setStatus(nextStatus)
      },
      (text) => onInterimRef.current?.(text),
    )
    listenerRef.current = listener
    return () => {
      mounted = false
      listener.stop()
      listenerRef.current = null
    }
  }, [])

  useEffect(() => {
    const listener = listenerRef.current
    if (!listener) return
    if (!enabled) listener.stop()
    else if (!active) listener.suspend()
    else listener.start()
  }, [active, enabled])

  return {
    status,
    enabled,
    toggle: () => setEnabled((current) => !current),
    retry: () => {
      if (active) listenerRef.current?.start()
    },
    suspendNow: () => listenerRef.current?.suspend(),
  }
}
