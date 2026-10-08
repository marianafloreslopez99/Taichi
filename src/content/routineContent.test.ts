/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { flattenRoutineMovements } from '../domain/routines'
import { routineContentSchema, routines } from './routineContent'

describe('routine content', () => {
  it('provides an existing image in its own routine folder for every narrated cue', () => {
    let totalCues = 0
    for (const routine of routines) {
      for (const { movement } of flattenRoutineMovements(routine)) {
        expect(
          existsSync(
            resolve('public/img/movimientos', `${movement.image}.png`),
          ),
        ).toBe(true)
        for (const cue of movement.voiceGuide) {
          expect(cue.image).toMatch(new RegExp(`^j${routine.order}/`))
          expect(existsSync(resolve('public/img/routines', cue.image!))).toBe(
            true,
          )
          totalCues++
        }
      }
    }
    expect(totalCues).toBe(212)
  })

  it('rejects traversal paths and incomplete image filenames', () => {
    for (const image of ['../1.jpg', 'j4/../1.jpg', '.jpg', '3jpg', '/1.jpg']) {
      const routine = structuredClone(routines[0]!)
      routine.exercises[0]!.movements[0]!.voiceGuide[0]!.image = image
      expect(routineContentSchema.safeParse(routine).success).toBe(false)
    }
  })
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
    expect(opening.image).toBe('pp-apertura')
    expect(opening.voiceGuide).toHaveLength(5)
    expect(opening.voiceGuide[0]).toEqual({
      text: 'Coloca los pies separados y adopta una postura cómoda.',
      pauseAfterMs: 3000,
      image: 'j1/1.jpg',
    })
  })
})
