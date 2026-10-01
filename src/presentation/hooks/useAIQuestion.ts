import { useCallback, useEffect, useRef, useState } from 'react'
import type { PracticeSession, Routine } from '../../domain/models'
import { flattenRoutineMovements } from '../../domain/routines'
import {
  runQuestionFlow,
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
  useEffect(
    () => () => {
      controller.current?.abort()
      voiceServices.stt.stop()
      voiceServices.tts.stop()
    },
    [],
  )
  const movement =
    flattenRoutineMovements(routine)[session.currentMovementIndex]?.movement

  const startFlow = useCallback(
    async (question?: string) => {
      if (!movement) return
      const normalizedQuestion = question?.trim()
      if (question !== undefined && !normalizedQuestion) return
      const run = ++generation.current
      controller.current?.abort()
      voiceServices.stt.stop()
      controller.current = new AbortController()
      voiceServices.tts.stop()
      setState({
        ...initialState,
        status: normalizedQuestion ? 'THINKING' : 'LISTENING',
        question: normalizedQuestion ?? '',
      })
      try {
        const context = {
          sessionId: session.id,
          routineId: routine.id,
          routineName: routine.name,
          difficulty: routine.difficulty,
          movementId: movement.id,
          movementName: movement.name,
          instruction: movement.instruction,
        }
        const onStatus = (status: AIInteractionStatus) => {
          if (generation.current === run)
            setState((previous) => ({ ...previous, status }))
        }
        const onAnswer = (response: {
          text: string
          requiresProfessionalAdvice?: boolean
        }) => {
          if (generation.current === run)
            setState((previous) => ({
              ...previous,
              answer: response.text,
              requiresProfessionalAdvice: Boolean(
                response.requiresProfessionalAdvice,
              ),
            }))
        }
        const result = normalizedQuestion
          ? await runTextQuestionFlow(
              context,
              normalizedQuestion,
              voiceServices,
              onStatus,
              onAnswer,
              controller.current.signal,
            )
          : await runQuestionFlow(
              context,
              voiceServices,
              onStatus,
              (transcript) => {
                if (generation.current === run)
                  setState((previous) => ({
                    ...previous,
                    question: transcript,
                  }))
              },
              onAnswer,
              controller.current.signal,
              (interim) => {
                if (generation.current === run)
                  setState((previous) => ({ ...previous, question: interim }))
              },
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

  const stopListening = () => {
    generation.current += 1
    controller.current?.abort()
    voiceServices.stt.stop()
    setState((previous) => ({ ...previous, status: 'IDLE', error: '' }))
  }

  const close = () => {
    generation.current += 1
    controller.current?.abort()
    voiceServices.stt.stop()
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

  return {
    state,
    submit: (question: string) => void startFlow(question),
    listen: () => void startFlow(),
    stopListening,
    close,
    replay,
  }
}
