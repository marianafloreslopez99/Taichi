import { z } from 'zod'
import type { Routine } from '../domain/models'
import primerosMovimientos from './routines/01-primeros-movimientos.json'
import brazosCoordinacion from './routines/02-brazos-coordinacion.json'
import cambioPeso from './routines/03-cambio-peso.json'
import pasosMovimientosPiernas from './routines/04-pasos-movimientos-piernas.json'
import brazosPiernas from './routines/05-brazos-piernas.json'
import formaCompletaTaichi from './routines/06-forma-completa-taichi.json'
import repasoForma from './routines/07-repaso-forma.json'

const id = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const text = z.string().trim().min(1)

const voiceCueSchema = z.strictObject({
  text,
  pauseAfterMs: z.number().int().min(0).max(30_000),
})

const movementSchema = z.strictObject({
  id,
  order: z.number().int().positive(),
  name: text,
  description: text,
  instruction: text,
  durationSeconds: z.number().int().positive().max(3_600),
  voiceGuide: z.array(voiceCueSchema).nonempty(),
  image: id,
  tips: z.array(text).nonempty(),
})

const exerciseSchema = z
  .strictObject({
    id,
    order: z.number().int().positive(),
    name: text,
    description: text,
    difficulty: z.enum(['Principiante', 'Intermedio']),
    estimatedMinutes: z.number().int().positive(),
    category: text,
    movements: z.array(movementSchema).nonempty(),
  })
  .superRefine((exercise, context) => {
    exercise.movements.forEach((movement, index) => {
      if (movement.order !== index + 1) {
        context.addIssue({
          code: 'custom',
          path: ['movements', index, 'order'],
          message: 'Los movimientos deben tener órdenes consecutivos desde 1.',
        })
      }
    })
    const minutes = Math.round(
      exercise.movements.reduce(
        (total, movement) => total + movement.durationSeconds,
        0,
      ) / 60,
    )
    if (exercise.estimatedMinutes !== minutes) {
      context.addIssue({
        code: 'custom',
        path: ['estimatedMinutes'],
        message: `La duración debe ser ${minutes} minutos según sus movimientos.`,
      })
    }
  })

export const routineContentSchema = z
  .strictObject({
    id,
    order: z.number().int().positive(),
    name: text,
    description: text,
    difficulty: z.enum(['Principiante', 'Intermedio']),
    estimatedMinutes: z.number().int().positive(),
    category: text,
    exercises: z.array(exerciseSchema).nonempty(),
  })
  .superRefine((routine, context) => {
    const movementIds = new Set<string>()
    routine.exercises.forEach((exercise, exerciseIndex) => {
      if (exercise.order !== exerciseIndex + 1) {
        context.addIssue({
          code: 'custom',
          path: ['exercises', exerciseIndex, 'order'],
          message: 'Los ejercicios deben tener órdenes consecutivos desde 1.',
        })
      }
      exercise.movements.forEach((movement, movementIndex) => {
        if (movementIds.has(movement.id)) {
          context.addIssue({
            code: 'custom',
            path: [
              'exercises',
              exerciseIndex,
              'movements',
              movementIndex,
              'id',
            ],
            message: 'El id del movimiento debe ser único dentro de la rutina.',
          })
        }
        movementIds.add(movement.id)
      })
    })
    const minutes = routine.exercises.reduce(
      (total, exercise) => total + exercise.estimatedMinutes,
      0,
    )
    if (routine.estimatedMinutes !== minutes) {
      context.addIssue({
        code: 'custom',
        path: ['estimatedMinutes'],
        message: `La duración debe ser ${minutes} minutos según sus ejercicios.`,
      })
    }
  })

const routineCollectionSchema = z
  .array(routineContentSchema)
  .nonempty()
  .superRefine((routines, context) => {
    const routineIds = new Set<string>()
    const movementIds = new Set<string>()
    routines.forEach((routine, routineIndex) => {
      if (routine.order !== routineIndex + 1) {
        context.addIssue({
          code: 'custom',
          path: [routineIndex, 'order'],
          message: 'Las rutinas deben tener órdenes consecutivos desde 1.',
        })
      }
      if (routineIds.has(routine.id)) {
        context.addIssue({
          code: 'custom',
          path: [routineIndex, 'id'],
          message: 'El id de la rutina debe ser único.',
        })
      }
      routineIds.add(routine.id)
      routine.exercises.forEach((exercise, exerciseIndex) => {
        exercise.movements.forEach((movement, movementIndex) => {
          if (movementIds.has(movement.id)) {
            context.addIssue({
              code: 'custom',
              path: [
                routineIndex,
                'exercises',
                exerciseIndex,
                'movements',
                movementIndex,
                'id',
              ],
              message: 'El id del movimiento debe ser único entre rutinas.',
            })
          }
          movementIds.add(movement.id)
        })
      })
    })
  })

export const routines: Routine[] = routineCollectionSchema.parse([
  primerosMovimientos,
  brazosCoordinacion,
  cambioPeso,
  pasosMovimientosPiernas,
  brazosPiernas,
  formaCompletaTaichi,
  repasoForma,
])
