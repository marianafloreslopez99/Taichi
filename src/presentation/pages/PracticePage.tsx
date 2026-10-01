import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { useSession } from '../../app/SessionProvider'
import { voiceServices } from '../../app/services'
import { playVoiceGuide } from '../../application/voiceGuide'
import {
  parseVoiceIntent,
  type VoiceCommand,
} from '../../application/voiceIntent'
import type { PracticeSession, Routine } from '../../domain/models'
import { flattenRoutineMovements } from '../../domain/routines'
import { api } from '../../infrastructure/api/client'
import { useAIQuestion } from '../hooks/useAIQuestion'
import { useContinuousVoiceControl } from '../hooks/useContinuousVoiceControl'
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
  const [panelOpen, setPanelOpen] = useState(session.status === 'ASKING')
  const [openingQuestion, setOpeningQuestion] = useState(false)
  const [speechError, setSpeechError] = useState(false)
  const [activeCue, setActiveCue] = useState<{
    movementId: string
    index: number
  } | null>(null)
  const [waitingForQuestion, setWaitingForQuestion] = useState(false)
  const [voiceNotice, setVoiceNotice] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const narrationRef = useRef<AbortController | null>(null)
  const commandPendingRef = useRef(false)
  const finishingRef = useRef(false)
  const askingRef = useRef(false)
  const closingRef = useRef<Promise<void> | null>(null)
  const wakeDeadlineRef = useRef(0)
  const interimWakeRef = useRef(false)
  const wakeTimerRef = useRef<number | null>(null)
  const assistant = useAIQuestion(routine, session, actions.refresh)
  const steps = flattenRoutineMovements(routine)
  const step = steps[session.currentMovementIndex]
  const movement = step?.movement
  const exercise = step?.exercise
  const cue =
    movement?.voiceGuide[
      activeCue?.movementId === movement.id ? activeCue.index : 0
    ]

  const stopNarration = useCallback(() => {
    narrationRef.current?.abort()
    narrationRef.current = null
    voiceServices.tts.stop()
  }, [])

  const startNarration = useCallback(() => {
    if (!movement || finishingRef.current) return
    stopNarration()
    const controller = new AbortController()
    narrationRef.current = controller
    setSpeechError(false)
    void playVoiceGuide(
      movement.voiceGuide,
      voiceServices.tts,
      controller.signal,
      (_cue, index) => setActiveCue({ movementId: movement.id, index }),
    ).catch(() => {
      if (!controller.signal.aborted) setSpeechError(true)
    })
  }, [movement, stopNarration])

  useEffect(() => {
    if (session.status !== 'PLAYING') return
    startNarration()
    return stopNarration
  }, [session.status, startNarration, stopNarration])

  useEffect(
    () => () => {
      if (wakeTimerRef.current !== null)
        window.clearTimeout(wakeTimerRef.current)
    },
    [],
  )

  const next = async () => {
    stopNarration()
    if (session.currentMovementIndex === steps.length - 1) {
      await actions.complete()
      navigate('/resumen')
    } else await actions.next()
  }

  const ask = (question?: string) => {
    if (askingRef.current || panelOpen) return
    askingRef.current = true
    clearWake()
    setOpeningQuestion(true)
    mic.suspendNow()
    stopNarration()
    setVoiceNotice('')
    void actions
      .ask()
      .then(() => {
        setOpeningQuestion(false)
        setPanelOpen(true)
        if (question) assistant.submit(question)
        else assistant.listen()
      })
      .catch(() => {
        askingRef.current = false
        setOpeningQuestion(false)
        setVoiceNotice('No se pudo abrir la pregunta. Inténtalo de nuevo.')
        mic.retry()
      })
  }

  const clearWake = () => {
    wakeDeadlineRef.current = 0
    interimWakeRef.current = false
    setWaitingForQuestion(false)
    if (wakeTimerRef.current !== null) {
      window.clearTimeout(wakeTimerRef.current)
      wakeTimerRef.current = null
    }
  }

  const runCommand = (command: VoiceCommand) => {
    if (commandPendingRef.current) return
    let task: Promise<void> | undefined
    if (command === 'pause' && session.status === 'PLAYING') {
      stopNarration()
      task = actions.pause()
    } else if (command === 'resume' && session.status === 'PAUSED') {
      task = actions.resume()
    } else if (command === 'repeat') {
      startNarration()
    } else if (command === 'next') {
      task = next()
    } else if (command === 'finish') {
      if (session.currentMovementIndex !== steps.length - 1) {
        setVoiceNotice('Puedes finalizar cuando llegues al último movimiento.')
        return
      }
      finishingRef.current = true
      clearWake()
      mic.suspendNow()
      stopNarration()
      task = actions
        .complete()
        .then(() => {
          navigate('/resumen')
        })
        .catch((error: unknown) => {
          finishingRef.current = false
          mic.retry()
          throw error
        })
    } else if (command === 'previous' && session.currentMovementIndex > 0) {
      stopNarration()
      task = actions.previous()
    }
    if (task) {
      commandPendingRef.current = true
      void task
        .catch(() => setVoiceNotice('No se pudo ejecutar el comando de voz.'))
        .finally(() => {
          commandPendingRef.current = false
        })
    }
  }

  const handleVoicePhrase = (transcript: string) => {
    if (panelOpen) {
      const intent = parseVoiceIntent(transcript)
      if (
        (assistant.state.status === 'COMPLETED' ||
          assistant.state.status === 'ERROR') &&
        intent?.type === 'command' &&
        intent.command === 'resume'
      ) {
        mic.suspendNow()
        void continueRoutine()
      }
      return
    }
    if (session.status === 'ASKING') return
    if (interimWakeRef.current && wakeTimerRef.current !== null) {
      window.clearTimeout(wakeTimerRef.current)
      wakeTimerRef.current = null
    }
    if (wakeDeadlineRef.current > Date.now()) {
      clearWake()
      const intent = parseVoiceIntent(transcript)
      ask(intent?.type === 'wake' ? intent.question : transcript.trim())
      return
    }
    if (wakeDeadlineRef.current) clearWake()
    const intent = parseVoiceIntent(transcript)
    if (interimWakeRef.current && intent?.type !== 'wake') {
      interimWakeRef.current = false
      setWaitingForQuestion(false)
      if (session.status === 'PLAYING' && intent?.type !== 'command')
        startNarration()
    }
    if (!intent) return
    if (intent.type === 'command') {
      runCommand(intent.command)
      return
    }
    if (intent.question) {
      interimWakeRef.current = false
      ask(intent.question)
      return
    }
    stopNarration()
    interimWakeRef.current = false
    wakeDeadlineRef.current = Date.now() + 10_000
    setWaitingForQuestion(true)
    wakeTimerRef.current = window.setTimeout(() => {
      clearWake()
      if (session.status === 'PLAYING') startNarration()
    }, 10_000)
  }

  const handleInterimPhrase = (transcript: string) => {
    if (panelOpen || openingQuestion || session.status === 'ASKING') return
    if (parseVoiceIntent(transcript)?.type !== 'wake') return
    if (interimWakeRef.current || wakeDeadlineRef.current) return
    interimWakeRef.current = true
    stopNarration()
    setWaitingForQuestion(true)
    wakeTimerRef.current = window.setTimeout(() => {
      clearWake()
      if (session.status === 'PLAYING') startNarration()
    }, 10_000)
  }

  const mic = useContinuousVoiceControl(
    (!panelOpen && !openingQuestion && session.status !== 'ASKING') ||
      (panelOpen &&
        (assistant.state.status === 'COMPLETED' ||
          assistant.state.status === 'ERROR')),
    handleVoicePhrase,
    handleInterimPhrase,
  )

  const questionInProgress =
    panelOpen || openingQuestion || session.status === 'ASKING'
  const micPresentation = questionInProgress
    ? {
        mode: 'question',
        eyebrow: 'PREGUNTA EN CURSO',
        title: 'La guía está detenida',
        detail: 'Tu práctica espera mientras IA responde.',
      }
    : waitingForQuestion
      ? {
          mode: 'wake',
          eyebrow: 'TE ESTAMOS ESCUCHANDO',
          title: 'Dinos tu pregunta',
          detail: 'La guía se detuvo. Habla con tranquilidad.',
        }
      : mic.status === 'listening'
        ? {
            mode: 'listening',
            eyebrow: 'CONTROL POR VOZ ACTIVO',
            title: 'Micrófono atento',
            detail: 'Di «Oye» y tu pregunta, o usa un comando de voz.',
          }
        : {
            mode: mic.status,
            eyebrow: 'CONTROL POR VOZ',
            title: {
              off: 'Micrófono apagado',
              starting: 'Activando micrófono…',
              reconnecting: 'Reconectando micrófono…',
              suspended: 'Micrófono en pausa',
              blocked: 'Micrófono no disponible',
              unsupported: 'Escucha continua no disponible',
            }[mic.status],
            detail: {
              off: 'Actívalo para controlar la práctica sin tocar la pantalla.',
              starting: 'Estamos preparando el control por voz.',
              reconnecting: 'Intentando recuperar la conexión de voz.',
              suspended: 'La escucha se reanudará al volver a la práctica.',
              blocked: 'Revisa el permiso del navegador e inténtalo de nuevo.',
              unsupported: 'Usa los controles y el botón para preguntar a IA.',
            }[mic.status],
          }

  if (!movement || !exercise)
    return (
      <div className="container empty-state">
        <h1>Movimiento no encontrado</h1>
        <Link to="/rutinas">Ver rutinas</Link>
      </div>
    )

  const closePanel = (): Promise<void> => {
    if (closingRef.current) return closingRef.current
    const closing = (async () => {
      assistant.close()
      try {
        await actions.closeQuestion()
      } catch {
        await actions.refresh().catch(() => undefined)
      } finally {
        setPanelOpen(false)
        askingRef.current = false
        triggerRef.current?.focus()
      }
    })()
    closingRef.current = closing
    void closing.then(() => {
      closingRef.current = null
    })
    return closing
  }
  const continueRoutine = async () => {
    await closePanel()
    try {
      await actions.resume()
    } catch {
      await actions
        .refresh()
        .catch(() =>
          setVoiceNotice('No se pudo reanudar la rutina. Inténtalo de nuevo.'),
        )
    }
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
    <div
      className={`practice-page container${panelOpen || openingQuestion || session.status === 'ASKING' ? ' practice-page--asking' : ''}`}
    >
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
      <section
        className={`voice-console voice-console--${micPresentation.mode}`}
        aria-label="Estado del control por voz"
      >
        <div className="voice-console-icon" aria-hidden="true">
          <Icon name="mic" />
          <span className="voice-console-signal">
            <i />
            <i />
            <i />
          </span>
        </div>
        <div className="voice-console-copy" role="status" aria-live="polite">
          <span className="voice-console-eyebrow">
            {micPresentation.eyebrow}
          </span>
          <strong>{micPresentation.title}</strong>
          <p>{micPresentation.detail}</p>
        </div>
        {!questionInProgress && mic.status !== 'unsupported' && (
          <div className="voice-console-actions">
            {mic.status === 'blocked' ? (
              <button className="voice-console-toggle" onClick={mic.retry}>
                Reintentar
              </button>
            ) : (
              <button
                className="voice-console-toggle"
                onClick={() => {
                  if (waitingForQuestion && session.status === 'PLAYING')
                    startNarration()
                  clearWake()
                  mic.toggle()
                }}
                aria-label={
                  mic.enabled ? 'Apagar micrófono' : 'Activar micrófono'
                }
              >
                {mic.enabled ? 'Apagar micrófono' : 'Activar micrófono'}
              </button>
            )}
            {mic.status === 'listening' && (
              <span className="voice-console-hint">
                Pausar · Repetir · Siguiente
                {session.currentMovementIndex === steps.length - 1
                  ? ' · Finalizar'
                  : ''}
              </span>
            )}
          </div>
        )}
      </section>
      <div className="practice-main">
        <div className="practice-art">
          <span className="practice-art-label">
            EJERCICIO {String(exercise.order).padStart(2, '0')} · MOVIMIENTO{' '}
            {String(movement.order).padStart(2, '0')}
          </span>
          <MovementVisual
            image={movement.image}
            cueImage={cue?.image}
            alt={cue?.text}
          />
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
            <p>{cue?.text ?? movement.instruction}</p>
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
          {voiceNotice && (
            <p className="notice notice--error" role="alert">
              {voiceNotice}
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
          onNext={() => void next()}
        />
        <button ref={triggerRef} className="voice-cta" onClick={() => ask()}>
          <span>
            <Icon name="spark" />
          </span>
          <strong>Preguntar a IA</strong>
          <small>Haz tu pregunta por voz</small>
          <Icon name="arrowRight" />
        </button>
      </div>
      {panelOpen && (
        <AIQuestionPanel
          {...assistant.state}
          onClose={() => void closePanel()}
          onSubmit={(question) => void assistant.submit(question)}
          onListen={assistant.listen}
          onStopListening={assistant.stopListening}
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
