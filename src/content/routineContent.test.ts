import { describe, expect, it } from 'vitest'
import { flattenRoutineMovements } from '../domain/routines'
import { routines } from './routineContent'

describe('routine content', () => {
  it('loads seven ordered routines with one group each and 32 movements', () => {
    expect(routines).toHaveLength(7)
    expect(routines.map((routine) => routine.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ])
    expect(routines.map((routine) => routine.name)).toEqual([
      'Primeros movimientos',
      'Brazos y coordinación',
      'Cambio de peso',
      'Pasos y movimientos de piernas',
      'Brazos y piernas',
      'Forma completa de Taichí',
      'Repaso de la forma',
    ])
    expect(routines.every((routine) => routine.exercises.length === 1)).toBe(
      true,
    )
    expect(
      routines.reduce(
        (total, routine) => total + flattenRoutineMovements(routine).length,
        0,
      ),
    ).toBe(32)
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
