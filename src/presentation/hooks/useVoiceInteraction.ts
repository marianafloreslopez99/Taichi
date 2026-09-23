import { useCallback, useRef, useState } from 'react'
import type { Routine, PracticeSession, AIQuestion } from '../../domain/models'
import { flattenRoutineMovements } from '../../domain/routines'
import {
  runQuestionFlow,
  type AIInteractionStatus,
} from '../../application/questionFlow'
import { voiceServices } from '../../app/services'
import { delay, MOCK_TIMING } from '../../infrastructure/ai/mockTiming'

interface VoiceState {
  status: AIInteractionStatus
  question: string
  answer: string
  error: string
  audioError: boolean
  requiresProfessionalAdvice: boolean
}

const initialState: VoiceState = {
  status: 'IDLE',
  question: '',
  answer: '',
  error: '',
  audioError: false,
  requiresProfessionalAdvice: false,
}

export function useVoiceInteraction(
  routine: Routine,
  session: PracticeSession,
  addQuestion: (question: AIQuestion) => void,
) {
  const [state, setState] = useState<VoiceState>(initialState)
  const generation = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const movement =
    flattenRoutineMovements(routine)[session.currentMovementIndex]?.movement

  const begin = useCallback(async () => {
    if (!movement) return
    const run = ++generation.current
    controller.current?.abort()
    controller.current = new AbortController()
    voiceServices.tts.stop()
    setState(initialState)
    try {
      const result = await runQuestionFlow(
        {
          routineId: routine.id,
          routineName: routine.name,
          difficulty: routine.difficulty,
          movementId: movement.id,
          movementName: movement.name,
          instruction: movement.instruction,
        },
        voiceServices,
        (status) => {
          if (generation.current === run)
            setState((previous) => ({ ...previous, status }))
        },
        async () => {
          await delay(MOCK_TIMING.listening)
          return new Blob()
        },
        (question) => {
          if (generation.current === run)
            setState((previous) => ({ ...previous, question }))
        },
        (response) => {
          if (generation.current === run)
            setState((previous) => ({
              ...previous,
              answer: response.text,
              requiresProfessionalAdvice: Boolean(
                response.requiresProfessionalAdvice,
              ),
            }))
        },
        controller.current.signal,
      )
      if (generation.current !== run) return
      setState({
        status: 'COMPLETED',
        question: result.question,
        answer: result.response.text,
        error: '',
        audioError: result.audioError,
        requiresProfessionalAdvice: Boolean(
          result.response.requiresProfessionalAdvice,
        ),
      })
      addQuestion({
        id: crypto.randomUUID(),
        sessionId: session.id,
        movementId: movement.id,
        question: result.question,
        answer: result.response.text,
        createdAt: Date.now(),
      })
    } catch (error) {
      if (generation.current !== run) return
      setState((previous) => ({
        ...previous,
        status: 'ERROR',
        error:
          error instanceof Error
            ? error.message
            : 'Ocurrió un error. Inténtalo de nuevo.',
      }))
    }
  }, [routine, movement, session.id, addQuestion])

  const close = () => {
    generation.current += 1
    controller.current?.abort()
    voiceServices.tts.stop()
    setState(initialState)
  }

  const replay = async () => {
    if (!state.answer) return
    setState((previous) => ({
      ...previous,
      status: 'SPEAKING',
      audioError: false,
    }))
    try {
      await voiceServices.tts.speak(state.answer)
      setState((previous) => ({ ...previous, status: 'COMPLETED' }))
    } catch {
      setState((previous) => ({
        ...previous,
        status: 'COMPLETED',
        audioError: true,
      }))
    }
  }

  return { state, begin, close, replay }
}
