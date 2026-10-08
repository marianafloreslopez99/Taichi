import { useCallback, useEffect, useRef, useState } from 'react'
import { voiceServices } from '../../app/services'
import {
  catalogWelcome,
  catalogSelection,
  voiceCommandSections,
} from '../../application/practiceInteraction'
import { playVoiceGuide } from '../../application/voiceGuide'
import { Icon } from './Icon'

export function CatalogWelcome() {
  const [welcome, setWelcome] = useState(catalogWelcome)
  const [section, setSection] = useState<string | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const [audioError, setAudioError] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)

  const stop = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    voiceServices.tts.stop()
  }, [])

  const play = useCallback(() => {
    stop()
    const controller = new AbortController()
    controllerRef.current = controller
    setSpeaking(true)
    setAudioError(false)
    setSection(null)
    const nextWelcome = catalogWelcome()
    setWelcome(nextWelcome)
    void (async () => {
      await playVoiceGuide(
        [...nextWelcome.sections, ...voiceCommandSections].map((text) => ({
          text,
          pauseAfterMs: 0,
        })),
        voiceServices.tts,
        controller.signal,
        (cue) => setSection(cue.text),
      )
      if (controller.signal.aborted) return
      setSpeaking(false)
      setSection(catalogSelection)
    })().catch(() => {
      if (controller.signal.aborted) return
      setSpeaking(false)
      setAudioError(true)
      setSection(null)
    })
  }, [stop])

  useEffect(() => {
    play()
    return stop
  }, [play, stop])

  return (
    <section
      className="catalog-welcome"
      aria-label="Bienvenida y comandos de voz"
    >
      <span className="catalog-welcome-icon" aria-hidden="true">
        <Icon name="sound" />
      </span>
      <div className="catalog-welcome-copy">
        <span className="eyebrow">TU GUÍA DE VOZ</span>
        <p role="status" aria-live="polite" aria-atomic="true">
          {section ?? welcome.sections[0]}
        </p>
      </div>
      <button
        className="voice-console-toggle"
        onClick={() => {
          if (speaking) {
            stop()
            setSpeaking(false)
          } else play()
        }}
      >
        {speaking ? 'Detener bienvenida' : 'Escuchar bienvenida'}
      </button>
      {audioError && (
        <p className="notice catalog-welcome-error" role="status">
          No se pudo reproducir la bienvenida. Puedes volver a escucharla o
          seleccionar una rutina.
        </p>
      )}
    </section>
  )
}
