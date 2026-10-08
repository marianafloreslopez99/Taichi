import { useEffect, useRef } from 'react'
import { VoiceTalkButton, type VoiceTalkControl } from './VoiceTalkButton'

export const finishConfirmationPrompt =
  '¿Quieres finalizar tu práctica y ver el resumen? Para confirmar, di Sí, finalizar. Para seguir practicando, di Cancelar.'

export function FinishConfirmation({
  pending,
  speaking,
  listening,
  error,
  onConfirm,
  onCancel,
  talkControl,
}: {
  pending: boolean
  speaking: boolean
  listening: boolean
  error: string
  onConfirm: () => void
  onCancel: () => void
  talkControl?: VoiceTalkControl
}) {
  const panelRef = useRef<HTMLElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    return () => {
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  return (
    <div className="dialog-backdrop">
      <section
        ref={panelRef}
        className="ai-panel finish-confirmation"
        role="dialog"
        aria-modal="true"
        aria-labelledby="finish-title"
        aria-describedby="finish-description"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !pending) onCancel()
          if (event.key !== 'Tab') return
          const buttons = panelRef.current?.querySelectorAll<HTMLButtonElement>(
            'button:not(:disabled)',
          )
          const first = buttons?.[0]
          const last = buttons?.[buttons.length - 1]
          if (!first) {
            event.preventDefault()
            return
          }
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last?.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }}
      >
        <span className="eyebrow">TU PRÁCTICA</span>
        <h2 id="finish-title">¿Quieres finalizar la práctica?</h2>
        <p id="finish-description">
          Guardaremos el tiempo y las preguntas de esta sesión, y podrás ver el
          resumen. Di «Sí, finalizar» para confirmar o «Cancelar» para seguir
          practicando.
        </p>
        <p role="status">
          {pending
            ? 'Finalizando tu práctica…'
            : speaking
              ? 'Escucha la confirmación…'
              : listening
                ? 'Te escucho: «Sí, finalizar» o «Cancelar».'
                : 'Puedes usar los botones para responder.'}
        </p>
        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}
        {talkControl && <VoiceTalkButton {...talkControl} />}
        <div className="finish-confirmation-actions">
          <button
            ref={cancelRef}
            className="button button--quiet"
            disabled={pending}
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            className="button button--primary"
            disabled={pending}
            onClick={onConfirm}
          >
            Sí, finalizar
          </button>
        </div>
      </section>
    </div>
  )
}
