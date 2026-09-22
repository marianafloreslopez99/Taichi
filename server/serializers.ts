import type { Routine as DomainRoutine } from '../src/domain/models.js'
import type { Prisma } from '@prisma/client'

export const routineInclude = {
  movements: { orderBy: { order: 'asc' as const } },
} satisfies Prisma.RoutineInclude

export type RoutineRecord = Prisma.RoutineGetPayload<{ include: typeof routineInclude }>

export function serializeRoutine(routine: RoutineRecord): DomainRoutine {
  return {
    id: routine.id,
    name: routine.name,
    description: routine.description,
    difficulty: routine.difficulty,
    estimatedMinutes: routine.estimatedMinutes,
    category: routine.category,
    movements: routine.movements.map((movement) => ({
      id: movement.id,
      order: movement.order,
      name: movement.name,
      description: movement.description,
      instruction: movement.instruction,
      durationSeconds: movement.durationSeconds,
      tips: Array.isArray(movement.tips) ? movement.tips.map(String) : [],
      visual: movement.visual as DomainRoutine['movements'][number]['visual'],
    })),
  }
}

export function serializeSession(
  session: {
    id: string
    routineId: string
    currentMovementIndex: number
    status: DomainRoutine extends never ? never : 'PLAYING' | 'PAUSED' | 'ASKING' | 'COMPLETED'
    startedAt: Date
    completedAt: Date | null
    elapsedSeconds: number
    questions: Array<{
      id: string
      sessionId: string
      movementId: string
      question: string
      answer: string
      createdAt: Date
    }>
  },
  elapsedSeconds = session.elapsedSeconds,
) {
  return {
    id: session.id,
    routineId: session.routineId,
    currentMovementIndex: session.currentMovementIndex,
    status: session.status,
    startedAt: session.startedAt.getTime(),
    completedAt: session.completedAt?.getTime() ?? null,
    elapsedSeconds,
    questions: session.questions.map((question) => ({
      id: question.id,
      sessionId: question.sessionId,
      movementId: question.movementId,
      question: question.question,
      answer: question.answer,
      createdAt: question.createdAt.getTime(),
    })),
  }
}
