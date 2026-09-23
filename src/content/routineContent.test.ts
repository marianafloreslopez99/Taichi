import { describe, expect, it } from 'vitest'
import { flattenRoutineMovements } from '../domain/routines'
import { routines } from './routineContent'

describe('routine content', () => {
  it('loads one routine with seven ordered exercises and 32 movements', () => {
    expect(routines).toHaveLength(1)
    const routine = routines[0]!
    expect(routine.id).toBe('forma-basica-taichi')
    expect(routine.exercises).toHaveLength(7)
    expect(flattenRoutineMovements(routine)).toHaveLength(32)
    expect(routine.exercises.map((exercise) => exercise.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ])
  })

  it('keeps the detailed opening narration and image reference', () => {
    const opening = routines[0]!.exercises[0]!.movements[0]!
    expect(opening.id).toBe('pp-apertura')
    expect(opening.image).toBe('opening')
    expect(opening.voiceGuide).toHaveLength(5)
    expect(opening.voiceGuide[0]).toEqual({
      text: 'Coloca los pies separados y adopta una postura cómoda.',
      pauseAfterMs: 3000,
    })
  })
})
