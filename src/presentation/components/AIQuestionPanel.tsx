import { useEffect, useRef } from 'react'
import type { AIInteractionStatus } from '../../application/questionFlow'
import { Icon } from './Icon'

interface Props {
  status: AIInteractionStatus
  question: string
  answer: string
  error: string
  audioError: boolean
  requiresProfessionalAdvice: boolean
  onClose: () => void
  onRetry: () => void
  onReplay: () => void
  onContinue: () => void
}

const statusText: Record<AIInteractionStatus, string> = {
  IDLE: 'Preparando...',
  LISTENING: 'Escuchando...',
  TRANSCRIBING: 'Transcribiendo...',
  THINKING: 'Pensando...',
  SPEAKING: 'Respondiendo...',
  ERROR: 'Ocurrió un problema',
  COMPLETED: 'Aquí tienes una orientación',
}

export function AIQuestionPanel({
  status,
  question,
  answer,
  error,
  audioError,
  requiresProfessionalAdvice,
  onClose,
  onRetry,
  onReplay,
  onContinue,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
  }, [])
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>(
          '.ai-panel button:not(:disabled)',
        ),
      )
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first && last) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last && first) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])
  const processing = !['ERROR', 'COMPLETED'].includes(status)
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="ai-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-title"
      >
        <div className="ai-panel-top">
          <span className="eyebrow">
            <Icon name="spark" /> GUÍA DE VOZ · DEMOSTRACIÓN
          </span>
          <button
            ref={closeRef}
            className="icon-button"
            aria-label="Cerrar pregunta"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className={`ai-orb ${processing ? 'ai-orb--active' : ''}`}>
          <Icon name={processing ? 'mic' : 'spark'} />
        </div>
        <p className="eyebrow ai-step">PREGUNTA A TU GUÍA</p>
        <h2 id="ai-title" aria-live="polite">
          {statusText[status]}
        </h2>
        {processing && (
          <p className="ai-help">
            Estamos simulando el recorrido de voz. No se está grabando tu
            micrófono.
          </p>
        )}
        <div className="ai-stage-list" aria-label="Etapas de la pregunta">
          <span className={status === 'LISTENING' ? 'active' : ''}>
            Escuchar
          </span>
          <span className={status === 'TRANSCRIBING' ? 'active' : ''}>
            Transcribir
          </span>
          <span className={status === 'THINKING' ? 'active' : ''}>Pensar</span>
          <span className={status === 'SPEAKING' ? 'active' : ''}>
            Responder
          </span>
        </div>
        {question && (
          <div className="qa-block">
            <span>Tu pregunta</span>
            <p>“{question}”</p>
          </div>
        )}
        {answer && (
          <div className="qa-block qa-block--answer">
            <span>Orientación</span>
            <p>{answer}</p>
          </div>
        )}
        {requiresProfessionalAdvice && (
          <p className="notice">
            Esta aplicación no sustituye la orientación de un profesional de
            salud.
          </p>
        )}
        {audioError && (
          <p className="notice" role="status">
            El audio no se pudo reproducir. Puedes leer la respuesta aquí.
          </p>
        )}
        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}
        <div className="ai-actions">
          {status === 'ERROR' && (
            <button className="button button--secondary" onClick={onRetry}>
              Intentar de nuevo
            </button>
          )}
          {answer && (
            <button className="button button--quiet" onClick={onReplay}>
              <Icon name="sound" /> Escuchar de nuevo
            </button>
          )}
          {status === 'COMPLETED' && (
            <button className="button button--primary" onClick={onContinue}>
              Continuar rutina <Icon name="arrowRight" />
            </button>
          )}
          {status === 'ERROR' && (
            <button className="button button--quiet" onClick={onClose}>
              Volver a la rutina
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
