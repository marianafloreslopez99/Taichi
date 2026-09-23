import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { useSession } from '../../app/SessionProvider'
import { voiceServices } from '../../app/services'
import { playVoiceGuide } from '../../application/voiceGuide'
import type { PracticeSession, Routine } from '../../domain/models'
import { flattenRoutineMovements } from '../../domain/routines'
import { api } from '../../infrastructure/api/client'
import { useAIQuestion } from '../hooks/useAIQuestion'
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
  const narrationRef = useRef<AbortController | null>(null)
  const assistant = useAIQuestion(routine, session, actions.refresh)
  const steps = flattenRoutineMovements(routine)
  const step = steps[session.currentMovementIndex]
  const movement = step?.movement
  const exercise = step?.exercise

  const stopNarration = useCallback(() => {
    narrationRef.current?.abort()
    narrationRef.current = null
    voiceServices.tts.stop()
  }, [])

  const startNarration = useCallback(() => {
    if (!movement) return
    stopNarration()
    const controller = new AbortController()
    narrationRef.current = controller
    setSpeechError(false)
    void playVoiceGuide(
      movement.voiceGuide,
      voiceServices.tts,
      controller.signal,
    ).catch(() => {
      if (!controller.signal.aborted) setSpeechError(true)
    })
  }, [movement, stopNarration])

  useEffect(() => {
    if (session.status !== 'PLAYING') return
    startNarration()
    return stopNarration
  }, [session.status, startNarration, stopNarration])

  if (!movement || !exercise)
    return (
      <div className="container empty-state">
        <h1>Movimiento no encontrado</h1>
        <Link to="/rutinas">Ver rutinas</Link>
      </div>
    )

  const next = () => {
    stopNarration()
    if (session.currentMovementIndex === steps.length - 1) {
      void actions.complete().then(() => navigate('/resumen'))
    } else void actions.next()
  }
  const ask = () => {
    stopNarration()
    void actions.ask().then(() => {
      setPanelOpen(true)
    })
  }
  const closePanel = async () => {
    assistant.close()
    await actions.closeQuestion()
    setPanelOpen(false)
    triggerRef.current?.focus()
  }
  const continueRoutine = async () => {
    await closePanel()
    await actions.resume()
  }
  const abandon = () => {
    if (
      window.confirm(
        '¿Quieres abandonar esta práctica? Tu progreso actual se perderá.',
      )
    ) {
      stopNarration()
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
        total={steps.length}
      />
      <div className="practice-main">
        <div className="practice-art">
          <span className="practice-art-label">
            EJERCICIO {String(exercise.order).padStart(2, '0')} · MOVIMIENTO{' '}
            {String(movement.order).padStart(2, '0')}
          </span>
          <MovementVisual image={movement.image} />
          <span className="practice-art-note">Muévete a tu ritmo</span>
        </div>
        <div className="practice-content" key={movement.id}>
          <span className="eyebrow">
            {exercise.name} · PASO{' '}
            {String(session.currentMovementIndex + 1).padStart(2, '0')} DE{' '}
            {String(steps.length).padStart(2, '0')}
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
          isLast={session.currentMovementIndex === steps.length - 1}
          onPrevious={() => {
            stopNarration()
            void actions.previous()
          }}
          onRepeat={startNarration}
          onTogglePause={() => {
            if (session.status === 'PAUSED') void actions.resume()
            else {
              stopNarration()
              void actions.pause()
            }
          }}
          onNext={next}
        />
        <button ref={triggerRef} className="voice-cta" onClick={ask}>
          <span>
            <Icon name="spark" />
          </span>
          <strong>Preguntar a Gemini</strong>
          <small>Escribe una duda sobre este movimiento</small>
          <Icon name="arrowRight" />
        </button>
      </div>
      {panelOpen && (
        <AIQuestionPanel
          {...assistant.state}
          onClose={() => void closePanel()}
          onSubmit={(question) => void assistant.submit(question)}
          onReplay={() => void assistant.replay()}
          onContinue={() => void continueRoutine()}
        />
      )}
    </div>
  )
}

export function PracticePage() {
  const { routineId } = useParams()
  const routineQuery = useQuery({
    queryKey: ['routine', routineId],
    queryFn: () => api.getRoutine(routineId!),
    enabled: Boolean(routineId),
  })
  const routine = routineQuery.data
  const { session, isLoading } = useSession()
  if (isLoading || routineQuery.isLoading)
    return (
      <div className="container empty-state" role="status">
        <h1>Recuperando tu práctica…</h1>
      </div>
    )
  if (!routine || routineQuery.isError)
    return (
      <div className="container empty-state">
        <h1>Rutina no encontrada</h1>
        <Link to="/rutinas">Ver rutinas</Link>
      </div>
    )
  if (!session || session.routineId !== routine.id)
    return <Navigate to="/rutinas" replace />
  if (session.status === 'COMPLETED') return <Navigate to="/resumen" replace />
  return <PracticeExperience routine={routine} session={session} />
}
