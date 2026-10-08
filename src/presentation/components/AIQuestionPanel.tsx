import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { AIInteractionStatus } from '../../application/questionFlow'
import { Icon } from './Icon'
import { VoiceTalkButton, type VoiceTalkControl } from './VoiceTalkButton'

interface Props {
  status: AIInteractionStatus
  question: string
  answer: string
  error: string
  audioError: boolean
  requiresProfessionalAdvice: boolean
  onClose: () => void
  onSubmit: (question: string) => void
  onListen: () => void
  onStopListening: () => void
  onReplay: () => void
  onContinue: () => void
  talkControl?: VoiceTalkControl
}

const statusText: Record<AIInteractionStatus, string> = {
  IDLE: 'Haz tu pregunta por voz',
  LISTENING: 'Escuchando...',
  TRANSCRIBING: 'Transcribiendo...',
  THINKING: 'IA está pensando...',
  SPEAKING: 'Aquí tienes una orientación',
  ERROR: 'No pudimos responder',
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
  onSubmit,
  onListen,
  onStopListening,
  onReplay,
  onContinue,
  talkControl,
}: Props) {
  const [draft, setDraft] = useState(question)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const processing =
    status === 'LISTENING' || status === 'THINKING' || status === 'SPEAKING'
  const showForm =
    status === 'IDLE' || status === 'LISTENING' || status === 'ERROR'

  useEffect(() => {
    if (status === 'IDLE' || status === 'ERROR') inputRef.current?.focus()
  }, [status])

  useEffect(() => {
    setDraft(question)
  }, [question])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const controls = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.ai-panel button:not(:disabled), .ai-panel textarea:not(:disabled)',
        ),
      )
      const first = controls[0]
      const last = controls[controls.length - 1]
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

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const normalized = draft.trim()
    if (normalized) onSubmit(normalized)
  }

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
            <Icon name="spark" /> ASISTENTE DE PRÁCTICA · IA
          </span>
          <button
            className="icon-button"
            aria-label="Cerrar pregunta"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="ai-guide-paused" role="status">
          <Icon name="pause" /> La guía está en pausa mientras preguntas
        </div>
        <div className={`ai-orb ${processing ? 'ai-orb--active' : ''}`}>
          <Icon name="spark" />
        </div>
        <p className="eyebrow ai-step">PREGUNTA SOBRE ESTE MOVIMIENTO</p>
        <h2 id="ai-title" aria-live="polite">
          {statusText[status]}
        </h2>
        {showForm && (
          <div className="ai-voice-controls">
            <button
              className="button button--primary"
              type="button"
              onClick={status === 'LISTENING' ? onStopListening : onListen}
            >
              <Icon name="mic" />
              {status === 'LISTENING'
                ? 'Detener micrófono'
                : 'Preguntar por voz'}
            </button>
            <p role="status">
              {status === 'LISTENING'
                ? 'Escuchando tu pregunta. Habla con claridad; se enviará al terminar.'
                : 'Habla y enviaremos la transcripción a IA automáticamente.'}
            </p>
          </div>
        )}

        {showForm && (
          <form className="ai-question-form" onSubmit={submit}>
            <label htmlFor="ai-question">
              Escribe tu duda o corrige la transcripción
            </label>
            <textarea
              ref={inputRef}
              id="ai-question"
              value={draft}
              maxLength={2000}
              rows={4}
              placeholder="Por ejemplo: ¿cómo debo respirar al elevar los brazos?"
              onChange={(event) => {
                if (status === 'LISTENING') onStopListening()
                setDraft(event.target.value)
              }}
            />
            <div className="ai-question-form-footer">
              <span>{draft.length}/2000</span>
              <button
                className="button button--primary"
                type="submit"
                disabled={!draft.trim()}
              >
                {status === 'ERROR' ? 'Volver a intentar' : 'Preguntar a IA'}
                <Icon name="arrowRight" />
              </button>
            </div>
          </form>
        )}

        {(status === 'THINKING' || status === 'SPEAKING') && (
          <p className="ai-help">
            La pregunta se responde usando la rutina y el movimiento actuales.
          </p>
        )}
        {(processing || status === 'COMPLETED') && (
          <div className="ai-stage-list" aria-label="Etapas de la pregunta">
            <span className={status === 'THINKING' ? 'active' : ''}>
              Analizar contexto
            </span>
            <span
              className={
                status === 'SPEAKING' || status === 'COMPLETED' ? 'active' : ''
              }
            >
              Responder
            </span>
          </div>
        )}
        {question && !showForm && (
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
          {answer && (
            <button className="button button--quiet" onClick={onReplay}>
              <Icon name="sound" /> Escuchar de nuevo
            </button>
          )}
          {(status === 'COMPLETED' || status === 'ERROR') && (
            <button className="button button--primary" onClick={onContinue}>
              Continuar rutina <Icon name="arrowRight" />
            </button>
          )}
        </div>
        {(status === 'COMPLETED' || status === 'ERROR') && (
          <p className="ai-help">
            {talkControl ? 'Pulsa para hablar y di' : 'También puedes decir'}{' '}
            «Continuar» para volver a la rutina.
          </p>
        )}
        {(status === 'COMPLETED' || status === 'ERROR') && talkControl && (
          <VoiceTalkButton {...talkControl} />
        )}
      </section>
    </div>
  )
}
