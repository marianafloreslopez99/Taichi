import { describe, expect, it } from 'vitest'
import { routines } from '../infrastructure/routines'
import { sessionReducer } from './sessionMachine'

const routine = routines[0]!
const start = () =>
  sessionReducer(null, { type: 'START', routine, id: 'session-1', at: 100 })!

describe('sessionReducer', () => {
  it('starts at the first movement of a routine', () => {
    expect(start()).toMatchObject({
      routineId: routine.id,
      currentMovementIndex: 0,
      status: 'PLAYING',
      elapsedSeconds: 0,
    })
  })

  it('rejects an empty routine', () => {
    expect(
      sessionReducer(null, {
        type: 'START',
        routine: { ...routine, movements: [] },
        id: 'x',
        at: 1,
      }),
    ).toBeNull()
  })

  it('advances and returns within boundaries', () => {
    const first = start()
    expect(sessionReducer(first, { type: 'PREVIOUS' })).toBe(first)
    const second = sessionReducer(first, {
      type: 'NEXT',
      movementCount: routine.movements.length,
    })!
    expect(second.currentMovementIndex).toBe(1)
    expect(
      sessionReducer(second, { type: 'PREVIOUS' })?.currentMovementIndex,
    ).toBe(0)
  })

  it('pauses and resumes without advancing the timer while paused', () => {
    const paused = sessionReducer(start(), { type: 'PAUSE' })!
    expect(paused.status).toBe('PAUSED')
    expect(sessionReducer(paused, { type: 'TICK' })).toBe(paused)
    const resumed = sessionReducer(paused, { type: 'RESUME' })!
    expect(resumed.status).toBe('PLAYING')
    expect(sessionReducer(resumed, { type: 'TICK' })?.elapsedSeconds).toBe(1)
  })

  it('asks on the same movement and returns paused', () => {
    const asking = sessionReducer(start(), { type: 'ASK' })!
    expect(asking.status).toBe('ASKING')
    expect(
      sessionReducer(asking, {
        type: 'NEXT',
        movementCount: routine.movements.length,
      }),
    ).toBe(asking)
    const withQuestion = sessionReducer(asking, {
      type: 'ADD_QUESTION',
      question: {
        id: 'q',
        sessionId: asking.id,
        movementId: routine.movements[0]!.id,
        question: '¿Cómo?',
        answer: 'Con calma.',
        createdAt: 101,
      },
    })!
    expect(withQuestion.questions).toHaveLength(1)
    expect(
      sessionReducer(withQuestion, { type: 'CLOSE_QUESTION' }),
    ).toMatchObject({ status: 'PAUSED', currentMovementIndex: 0 })
  })

  it('completes only on the last movement and never advances afterward', () => {
    let session = start()
    expect(
      sessionReducer(session, {
        type: 'COMPLETE',
        movementCount: routine.movements.length,
        at: 200,
      }),
    ).toBe(session)
    for (let i = 1; i < routine.movements.length; i += 1)
      session = sessionReducer(session, {
        type: 'NEXT',
        movementCount: routine.movements.length,
      })!
    expect(
      sessionReducer(session, {
        type: 'NEXT',
        movementCount: routine.movements.length,
      }),
    ).toBe(session)
    const completed = sessionReducer(session, {
      type: 'COMPLETE',
      movementCount: routine.movements.length,
      at: 200,
    })!
    expect(completed).toMatchObject({ status: 'COMPLETED', completedAt: 200 })
    expect(
      sessionReducer(completed, {
        type: 'NEXT',
        movementCount: routine.movements.length,
      }),
    ).toBe(completed)
    expect(sessionReducer(completed, { type: 'RESUME' })).toBe(completed)
  })
})
