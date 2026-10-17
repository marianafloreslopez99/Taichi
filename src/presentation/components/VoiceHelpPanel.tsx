import { useEffect, useRef } from 'react'
import {
  commandConfirmations,
  voiceHelpTopics,
  type VoiceHelpTopic,
} from '../../application/practiceInteraction'
import type { VoiceListeningMode } from '../hooks/useContinuousVoiceControl'
import { Icon } from './Icon'
import { VoiceMicrophone } from './VoiceMicrophone'

interface Props {
  view: 'welcome' | 'commands'
  speaking: boolean
  busy: boolean
  feedback: string
  section: string
  error: string
  mode: VoiceListeningMode
  listening: boolean
  capturing: boolean
  available: boolean
  onTalk: () => void
  onClose: () => void
  onCommands: () => void
  onTopic: (topic: VoiceHelpTopic | 'all') => void
  onStop: () => void
  onMode: (mode: VoiceListeningMode) => void
  onContinue: () => void
}

export function VoiceHelpPanel({
  view,
  speaking,
  busy,
  feedback,
  section,
  error,
  mode,
  listening,
  capturing,
  available,
  onTalk,
  onClose,
  onCommands,
  onTopic,
  onStop,
  onMode,
  onContinue,
}: Props) {
  const panelRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
      if (event.key !== 'Tab') return
      const buttons = panelRef.current?.querySelectorAll<HTMLButtonElement>(
        'button:not(:disabled)',
      )
      const first = buttons?.[0]
      const last = buttons?.[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previousFocus?.focus()
    }
  }, [])

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={panelRef}
        className="ai-panel voice-help-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-help-title"
      >
        <div className="ai-panel-top">
          <span className="eyebrow">
            <Icon name="mic" /> AYUDA DE PRÁCTICA
          </span>
          <button
            className="icon-button"
            aria-label="Cerrar ayuda"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="ai-guide-paused">
          <Icon name="pause" /> La guía está en pausa mientras consultas la
          ayuda
        </div>
        <div className="ai-microphone">
          <VoiceMicrophone
            speaking={speaking}
            listening={listening}
            label={
              mode === 'push-to-talk'
                ? capturing
                  ? 'Terminar escucha'
                  : 'Pulsar para hablar'
                : speaking
                  ? 'Ayuda hablando'
                  : 'Micrófono atento'
            }
            onClick={mode === 'push-to-talk' ? onTalk : undefined}
            disabled={!available || speaking}
            enabled={mode === 'push-to-talk' ? capturing : undefined}
          />
        </div>
        <p className="voice-help-mode">
          {mode === 'continuous' ? 'Escucha continua' : 'Pulsar para hablar'}
        </p>
        <div className="voice-help-mode-options">
          <button
            className="button button--quiet"
            disabled={busy}
            onClick={() =>
              onMode(mode === 'continuous' ? 'push-to-talk' : 'continuous')
            }
          >
            {mode === 'continuous'
              ? 'Usar Pulsar para hablar'
              : 'Usar escucha continua'}
          </button>
        </div>
        <h2 id="voice-help-title">
          {view === 'commands'
            ? 'Estos son tus comandos'
            : 'Ayuda para tu práctica'}
        </h2>
        <p className="voice-help-feedback" role="status" aria-live="polite">
          {feedback ||
            (view === 'welcome'
              ? commandConfirmations.help
              : 'Puedes leer los comandos y escucharlos con calma.')}
        </p>
        <div className="voice-help-topics">
          {voiceHelpTopics.map((topic) => (
            <section
              className="voice-help-topic"
              key={topic.id}
              aria-label={topic.title}
            >
              <div className="voice-help-topic-heading">
                <h3>{topic.title}</h3>
                <button
                  className="button button--quiet"
                  disabled={busy}
                  onClick={() => onTopic(topic.id)}
                  aria-label={`Escuchar: ${topic.title}`}
                >
                  <Icon name="sound" /> Escuchar
                </button>
              </div>
              {view === 'commands' && (
                <ul className="voice-help-command-list">
                  {topic.sections.map((text) => (
                    <li
                      key={text}
                      className={
                        section === text && speaking
                          ? 'voice-help-command--speaking'
                          : ''
                      }
                    >
                      {text}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
        {speaking && !busy && (
          <button
            className="button button--quiet voice-help-stop"
            onClick={onStop}
          >
            Detener explicación
          </button>
        )}
        <p className="ai-help">
          {mode === 'push-to-talk'
            ? 'Pulsa el micrófono para hablar.'
            : 'Di «Cuáles eran los comandos» o «Aplica el modo Pulsar para hablar».'}
        </p>
        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}
        <div className="ai-actions">
          {view === 'commands' && (
            <button
              className="button button--quiet"
              disabled={busy}
              onClick={() => onTopic('all')}
            >
              Escuchar todos los temas
            </button>
          )}
          <button
            className="button button--quiet"
            disabled={speaking}
            onClick={onCommands}
          >
            Cuáles eran los comandos
          </button>
          <button
            className="button button--primary"
            disabled={speaking}
            onClick={onContinue}
          >
            Continuar práctica <Icon name="arrowRight" />
          </button>
        </div>
      </section>
    </div>
  )
}
