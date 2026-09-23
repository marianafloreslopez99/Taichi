import type { Routine as DomainRoutine } from '../src/domain/models.js'
import type { Prisma } from '@prisma/client'

export const routineInclude = {
  exercises: {
    orderBy: { order: 'asc' as const },
    include: {
      exercise: {
        include: { movements: { orderBy: { order: 'asc' as const } } },
      },
    },
  },
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
    exercises: routine.exercises.map(({ exercise, order }) => ({
      id: exercise.id,
      order,
      name: exercise.name,
      description: exercise.description,
      difficulty: exercise.difficulty,
      estimatedMinutes: exercise.estimatedMinutes,
      category: exercise.category,
      movements: exercise.movements.map((movement) => {
        const voiceGuide = Array.isArray(movement.voiceGuide)
          ? movement.voiceGuide.flatMap((cue) => {
              if (
                typeof cue !== 'object' ||
                cue === null ||
                !('text' in cue) ||
                !('pauseAfterMs' in cue)
              )
                return []
              return [
                {
                  text: String(cue.text),
                  pauseAfterMs: Number(cue.pauseAfterMs),
                },
              ]
            })
          : []
        return {
          id: movement.id,
          order: movement.order,
          name: movement.name,
          description: movement.description,
          instruction: movement.instruction,
          durationSeconds: movement.durationSeconds,
          voiceGuide:
            voiceGuide.length > 0
              ? voiceGuide
              : [{ text: movement.instruction, pauseAfterMs: 0 }],
          tips: Array.isArray(movement.tips) ? movement.tips.map(String) : [],
          image: movement.image,
        }
      }),
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
