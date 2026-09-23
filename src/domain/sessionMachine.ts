import type { AIQuestion, PracticeSession, Routine } from './models'
import { flattenRoutineMovements } from './routines'

export type SessionAction =
  | { type: 'START'; routine: Routine; id: string; at: number }
  | { type: 'HYDRATE'; session: PracticeSession }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'NEXT'; movementCount: number }
  | { type: 'PREVIOUS' }
  | { type: 'ASK' }
  | { type: 'CLOSE_QUESTION' }
  | { type: 'ADD_QUESTION'; question: AIQuestion }
  | { type: 'COMPLETE'; movementCount: number; at: number }
  | { type: 'TICK' }
  | { type: 'CLEAR' }

const canNavigate = (session: PracticeSession) =>
  session.status === 'PLAYING' || session.status === 'PAUSED'

export function sessionReducer(
  session: PracticeSession | null,
  action: SessionAction,
): PracticeSession | null {
  if (action.type === 'START') {
    if (flattenRoutineMovements(action.routine).length === 0) return session
    return {
      id: action.id,
      routineId: action.routine.id,
      currentMovementIndex: 0,
      status: 'PLAYING',
      startedAt: action.at,
      completedAt: null,
      elapsedSeconds: 0,
      questions: [],
    }
  }
  if (action.type === 'HYDRATE') return action.session
  if (action.type === 'CLEAR') return null
  if (!session) return null

  switch (action.type) {
    case 'PAUSE':
      return session.status === 'PLAYING'
        ? { ...session, status: 'PAUSED' }
        : session
    case 'RESUME':
      return session.status === 'PAUSED'
        ? { ...session, status: 'PLAYING' }
        : session
    case 'NEXT':
      return canNavigate(session) &&
        session.currentMovementIndex < action.movementCount - 1
        ? { ...session, currentMovementIndex: session.currentMovementIndex + 1 }
        : session
    case 'PREVIOUS':
      return canNavigate(session) && session.currentMovementIndex > 0
        ? { ...session, currentMovementIndex: session.currentMovementIndex - 1 }
        : session
    case 'ASK':
      return canNavigate(session) ? { ...session, status: 'ASKING' } : session
    case 'CLOSE_QUESTION':
      return session.status === 'ASKING'
        ? { ...session, status: 'PAUSED' }
        : session
    case 'ADD_QUESTION':
      return session.status === 'ASKING' &&
        action.question.sessionId === session.id
        ? { ...session, questions: [...session.questions, action.question] }
        : session
    case 'COMPLETE':
      return canNavigate(session) &&
        session.currentMovementIndex === action.movementCount - 1
        ? { ...session, status: 'COMPLETED', completedAt: action.at }
        : session
    case 'TICK':
      return session.status === 'PLAYING'
        ? { ...session, elapsedSeconds: session.elapsedSeconds + 1 }
        : session
  }
}
