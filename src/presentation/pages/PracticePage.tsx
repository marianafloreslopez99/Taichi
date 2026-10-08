import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { useSession } from '../../app/SessionProvider'
import { voiceServices } from '../../app/services'
import { playVoiceGuide } from '../../application/voiceGuide'
import {
  recordVoiceLatency,
  type VoiceRecognitionTiming,
} from '../../application/voiceLatency'
import {
  routineIntroduction,
  playCommandHelp,
  voiceCommandSections,
} from '../../application/practiceInteraction'
import {
  parseVoiceIntent,
  parseFinishConfirmation,
  type VoiceCommand,
} from '../../application/voiceIntent'
import type { PracticeSession, Routine } from '../../domain/models'
import { flattenRoutineMovements } from '../../domain/routines'
import { api } from '../../infrastructure/api/client'
import { useAIQuestion } from '../hooks/useAIQuestion'
import { useContinuousVoiceControl } from '../hooks/useContinuousVoiceControl'
import { AIQuestionPanel } from '../components/AIQuestionPanel'
import {
  FinishConfirmation,
  finishConfirmationPrompt,
} from '../components/FinishConfirmation'
import { Icon } from '../components/Icon'
import { MovementVisual } from '../components/MovementVisual'
import { PracticeControls } from '../components/PracticeControls'
import { ProgressBar } from '../components/ProgressBar'
import { VoiceTalkButton } from '../components/VoiceTalkButton'

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
  const [announcement, setAnnouncement] = useState<string | null>(null)
  const [finishRequested, setFinishRequested] = useState(false)
  const [finishPromptSpeaking, setFinishPromptSpeaking] = useState(false)
  const [finishPending, setFinishPending] = useState(false)
  const [finishError, setFinishError] = useState('')
  const [activeCue, setActiveCue] = useState<{
    movementId: string
    index: number
  } | null>(null)
  const [waitingForQuestion, setWaitingForQuestion] = useState(false)
  const [voiceNotice, setVoiceNotice] = useState('')
  const [voiceFeedback, setVoiceFeedback] = useState('')
  const [activeCommand, setActiveCommand] = useState<VoiceCommand | null>(null)
  const commandHighlightTimerRef = useRef<number | null>(null)
  const feedbackTimerRef = useRef<number | null>(null)
  const quickPauseRef = useRef<{ cueIndex: number; timer: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const narrationRef = useRef<AbortController | null>(null)
  const commandPendingRef = useRef(false)
  const finishingRef = useRef(false)
  const finishRequestedRef = useRef(false)
  const finishCueRef = useRef(0)
  const introducedRef = useRef(false)
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

  const showVoiceFeedback = useCallback((text: string, clearAfter = 0) => {
    if (feedbackTimerRef.current !== null)
      window.clearTimeout(feedbackTimerRef.current)
    setVoiceFeedback(text)
    feedbackTimerRef.current = clearAfter
      ? window.setTimeout(() => setVoiceFeedback(''), clearAfter)
      : null
  }, [])

  const highlightCommand = useCallback(
    (command: VoiceCommand | null, duration = 1000) => {
      if (commandHighlightTimerRef.current !== null)
        window.clearTimeout(commandHighlightTimerRef.current)
      setActiveCommand(command)
      commandHighlightTimerRef.current =
        command && duration
          ? window.setTimeout(() => setActiveCommand(null), duration)
          : null
    },
    [],
  )

  const stopNarration = useCallback(() => {
    if (quickPauseRef.current) window.clearTimeout(quickPauseRef.current.timer)
    quickPauseRef.current = null
    narrationRef.current?.abort()
    narrationRef.current = null
    voiceServices.tts.stop()
    setAnnouncement(null)
  }, [])

  const startNarration = useCallback(
    (fromIndex = 0) => {
      if (!movement || finishingRef.current || finishRequestedRef.current)
        return
      if (quickPauseRef.current) highlightCommand(null)
      stopNarration()
      const controller = new AbortController()
      narrationRef.current = controller
      setSpeechError(false)
      void (async () => {
        if (!introducedRef.current) {
          const introduction = routineIntroduction(routine.name)
          setAnnouncement(introduction)
          await voiceServices.tts.speak(introduction)
          if (controller.signal.aborted) return
          introducedRef.current = true
          setAnnouncement(null)
        }
        await playVoiceGuide(
          movement.voiceGuide.slice(fromIndex),
          voiceServices.tts,
          controller.signal,
          (_cue, index) =>
            setActiveCue({ movementId: movement.id, index: fromIndex + index }),
        )
      })().catch(() => {
        if (!controller.signal.aborted) {
          introducedRef.current = true
          setAnnouncement(null)
          setSpeechError(true)
        }
      })
    },
    [movement, routine.name, stopNarration, highlightCommand],
  )

  useEffect(() => {
    if (session.status !== 'PLAYING') return
    startNarration()
    return stopNarration
  }, [session.status, startNarration, stopNarration])

  useEffect(
    () => () => {
      if (wakeTimerRef.current !== null)
        window.clearTimeout(wakeTimerRef.current)
      if (feedbackTimerRef.current !== null)
        window.clearTimeout(feedbackTimerRef.current)
      if (commandHighlightTimerRef.current !== null)
        window.clearTimeout(commandHighlightTimerRef.current)
      if (quickPauseRef.current)
        window.clearTimeout(quickPauseRef.current.timer)
    },
    [],
  )

  const next = async () => {
    if (session.currentMovementIndex === steps.length - 1) {
      requestFinish()
    } else {
      stopNarration()
      await actions.next()
    }
  }

  const ask = (question?: string) => {
    if (
      askingRef.current ||
      panelOpen ||
      finishRequestedRef.current ||
      commandPendingRef.current
    )
      return
    askingRef.current = true
    highlightCommand(null)
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

  const runCommand = (
    command: VoiceCommand,
    timing?: VoiceRecognitionTiming,
  ) => {
    if (commandPendingRef.current) return
    setVoiceNotice('')
    const detectedAt = performance.now()
    highlightCommand(command)
    if (timing)
      recordVoiceLatency(
        command,
        'recognition',
        Math.min(
          timing.speechEndedAt ?? timing.firstResultAt,
          timing.receivedAt,
        ),
        'success',
        timing.receivedAt,
      )
    const names: Record<VoiceCommand, string> = {
      pause: 'Pausar',
      resume: 'Continuar',
      repeat: 'Repetir',
      next: 'Siguiente',
      previous: 'Anterior',
      finish: 'Finalizar',
      help: 'Escuchar comandos',
    }
    showVoiceFeedback(`Detecté «${names[command]}».`, 3000)
    if (command === 'help') {
      explainCommands()
      return
    }
    const fromIndex =
      quickPauseRef.current?.cueIndex ??
      (activeCue?.movementId === movement?.id ? (activeCue?.index ?? 0) : 0)
    let task: Promise<void> | undefined
    if (command === 'pause' && session.status === 'PLAYING') {
      stopNarration()
      recordVoiceLatency(
        command,
        'audio-stop',
        timing?.receivedAt ?? detectedAt,
      )
      task = actions.pause()
    } else if (command === 'resume' && session.status === 'PAUSED') {
      task = actions.resume()
    } else if (command === 'repeat') {
      startNarration()
    } else if (command === 'next') {
      if (session.currentMovementIndex === steps.length - 1) {
        requestFinish()
        return
      }
      task = next()
    } else if (command === 'finish') {
      requestFinish()
      return
    } else if (command === 'previous' && session.currentMovementIndex > 0) {
      stopNarration()
      task = actions.previous()
    }
    if (task) {
      commandPendingRef.current = true
      highlightCommand(command, 0)
      showVoiceFeedback(`Detecté «${names[command]}». Aplicando…`)
      void task
        .then(() => {
          recordVoiceLatency(command, 'action', detectedAt)
          highlightCommand(command)
          showVoiceFeedback(`«${names[command]}» realizado.`, 3000)
        })
        .catch(() => {
          recordVoiceLatency(command, 'action', detectedAt, 'error')
          highlightCommand(null)
          showVoiceFeedback('')
          setVoiceNotice(
            'No se pudo ejecutar el comando de voz. Inténtalo de nuevo.',
          )
          if (session.status === 'PLAYING') startNarration(fromIndex)
        })
        .finally(() => {
          commandPendingRef.current = false
        })
    }
  }

  const handleVoicePhrase = (
    transcript: string,
    timing?: VoiceRecognitionTiming,
  ) => {
    const quickPause = quickPauseRef.current
    if (quickPause) {
      window.clearTimeout(quickPause.timer)
      const intent = parseVoiceIntent(transcript)
      if (intent?.type !== 'command' || intent.command !== 'pause') {
        quickPauseRef.current = null
        highlightCommand(null)
        showVoiceFeedback('La pausa no se confirmó. Retomando la guía.', 3000)
        const takesOver =
          intent?.type === 'wake' ||
          (intent?.type === 'command' &&
            (['repeat', 'next', 'finish', 'help'].includes(intent.command) ||
              (intent.command === 'previous' &&
                session.currentMovementIndex > 0)))
        if (session.status === 'PLAYING' && !takesOver)
          startNarration(quickPause.cueIndex)
      }
    }
    if (finishRequestedRef.current) {
      if (finishPromptSpeaking || finishingRef.current) return
      const answer = parseFinishConfirmation(transcript)
      if (answer === 'confirm') confirmFinish()
      else if (answer === 'cancel') cancelFinish()
      return
    }
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
    const detectedIntent = parseVoiceIntent(transcript)
    if (
      detectedIntent?.type === 'command' &&
      (detectedIntent.command === 'help' || detectedIntent.command === 'finish')
    ) {
      runCommand(detectedIntent.command, timing)
      return
    }
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
      runCommand(intent.command, timing)
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

  const handleInterimPhrase = (
    transcript: string,
    timing?: VoiceRecognitionTiming,
  ) => {
    if (finishRequestedRef.current) return
    if (panelOpen || openingQuestion || session.status === 'ASKING') return
    if (commandPendingRef.current || announcement) return
    const intent = parseVoiceIntent(transcript)
    if (
      intent?.type === 'command' &&
      intent.command === 'pause' &&
      session.status === 'PLAYING' &&
      !wakeDeadlineRef.current &&
      !interimWakeRef.current
    ) {
      if (quickPauseRef.current) return
      const cueIndex =
        activeCue?.movementId === movement?.id ? (activeCue?.index ?? 0) : 0
      const detectedAt = timing?.receivedAt ?? performance.now()
      stopNarration()
      highlightCommand('pause', 0)
      recordVoiceLatency('pause', 'audio-stop', detectedAt)
      showVoiceFeedback('Detecté «Pausar». Confirmando…')
      quickPauseRef.current = {
        cueIndex,
        timer: window.setTimeout(() => {
          quickPauseRef.current = null
          highlightCommand(null)
          showVoiceFeedback(
            'No se confirmó la pausa. Puedes pulsar Pausar.',
            4000,
          )
          startNarration(cueIndex)
        }, 4000),
      }
      return
    }
    if (quickPauseRef.current) {
      const cueIndex = quickPauseRef.current.cueIndex
      startNarration(cueIndex)
      showVoiceFeedback('La pausa no se confirmó. Retomando la guía.', 3000)
    }
    if (intent?.type !== 'wake') return
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
    finishRequested
      ? !finishPromptSpeaking && !finishPending
      : !announcement &&
          ((!panelOpen && !openingQuestion && session.status !== 'ASKING') ||
            (panelOpen &&
              (assistant.state.status === 'COMPLETED' ||
                assistant.state.status === 'ERROR'))),
    handleVoicePhrase,
    handleInterimPhrase,
  )

  const requestFinish = () => {
    if (
      finishRequestedRef.current ||
      finishingRef.current ||
      commandPendingRef.current ||
      panelOpen ||
      openingQuestion ||
      session.status === 'ASKING'
    )
      return
    finishRequestedRef.current = true
    finishCueRef.current =
      activeCue && activeCue.movementId === movement?.id ? activeCue.index : 0
    clearWake()
    stopNarration()
    mic.suspendNow()
    setFinishError('')
    setFinishRequested(true)
    setFinishPromptSpeaking(true)
    const controller = new AbortController()
    narrationRef.current = controller
    void voiceServices.tts
      .speak(finishConfirmationPrompt)
      .then(() => {
        if (!controller.signal.aborted) setFinishPromptSpeaking(false)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFinishPromptSpeaking(false)
      })
  }

  const cancelFinish = () => {
    if (finishingRef.current) return
    stopNarration()
    finishRequestedRef.current = false
    setFinishRequested(false)
    setFinishPromptSpeaking(false)
    setFinishError('')
    if (session.status === 'PLAYING') startNarration(finishCueRef.current)
  }

  const confirmFinish = () => {
    if (!finishRequestedRef.current || finishingRef.current) return
    finishingRef.current = true
    setFinishPending(true)
    stopNarration()
    mic.suspendNow()
    const actionStarted = performance.now()
    void actions
      .complete()
      .then(() => {
        recordVoiceLatency('finish', 'action', actionStarted)
        navigate('/resumen')
      })
      .catch(() => {
        recordVoiceLatency('finish', 'action', actionStarted, 'error')
        finishingRef.current = false
        setFinishPromptSpeaking(false)
        setFinishError(
          'No se pudo finalizar. Puedes reintentar o cancelar para seguir practicando.',
        )
      })
      .finally(() => setFinishPending(false))
  }

  const explainCommands = () => {
    if (
      panelOpen ||
      openingQuestion ||
      session.status === 'ASKING' ||
      finishRequestedRef.current ||
      finishingRef.current ||
      commandPendingRef.current
    )
      return
    highlightCommand('help')
    const fromIndex =
      activeCue && activeCue.movementId === movement?.id ? activeCue.index : 0
    const wasPlaying = session.status === 'PLAYING'
    clearWake()
    stopNarration()
    mic.suspendNow()
    introducedRef.current = true
    const controller = new AbortController()
    narrationRef.current = controller
    setSpeechError(false)
    void playCommandHelp(voiceServices.tts, controller.signal, setAnnouncement)
      .then(() => {
        if (controller.signal.aborted) return
        setAnnouncement(null)
        if (wasPlaying) startNarration(fromIndex)
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setAnnouncement(null)
          setSpeechError(true)
        }
      })
  }

  const questionInProgress =
    panelOpen || openingQuestion || session.status === 'ASKING'
  const micPresentation = announcement
    ? {
        mode: 'suspended',
        eyebrow: 'TU GUÍA DE VOZ',
        title: voiceCommandSections.includes(announcement)
          ? 'Estos son tus comandos'
          : 'La rutina que vas a realizar',
        detail: mic.enabled
          ? 'Escucha la guía. El micrófono se activará al terminar.'
          : 'Escucha la guía. Puedes activar el micrófono para usar los comandos.',
      }
    : questionInProgress
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
              detail:
                mic.mode === 'push-to-talk'
                  ? 'Di tu comando o «Oye» seguido de tu pregunta. La escucha se cerrará al terminar.'
                  : 'Di «Oye» y tu pregunta, o usa un comando de voz.',
            }
          : {
              mode: mic.status,
              eyebrow: 'CONTROL POR VOZ',
              title: {
                off: 'Micrófono apagado',
                ready: 'Pulsa para hablar',
                processing: 'Procesando tu voz…',
                starting: 'Activando micrófono…',
                reconnecting: 'Reconectando micrófono…',
                suspended: 'Micrófono en pausa',
                blocked: 'Micrófono no disponible',
                unsupported: 'Escucha continua no disponible',
              }[mic.status],
              detail: {
                off: 'Actívalo para controlar la práctica sin tocar la pantalla.',
                ready:
                  'Pulsa el botón y di un comando o «Oye» seguido de tu pregunta.',
                processing: 'Esperando la transcripción final de tu comando.',
                starting: 'Estamos preparando el control por voz.',
                reconnecting: 'Intentando recuperar la conexión de voz.',
                suspended: 'La escucha se reanudará al volver a la práctica.',
                blocked:
                  'Revisa el permiso del navegador e inténtalo de nuevo.',
                unsupported:
                  'Usa los controles y el botón para preguntar a IA.',
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
    <>
      <div
        inert={finishRequested}
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
              <label className="voice-mode">
                Modo de voz
                <select
                  aria-label="Modo de voz"
                  value={mic.mode}
                  onChange={(event) => {
                    if (quickPauseRef.current)
                      startNarration(quickPauseRef.current.cueIndex)
                    if (waitingForQuestion && session.status === 'PLAYING')
                      startNarration()
                    clearWake()
                    mic.setMode(
                      event.target.value as 'continuous' | 'push-to-talk',
                    )
                  }}
                >
                  <option value="continuous">Escucha continua</option>
                  <option value="push-to-talk">Pulsar para hablar</option>
                </select>
              </label>
              <div className="voice-console-buttons">
                {mic.status === 'blocked' ? (
                  <button className="voice-console-toggle" onClick={mic.retry}>
                    Reintentar
                  </button>
                ) : (
                  <button
                    className="voice-console-toggle"
                    onClick={() => {
                      if (quickPauseRef.current)
                        startNarration(quickPauseRef.current.cueIndex)
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
                <button
                  className={`voice-console-toggle${activeCommand === 'help' ? ' voice-console-toggle--active' : ''}`}
                  onClick={explainCommands}
                >
                  Escuchar comandos
                </button>
                {mic.mode === 'push-to-talk' && (
                  <VoiceTalkButton
                    available={mic.available}
                    capturing={mic.capturing}
                    onTalk={mic.talk}
                  />
                )}
              </div>
              {mic.status === 'listening' && (
                <span className="voice-console-hint">
                  Pausar · Repetir · Siguiente · Finalizar
                </span>
              )}
            </div>
          )}
        </section>
        {!questionInProgress && (
          <div className="voice-help">
            <p>
              {mic.mode === 'push-to-talk' ? 'Pulsa para hablar y di' : 'Di'}{' '}
              «¿Qué acciones puedo realizar?» para recordar los comandos.
            </p>
            <details>
              <summary>Ver comandos</summary>
              <ul>
                {voiceCommandSections.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </details>
          </div>
        )}
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
                <Icon name="sound" />{' '}
                {announcement
                  ? voiceCommandSections.includes(announcement)
                    ? 'COMANDOS DE VOZ'
                    : 'TU RUTINA'
                  : 'GUÍA DE ESTE MOVIMIENTO'}
              </span>
              <p>{announcement ?? cue?.text ?? movement.instruction}</p>
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
            <p
              className="voice-command-feedback"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {voiceFeedback}
            </p>
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
            activeCommand={activeCommand}
            onPrevious={() => {
              runCommand('previous')
            }}
            onRepeat={() => runCommand('repeat')}
            onTogglePause={() => {
              runCommand(session.status === 'PAUSED' ? 'resume' : 'pause')
            }}
            onNext={() => runCommand('next')}
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
            talkControl={
              mic.mode === 'push-to-talk'
                ? {
                    available: mic.available,
                    capturing: mic.capturing,
                    onTalk: mic.talk,
                  }
                : undefined
            }
          />
        )}
      </div>
      {finishRequested && (
        <FinishConfirmation
          pending={finishPending}
          speaking={finishPromptSpeaking}
          listening={mic.status === 'listening'}
          error={finishError}
          onConfirm={confirmFinish}
          onCancel={cancelFinish}
          talkControl={
            mic.mode === 'push-to-talk'
              ? {
                  available:
                    mic.available && !finishPromptSpeaking && !finishPending,
                  capturing: mic.capturing,
                  onTalk: mic.talk,
                }
              : undefined
          }
        />
      )}
    </>
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
  return (
    <PracticeExperience key={session.id} routine={routine} session={session} />
  )
}
