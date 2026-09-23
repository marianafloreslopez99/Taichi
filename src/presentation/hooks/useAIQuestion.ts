import { useCallback, useRef, useState } from 'react'
import type { PracticeSession, Routine } from '../../domain/models'
import { flattenRoutineMovements } from '../../domain/routines'
import {
  runTextQuestionFlow,
  type AIInteractionStatus,
} from '../../application/questionFlow'
import { voiceServices } from '../../app/services'

interface AIQuestionState {
  status: AIInteractionStatus
  question: string
  answer: string
  error: string
  audioError: boolean
  requiresProfessionalAdvice: boolean
}

const initialState: AIQuestionState = {
  status: 'IDLE',
  question: '',
  answer: '',
  error: '',
  audioError: false,
  requiresProfessionalAdvice: false,
}

export function useAIQuestion(
  routine: Routine,
  session: PracticeSession,
  refreshSession: () => Promise<void>,
) {
  const [state, setState] = useState<AIQuestionState>(initialState)
  const generation = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const movement =
    flattenRoutineMovements(routine)[session.currentMovementIndex]?.movement

  const submit = useCallback(
    async (question: string) => {
      if (!movement) return
      const normalizedQuestion = question.trim()
      if (!normalizedQuestion) return
      const run = ++generation.current
      controller.current?.abort()
      controller.current = new AbortController()
      voiceServices.tts.stop()
      setState({
        ...initialState,
        status: 'THINKING',
        question: normalizedQuestion,
      })
      try {
        const result = await runTextQuestionFlow(
          {
            sessionId: session.id,
            routineId: routine.id,
            routineName: routine.name,
            difficulty: routine.difficulty,
            movementId: movement.id,
            movementName: movement.name,
            instruction: movement.instruction,
          },
          normalizedQuestion,
          voiceServices,
          (status) => {
            if (generation.current === run)
              setState((previous) => ({ ...previous, status }))
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
        await refreshSession().catch(() => undefined)
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
      } catch (error) {
        if (generation.current !== run) return
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState((previous) => ({
          ...previous,
          status: 'ERROR',
          error:
            error instanceof Error
              ? error.message
              : 'Ocurrió un error. Inténtalo de nuevo.',
        }))
      }
    },
    [routine, movement, session.id, refreshSession],
  )

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

  return { state, submit, close, replay }
}
