import type { Exercise, Movement, Routine } from './models'

export interface RoutineMovement {
  exercise: Exercise
  movement: Movement
}

export const flattenRoutineMovements = (routine: Routine): RoutineMovement[] =>
  routine.exercises.flatMap((exercise) =>
    exercise.movements.map((movement) => ({ exercise, movement })),
  )
