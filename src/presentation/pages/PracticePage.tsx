import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { useSession } from '../../app/SessionProvider'
import { voiceServices } from '../../app/services'
import {
  playVoiceGuide,
  movementVoiceGuide,
  type VoiceGuidePosition,
} from '../../application/voiceGuide'
import {
  recordVoiceLatency,
  recordVoiceCaptureEvent,
  type VoiceCaptureEvent,
  recordVoiceRecognitionLatency,
  type VoiceRecognitionTiming,
} from '../../application/voiceLatency'
import {
  routineIntroduction,
  playCommandHelp,
  voiceCommandSections,
  commandConfirmations,
  type ConfirmedPracticeCommand,
  practiceGuidance,
  commandListIntroduction,
  type VoiceHelpTopic,
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
import { useCommandQueue } from '../hooks/useCommandQueue'
import { AIQuestionPanel } from '../components/AIQuestionPanel'
import {
  FinishConfirmation,
  finishConfirmationPrompt,
} from '../components/FinishConfirmation'
import { Icon } from '../components/Icon'
import { MovementVisual } from '../components/MovementVisual'
import { PracticeControls } from '../components/PracticeControls'
import { ProgressBar } from '../components/ProgressBar'
import { VoiceMicrophone } from '../components/VoiceMicrophone'
import { ProgressiveResponse } from '../components/ProgressiveResponse'
import { VoiceHelpPanel } from '../components/VoiceHelpPanel'
import { usePracticeGuidance } from '../hooks/usePracticeGuidance'

function formatTime(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

interface QueuedCommand {
  command: VoiceCommand
  timing?: VoiceRecognitionTiming
  detectedAt: number
}

const commandNames: Record<VoiceCommand, string> = {
  pause: 'Pausar',
  resume: 'Continuar',
  repeat: 'Repetir',
  next: 'Siguiente',
  previous: 'Anterior',
  finish: 'Finalizar',
  help: 'Ayuda',
  commands: 'Escuchar comandos',
  'push-to-talk': 'Pulsar para hablar',
  continuous: 'Escucha continua',
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
  const [helpView, setHelpView] = useState<'welcome' | 'commands' | null>(null)
  const [helpSpeaking, setHelpSpeaking] = useState(false)
  const [helpSection, setHelpSection] = useState('')
  const [helpPlayback, setHelpPlayback] = useState(0)
  const [helpTopic, setHelpTopic] = useState<VoiceHelpTopic | 'all' | null>(
    null,
  )
  const helpControllerRef = useRef<AbortController | null>(null)
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
  const [commandPending, setCommandPending] = useState(false)
  const [commandConfirmation, setCommandConfirmation] =
    useState<ConfirmedPracticeCommand | null>(null)
  const commandHighlightTimerRef = useRef<number | null>(null)
  const feedbackTimerRef = useRef<number | null>(null)
  const quickPauseRef = useRef<{
    timer: number
    captureId?: number
    resultIndex?: number
  } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const narrationRef = useRef<AbortController | null>(null)
  const pendingPausesRef = useRef(0)
  const repeatAfterCommandRef = useRef(false)
  const narrationPositionRef = useRef<
    | (VoiceGuidePosition & { movementId: string; advanceRequested?: boolean })
    | null
  >(null)
  const narrationCompleteRef = useRef<() => void>(() => {})
  const finishingRef = useRef(false)
  const finishRequestedRef = useRef(false)
  const introducedRef = useRef(false)
  const askingRef = useRef(false)
  const closingRef = useRef<Promise<void> | null>(null)
  const wakeDeadlineRef = useRef(0)
  const interimWakeRef = useRef(false)
  const wakeTimerRef = useRef<number | null>(null)
  const assistant = useAIQuestion(routine, session, actions.refresh)
  const {
    activeTip,
    audioError: guidanceAudioError,
    playTip,
    clearTip,
    skipTip,
  } = usePracticeGuidance()
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
    clearTip()
  }, [clearTip])

  const startNarration = useCallback(() => {
    if (
      !movement ||
      finishingRef.current ||
      finishRequestedRef.current ||
      pendingPausesRef.current > 0
    )
      return
    if (quickPauseRef.current) highlightCommand(null)
    stopNarration()
    if (narrationPositionRef.current?.movementId !== movement.id)
      narrationPositionRef.current = {
        movementId: movement.id,
        cueIndex: 0,
      }
    const position = narrationPositionRef.current
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
      await playTip('essentials', controller.signal)
      if (session.currentMovementIndex > 0)
        await playTip('navigation', controller.signal)
      if (session.currentMovementIndex === steps.length - 1)
        await playTip('finish', controller.signal)
      if (controller.signal.aborted) return
      await playVoiceGuide(
        movementVoiceGuide(movement),
        voiceServices.tts,
        controller.signal,
        (_cue, index) => setActiveCue({ movementId: movement.id, index }),
        position,
      )
      if (session.currentMovementIndex < steps.length - 1)
        await playTip('questions', controller.signal)
      if (!controller.signal.aborted) narrationCompleteRef.current()
    })().catch(() => {
      if (!controller.signal.aborted) {
        introducedRef.current = true
        setAnnouncement(null)
        setSpeechError(true)
      }
    })
  }, [
    movement,
    routine.name,
    stopNarration,
    highlightCommand,
    playTip,
    session.currentMovementIndex,
    steps.length,
  ])

  useEffect(() => {
    if (commandPending || helpView) return
    if (session.status !== 'PLAYING' && !repeatAfterCommandRef.current) return
    repeatAfterCommandRef.current = false
    startNarration()
    return stopNarration
  }, [session.status, startNarration, stopNarration, commandPending, helpView])

  useEffect(() => {
    if (helpView !== 'commands') return
    const controller = new AbortController()
    helpControllerRef.current = controller
    const playback =
      helpTopic === null
        ? voiceServices.tts.speak(commandListIntroduction)
        : playCommandHelp(
            voiceServices.tts,
            controller.signal,
            setHelpSection,
            helpTopic === 'all' ? undefined : helpTopic,
          )
    void playback
      .catch(() => {
        if (!controller.signal.aborted)
          setVoiceNotice(
            'El audio de ayuda no está disponible. Puedes leer los comandos aquí.',
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setHelpSpeaking(false)
          mic.resumeNow()
        }
      })
    return () => controller.abort()
  }, [helpView, helpPlayback, helpTopic])

  useEffect(() => {
    if (!finishRequested) return
    const controller = new AbortController()
    narrationRef.current = controller
    void voiceServices.tts
      .speak(finishConfirmationPrompt)
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setFinishPromptSpeaking(false)
      })
    return () => controller.abort()
  }, [finishRequested])

  useEffect(
    () => () => {
      helpControllerRef.current?.abort()
      voiceServices.tts.stop()
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

  const ask = (question?: string, timing?: VoiceRecognitionTiming) => {
    if (
      askingRef.current ||
      helpView ||
      panelOpen ||
      finishRequestedRef.current ||
      commandPendingRef.current
    ) {
      recordRouting(timing, 'phrase-ignored', 'question-busy')
      return
    }
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

  const executeCommand = async (
    { command, timing, detectedAt }: QueuedCommand,
    signal: AbortSignal,
  ) => {
    const latencyDetails = {
      captureId: timing?.captureId,
      resultIndex: timing?.resultIndex,
    }
    const actionStarted = performance.now()
    recordVoiceLatency(
      command,
      'queue-wait',
      detectedAt,
      'success',
      actionStarted,
      latencyDetails,
    )
    clearWake()
    stopNarration()
    highlightCommand(command, 0)
    showVoiceFeedback(`Detecté «${commandNames[command]}». Aplicando…`)
    try {
      if (command === 'pause' && session.status === 'PLAYING') {
        await actions.pause()
      } else if (command === 'resume') {
        if (helpView) {
          helpControllerRef.current?.abort()
          setHelpSpeaking(false)
          setHelpView(null)
        }
        if (session.status === 'PAUSED') await actions.resume()
      } else if (command === 'repeat') {
        repeatAfterCommandRef.current = true
      } else if (command === 'next') {
        if (session.currentMovementIndex === steps.length - 1) {
          requestFinish(true)
          return
        }
        stopNarration()
        await actions.next()
      } else if (command === 'finish') {
        requestFinish(true)
        return
      } else if (command === 'previous' && session.currentMovementIndex > 0) {
        await actions.previous()
      } else if (command === 'help') {
        helpControllerRef.current?.abort()
        setHelpSpeaking(false)
        setHelpView('welcome')
      } else if (command === 'commands') {
        helpControllerRef.current?.abort()
        setVoiceNotice('')
        setHelpSection('')
        setHelpTopic(null)
        setHelpSpeaking(true)
        setHelpPlayback((count) => count + 1)
        setHelpView('commands')
      } else if (command === 'push-to-talk' || command === 'continuous') {
        helpControllerRef.current?.abort()
        setHelpSpeaking(false)
        if (!mic.enabled) mic.toggle()
        mic.setMode(command)
      }
      if (signal.aborted) return
      if (
        command === 'repeat' ||
        command === 'next' ||
        command === 'previous'
      ) {
        narrationPositionRef.current = null
        setActiveCue(null)
      }
      recordVoiceLatency(
        command,
        'action',
        actionStarted,
        'success',
        performance.now(),
        latencyDetails,
      )
      highlightCommand(command)
      if (command !== 'commands') {
        const confirmedCommand = command as ConfirmedPracticeCommand
        const confirmation = commandConfirmations[confirmedCommand]
        mic.suspendNow()
        setCommandConfirmation(confirmedCommand)
        showVoiceFeedback(confirmation)
        try {
          await voiceServices.tts.speak(confirmation)
        } catch {
          if (!signal.aborted)
            setVoiceNotice(
              'No se pudo reproducir la confirmación de voz. Puedes leerla en pantalla.',
            )
        }
        if (signal.aborted) return
        showVoiceFeedback(confirmation, 5000)
        if (confirmedCommand === 'push-to-talk')
          await playTip('push-to-talk', signal)
        if (confirmedCommand === 'pause') await playTip('questions', signal)
        if (
          confirmedCommand === 'push-to-talk' ||
          confirmedCommand === 'continuous'
        )
          setHelpView(null)
        setCommandConfirmation(null)
        mic.resumeNow(
          confirmedCommand === 'push-to-talk' ||
            confirmedCommand === 'continuous'
            ? confirmedCommand
            : undefined,
        )
      }
    } catch (error) {
      if (!signal.aborted)
        recordVoiceLatency(
          command,
          'action',
          actionStarted,
          'error',
          performance.now(),
          latencyDetails,
        )
      throw error
    } finally {
      if (command === 'pause')
        pendingPausesRef.current = Math.max(0, pendingPausesRef.current - 1)
      if (!signal.aborted) setCommandConfirmation(null)
    }
  }

  const discardWaitingCommands = () => {
    for (const item of commandQueue.clearWaiting()) {
      if (item.command === 'pause') pendingPausesRef.current--
    }
  }

  const commandQueue = useCommandQueue(
    executeCommand,
    () => {
      discardWaitingCommands()
      highlightCommand(null)
      showVoiceFeedback('')
      setVoiceNotice(
        'No se pudo ejecutar el comando de voz. Inténtalo de nuevo. Se descartaron los comandos pendientes; repítelos.',
      )
      if (session.status === 'PLAYING') startNarration()
    },
    setCommandPending,
  )
  const commandPendingRef = commandQueue.pendingRef

  const runCommand = (
    command: VoiceCommand,
    timing?: VoiceRecognitionTiming,
  ) => {
    if (
      finishRequestedRef.current ||
      finishingRef.current ||
      panelOpen ||
      openingQuestion ||
      session.status === 'ASKING'
    )
      return
    const detectedAt = performance.now()
    if (timing) recordVoiceRecognitionLatency(command, timing)
    const wasPending = commandPendingRef.current
    // Reserve one extra slot for Pause when ordinary commands fill the queue.
    const accepted = commandQueue.enqueue(
      { command, timing, detectedAt },
      command === 'pause',
    )
    if (command === 'pause') {
      if (accepted) pendingPausesRef.current++
      const alreadyStopped =
        timing?.captureId !== undefined &&
        timing.resultIndex !== undefined &&
        quickPauseRef.current?.captureId === timing.captureId &&
        quickPauseRef.current.resultIndex === timing.resultIndex
      stopNarration()
      if (!alreadyStopped)
        recordVoiceLatency(
          command,
          'audio-stop',
          timing?.receivedAt ?? detectedAt,
          'success',
          performance.now(),
          {
            captureId: timing?.captureId,
            resultIndex: timing?.resultIndex,
            audioStopBasis: timing ? 'final' : 'button',
          },
        )
    }
    if (!accepted) {
      recordRouting(timing, 'queue-full', undefined, command)
      setVoiceNotice(
        'Hay demasiados comandos pendientes. Espera a que terminen y repite el comando.',
      )
      return
    }
    recordRouting(timing, 'command-queued', undefined, command)
    setVoiceNotice('')
    if (wasPending)
      showVoiceFeedback(
        `«${commandNames[command]}» en espera. Se aplicará en orden.`,
      )
  }

  const recordRouting = (
    timing: VoiceRecognitionTiming | undefined,
    name: 'command-queued' | 'queue-full' | 'phrase-ignored',
    reason?: VoiceCaptureEvent['reason'],
    command?: VoiceCommand,
  ) => {
    if (timing?.captureId === undefined) return
    recordVoiceCaptureEvent({
      name,
      reason,
      command,
      captureId: timing.captureId,
      captureKind: mic.mode,
      resultIndex: timing.resultIndex,
    })
  }

  const handleVoicePhrase = (
    transcript: string,
    timing?: VoiceRecognitionTiming,
  ) => {
    if (helpSpeaking || activeTip) return
    if (helpView) {
      const intent = parseVoiceIntent(transcript)
      if (
        intent?.type === 'command' &&
        ['help', 'commands', 'push-to-talk', 'continuous', 'resume'].includes(
          intent.command,
        )
      )
        runCommand(intent.command, timing)
      else if (parseFinishConfirmation(transcript) === 'cancel') closeHelp()
      return
    }
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
            ([
              'repeat',
              'next',
              'finish',
              'help',
              'commands',
              'push-to-talk',
              'continuous',
            ].includes(intent.command) ||
              (intent.command === 'previous' &&
                session.currentMovementIndex > 0)))
        if (session.status === 'PLAYING' && !takesOver) startNarration()
      }
    }
    if (finishRequestedRef.current) {
      if (finishPromptSpeaking || finishingRef.current) {
        recordRouting(timing, 'phrase-ignored', 'confirmation-prompt')
        return
      }
      const answer = parseFinishConfirmation(transcript)
      if (answer === 'confirm') confirmFinish(timing)
      else if (answer === 'cancel') cancelFinish()
      else recordRouting(timing, 'phrase-ignored', 'unmatched')
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
      } else recordRouting(timing, 'phrase-ignored', 'panel-open')
      return
    }
    if (session.status === 'ASKING') {
      recordRouting(timing, 'phrase-ignored', 'session-asking')
      return
    }
    const detectedIntent = parseVoiceIntent(transcript)
    if (detectedIntent?.type === 'command') {
      clearWake()
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
      ask(intent?.type === 'wake' ? intent.question : transcript.trim(), timing)
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
    if (!intent) {
      recordRouting(timing, 'phrase-ignored', 'unmatched')
      return
    }
    if (intent.type === 'command') {
      runCommand(intent.command, timing)
      return
    }
    if (intent.question) {
      interimWakeRef.current = false
      ask(intent.question, timing)
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
    if (finishRequestedRef.current || helpView || activeTip) return
    if (panelOpen || openingQuestion || session.status === 'ASKING') return
    if (announcement) return
    const intent = parseVoiceIntent(transcript)
    if (
      commandPendingRef.current &&
      !(intent?.type === 'command' && intent.command === 'pause')
    )
      return
    if (
      intent?.type === 'command' &&
      intent.command === 'pause' &&
      session.status === 'PLAYING' &&
      !wakeDeadlineRef.current &&
      !interimWakeRef.current
    ) {
      if (quickPauseRef.current) return
      const detectedAt = timing?.receivedAt ?? performance.now()
      stopNarration()
      highlightCommand('pause', 0)
      recordVoiceLatency(
        'pause',
        'audio-stop',
        detectedAt,
        'success',
        performance.now(),
        {
          captureId: timing?.captureId,
          resultIndex: timing?.resultIndex,
          audioStopBasis: 'interim',
        },
      )
      showVoiceFeedback('Detecté «Pausar». Confirmando…')
      quickPauseRef.current = {
        captureId: timing?.captureId,
        resultIndex: timing?.resultIndex,
        timer: window.setTimeout(() => {
          quickPauseRef.current = null
          highlightCommand(null)
          showVoiceFeedback(
            'No se confirmó la pausa. Puedes pulsar Pausar.',
            4000,
          )
          startNarration()
        }, 4000),
      }
      return
    }
    if (quickPauseRef.current) {
      startNarration()
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
    !commandConfirmation &&
      !activeTip &&
      !helpSpeaking &&
      (finishRequested
        ? !finishPromptSpeaking && !finishPending
        : !announcement &&
          ((!panelOpen && !openingQuestion && session.status !== 'ASKING') ||
            (panelOpen &&
              (assistant.state.status === 'COMPLETED' ||
                assistant.state.status === 'ERROR')))),
    handleVoicePhrase,
    handleInterimPhrase,
    (text) =>
      finishRequestedRef.current
        ? parseFinishConfirmation(text) !== null
        : parseVoiceIntent(text) !== null,
  )

  const requestFinish = (fromQueue = false) => {
    if (
      finishRequestedRef.current ||
      finishingRef.current ||
      (!fromQueue && commandPendingRef.current) ||
      panelOpen ||
      helpView ||
      openingQuestion ||
      session.status === 'ASKING'
    )
      return
    finishRequestedRef.current = true
    discardWaitingCommands()
    clearWake()
    stopNarration()
    mic.suspendNow()
    setFinishError('')
    setFinishRequested(true)
    setFinishPromptSpeaking(true)
  }

  const cancelFinish = () => {
    if (finishingRef.current) return
    stopNarration()
    finishRequestedRef.current = false
    setFinishRequested(false)
    setFinishPromptSpeaking(false)
    setFinishError('')
    if (session.status === 'PLAYING') startNarration()
  }

  const confirmFinish = (timing?: VoiceRecognitionTiming) => {
    if (!finishRequestedRef.current || finishingRef.current) return
    finishingRef.current = true
    setFinishPending(true)
    stopNarration()
    mic.suspendNow()
    const actionStarted = performance.now()
    const latencyDetails = {
      captureId: timing?.captureId,
      resultIndex: timing?.resultIndex,
    }
    void actions
      .complete()
      .then(() => {
        recordVoiceLatency(
          'finish',
          'action',
          actionStarted,
          'success',
          performance.now(),
          latencyDetails,
        )
        navigate('/resumen')
      })
      .catch(() => {
        recordVoiceLatency(
          'finish',
          'action',
          actionStarted,
          'error',
          performance.now(),
          latencyDetails,
        )
        finishingRef.current = false
        setFinishPromptSpeaking(false)
        setFinishError(
          'No se pudo finalizar. Puedes reintentar o cancelar para seguir practicando.',
        )
      })
      .finally(() => setFinishPending(false))
  }

  narrationCompleteRef.current = () => {
    if (
      session.status !== 'PLAYING' ||
      commandPendingRef.current ||
      panelOpen ||
      openingQuestion ||
      helpView ||
      finishRequestedRef.current ||
      finishingRef.current
    )
      return
    const position = narrationPositionRef.current
    if (!position || position.advanceRequested) return
    position.advanceRequested = true
    if (session.currentMovementIndex === steps.length - 1) requestFinish()
    else runCommand('next')
  }

  const explainCommands = (topic: VoiceHelpTopic | 'all' | null = null) => {
    if (
      panelOpen ||
      openingQuestion ||
      session.status === 'ASKING' ||
      finishRequestedRef.current ||
      finishingRef.current ||
      commandPendingRef.current
    )
      return
    highlightCommand('commands')
    clearWake()
    stopNarration()
    mic.suspendNow()
    helpControllerRef.current?.abort()
    setVoiceNotice('')
    showVoiceFeedback('')
    setHelpSection('')
    setHelpTopic(topic)
    setHelpSpeaking(true)
    setHelpPlayback((count) => count + 1)
    setHelpView('commands')
  }

  const closeHelp = () => {
    helpControllerRef.current?.abort()
    commandQueue.cancelAll()
    stopNarration()
    setCommandConfirmation(null)
    setHelpSpeaking(false)
    setHelpView(null)
    mic.resumeNow()
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
    setVoiceNotice('')
    await closePanel()
    const accepted = commandQueue.enqueue({
      command: 'resume',
      detectedAt: performance.now(),
    })
    if (!accepted)
      setVoiceNotice(
        'Hay demasiados comandos pendientes. Espera un momento e inténtalo de nuevo.',
      )
  }
  const abandon = () => {
    if (
      window.confirm(
        '¿Quieres abandonar esta práctica? Tu progreso actual se perderá.',
      )
    ) {
      commandQueue.cancelAll()
      stopNarration()
      actions.clear()
      navigate('/rutinas')
    }
  }
  return (
    <>
      <div
        inert={finishRequested || Boolean(helpView)}
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
          <VoiceMicrophone
            speaking={
              assistant.state.status === 'SPEAKING' ||
              Boolean(commandConfirmation) ||
              Boolean(activeTip)
            }
            listening={mic.status === 'listening'}
            enabled={mic.mode === 'push-to-talk' ? mic.capturing : mic.enabled}
            disabled={
              commandPending ||
              questionInProgress ||
              mic.status === 'unsupported'
            }
            label={
              mic.status === 'blocked'
                ? 'Reintentar micrófono'
                : mic.mode === 'push-to-talk' && mic.enabled
                  ? mic.capturing
                    ? 'Terminar escucha'
                    : 'Pulsar para hablar'
                  : mic.enabled
                    ? 'Apagar micrófono'
                    : 'Activar micrófono'
            }
            onClick={() => {
              if (mic.status === 'blocked') {
                mic.retry()
                return
              }
              if (mic.mode === 'push-to-talk' && mic.enabled) {
                mic.talk()
                return
              }
              if (quickPauseRef.current) startNarration()
              if (waitingForQuestion && session.status === 'PLAYING')
                startNarration()
              clearWake()
              mic.toggle()
            }}
          />
          <div
            className="voice-console-copy"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <div className="voice-console-meta">
              <span className="voice-console-eyebrow">
                {assistant.state.answer
                  ? 'RESPUESTA DE IA'
                  : micPresentation.eyebrow}
              </span>
              <button
                type="button"
                className="voice-help-trigger"
                aria-haspopup="dialog"
                aria-label="Ayuda"
                disabled={
                  commandPending || questionInProgress || finishRequested
                }
                onClick={() => runCommand('help')}
              >
                Ayuda <Icon name="menu" />
              </button>
            </div>
            <div className="voice-console-headline">
              <strong>
                {activeTip
                  ? practiceGuidance[activeTip].title
                  : assistant.state.status === 'SPEAKING'
                    ? 'IA respondiendo…'
                    : micPresentation.title}
              </strong>
              {voiceFeedback && !helpView && (
                <strong className="voice-command-feedback">
                  {voiceFeedback}
                </strong>
              )}
            </div>
            {activeTip ? (
              <div className="voice-guidance-tip">
                <p>{practiceGuidance[activeTip].text}</p>
                <button className="button button--quiet" onClick={skipTip}>
                  Omitir explicación
                </button>
              </div>
            ) : (
              !assistant.state.answer &&
              !voiceFeedback && <p>{micPresentation.detail}</p>
            )}
          </div>
          {assistant.state.answer && (
            <ProgressiveResponse
              text={assistant.state.answer}
              speaking={assistant.state.status === 'SPEAKING'}
            />
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
                <Icon name="sound" />{' '}
                {announcement && !activeTip
                  ? voiceCommandSections.includes(announcement)
                    ? 'COMANDOS DE VOZ'
                    : 'TU RUTINA'
                  : 'GUÍA DE ESTE MOVIMIENTO'}
              </span>
              <p>
                {(!activeTip && announcement) ||
                  cue?.text ||
                  movement.instruction}
              </p>
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
            {(speechError || guidanceAudioError) && (
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
      {helpView && (
        <VoiceHelpPanel
          view={helpView}
          speaking={helpSpeaking || commandPending}
          busy={commandPending}
          feedback={voiceFeedback}
          section={helpSection}
          error={voiceNotice}
          mode={mic.mode}
          listening={mic.status === 'listening'}
          capturing={mic.capturing}
          available={mic.available}
          onTalk={mic.talk}
          onClose={closeHelp}
          onCommands={() => explainCommands()}
          onTopic={explainCommands}
          onStop={() => {
            helpControllerRef.current?.abort()
            voiceServices.tts.stop()
            setHelpSpeaking(false)
          }}
          onMode={(mode) => runCommand(mode)}
          onContinue={() => runCommand('resume')}
        />
      )}
      {finishRequested && (
        <FinishConfirmation
          pending={finishPending}
          speaking={finishPromptSpeaking}
          listening={mic.status === 'listening'}
          error={finishError}
          onConfirm={() => confirmFinish()}
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
