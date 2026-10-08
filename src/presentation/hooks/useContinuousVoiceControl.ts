import { useEffect, useRef, useState } from 'react'
import {
  ContinuousSpeechRecognition,
  type ContinuousMicStatus,
} from '../../infrastructure/ai/ContinuousSpeechRecognition'
import type { VoiceRecognitionTiming } from '../../application/voiceLatency'

export type VoiceListeningMode = 'continuous' | 'push-to-talk'

export function useContinuousVoiceControl(
  active: boolean,
  onPhrase: (text: string, timing: VoiceRecognitionTiming) => void,
  onInterim?: (text: string, timing: VoiceRecognitionTiming) => void,
) {
  const [enabled, setEnabled] = useState(true)
  const [status, setStatus] = useState<ContinuousMicStatus>('off')
  const [mode, setMode] = useState<VoiceListeningMode>('continuous')
  const [capturing, setCapturing] = useState(false)
  const onPhraseRef = useRef(onPhrase)
  const onInterimRef = useRef(onInterim)
  const listenerRef = useRef<ContinuousSpeechRecognition | null>(null)
  onPhraseRef.current = onPhrase
  onInterimRef.current = onInterim

  useEffect(() => {
    let mounted = true
    const listener = new ContinuousSpeechRecognition(
      (text, timing) => onPhraseRef.current(text, timing),
      (nextStatus) => {
        if (mounted) {
          setStatus(nextStatus)
          if (
            ['ready', 'blocked', 'unsupported', 'suspended', 'off'].includes(
              nextStatus,
            )
          )
            setCapturing(false)
        }
      },
      (text, timing) => onInterimRef.current?.(text, timing),
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
    else if (mode === 'push-to-talk' && !capturing) listener.wait()
    else listener.start(mode === 'push-to-talk')
  }, [active, enabled, mode, capturing])

  return {
    status,
    enabled,
    mode,
    capturing,
    available:
      active && enabled && status !== 'unsupported' && status !== 'processing',
    setMode: (nextMode: VoiceListeningMode) => {
      listenerRef.current?.suspend()
      setCapturing(false)
      setMode(nextMode)
    },
    talk: () => {
      if (!active || !enabled || mode !== 'push-to-talk') return
      if (capturing) listenerRef.current?.finishUtterance()
      else {
        setCapturing(true)
        listenerRef.current?.start(true)
      }
    },
    toggle: () => {
      listenerRef.current?.stop()
      setCapturing(false)
      setEnabled((current) => !current)
    },
    retry: () => {
      if (active && enabled) {
        if (mode === 'push-to-talk') setCapturing(true)
        listenerRef.current?.start(mode === 'push-to-talk')
      }
    },
    suspendNow: () => {
      listenerRef.current?.suspend()
      setCapturing(false)
    },
  }
}
