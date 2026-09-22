import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { useSession } from '../../app/SessionProvider'
import { voiceServices } from '../../app/services'
import type { PracticeSession, Routine } from '../../domain/models'
import { getRoutine } from '../../infrastructure/routines'
import { useVoiceInteraction } from '../hooks/useVoiceInteraction'
import { AIQuestionPanel } from '../components/AIQuestionPanel'
import { Icon } from '../components/Icon'
import { MovementVisual } from '../components/MovementVisual'
import { PracticeControls } from '../components/PracticeControls'
import { ProgressBar } from '../components/ProgressBar'

function formatTime(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function PracticeExperience({
  routine,
  session,
}: {
  routine: Routine
  session: PracticeSession
}) {
  const navigate = useNavigate()
  const actions = useSession()
  const [panelOpen, setPanelOpen] = useState(false)
  const [speechError, setSpeechError] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const voice = useVoiceInteraction(routine, session, actions.addQuestion)
  const movement = routine.movements[session.currentMovementIndex]

  useEffect(() => {
    if (!movement || session.status !== 'PLAYING') return
    let current = true
    setSpeechError(false)
    void voiceServices.tts.speak(movement.instruction).catch(() => {
      if (current) setSpeechError(true)
    })
    return () => {
      current = false
      voiceServices.tts.stop()
    }
  }, [movement, session.status])

  if (!movement)
    return (
      <div className="container empty-state">
        <h1>Movimiento no encontrado</h1>
        <Link to="/rutinas">Ver rutinas</Link>
      </div>
    )

  const next = () => {
    voiceServices.tts.stop()
    if (session.currentMovementIndex === routine.movements.length - 1) {
      void actions.complete().then(() => navigate('/resumen'))
    } else void actions.next()
  }
  const ask = () => {
    void actions.ask().then(() => {
      setPanelOpen(true)
      void voice.begin()
    })
  }
  const closePanel = () => {
    voice.close()
    actions.closeQuestion()
    setPanelOpen(false)
    triggerRef.current?.focus()
  }
  const continueRoutine = () => {
    closePanel()
    void actions.resume()
  }
  const abandon = () => {
    if (
      window.confirm(
        '¿Quieres abandonar esta práctica? Tu progreso actual se perderá.',
      )
    ) {
      voiceServices.tts.stop()
      actions.clear()
      navigate('/rutinas')
    }
  }
  return (
    <div className="practice-page container">
      <div className="practice-top">
        <div>
          <span className="eyebrow">EN TU PRÁCTICA</span>
          <h1>{routine.name}</h1>
        </div>
        <button className="leave-link" onClick={abandon}>
          Salir de la práctica <Icon name="close" />
        </button>
      </div>
      <ProgressBar
        current={session.currentMovementIndex}
        total={routine.movements.length}
      />
      <div className="practice-main">
        <div className="practice-art">
          <span className="practice-art-label">
            MOVIMIENTO {String(movement.order).padStart(2, '0')}
          </span>
          <MovementVisual visual={movement.visual} />
          <span className="practice-art-note">Muévete a tu ritmo</span>
        </div>
        <div className="practice-content" key={movement.id}>
          <span className="eyebrow">
            PASO {String(movement.order).padStart(2, '0')} DE{' '}
            {String(routine.movements.length).padStart(2, '0')}
          </span>
          <h2>{movement.name}</h2>
          <p className="movement-description">{movement.description}</p>
          <div className="instruction-card">
            <span>
              <Icon name="sound" /> GUÍA DE ESTE MOVIMIENTO
            </span>
            <p>{movement.instruction}</p>
          </div>
          <div className="practice-bottom-meta">
            <div>
              <span className="eyebrow">TIEMPO DE PRÁCTICA</span>
              <strong
                aria-label={`${Math.floor(session.elapsedSeconds / 60)} minutos y ${session.elapsedSeconds % 60} segundos`}
              >
                {formatTime(session.elapsedSeconds)}
              </strong>
            </div>
            <div className="session-status" role="status">
              <span
                className={
                  session.status === 'PAUSED'
                    ? 'status-dot status-dot--paused'
                    : 'status-dot'
                }
              />
              {session.status === 'PAUSED' ? 'En pausa' : 'En movimiento'}
            </div>
          </div>
          {speechError && (
            <p className="notice" role="status">
              El audio no está disponible. Sigue la instrucción escrita.
            </p>
          )}
        </div>
      </div>
      <div className="practice-action-area">
        <PracticeControls
          isPaused={session.status === 'PAUSED'}
          isFirst={session.currentMovementIndex === 0}
          isLast={session.currentMovementIndex === routine.movements.length - 1}
          onPrevious={() => actions.previous()}
          onRepeat={() => {
            setSpeechError(false)
            void voiceServices.tts
              .speak(movement.instruction)
              .catch(() => setSpeechError(true))
          }}
          onTogglePause={() =>
            session.status === 'PAUSED' ? actions.resume() : actions.pause()
          }
          onNext={next}
        />
        <button ref={triggerRef} className="voice-cta" onClick={ask}>
          <span>
            <Icon name="mic" />
          </span>
          <strong>Preguntar a la IA</strong>
          <small>Haz una pausa y resuelve tu duda</small>
          <Icon name="arrowRight" />
        </button>
      </div>
      {panelOpen && (
        <AIQuestionPanel
          {...voice.state}
          onClose={closePanel}
          onRetry={() => void voice.begin()}
          onReplay={() => void voice.replay()}
          onContinue={continueRoutine}
        />
      )}
    </div>
  )
}

export function PracticePage() {
  const { routineId } = useParams()
  const routine = getRoutine(routineId)
  const { session, isLoading } = useSession()
  if (!routine)
    return (
      <div className="container empty-state">
        <h1>Rutina no encontrada</h1>
        <Link to="/rutinas">Ver rutinas</Link>
      </div>
    )
  if (isLoading)
    return <div className="container empty-state" role="status"><h1>Recuperando tu práctica…</h1></div>
  if (!session || session.routineId !== routine.id)
    return <Navigate to="/rutinas" replace />
  if (session.status === 'COMPLETED') return <Navigate to="/resumen" replace />
  return <PracticeExperience routine={routine} session={session} />
}
