import type { PrismaClient } from '@prisma/client'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { transitionSession } from './sessionService'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-07T18:00:00Z'))
})
afterEach(() => vi.useRealTimers())

function database(status: 'PLAYING' | 'PAUSED' | 'ASKING' | 'COMPLETED') {
  const session = {
    id: 'session-1',
    routineId: 'primeros-movimientos',
    currentMovementIndex: 0,
    status,
    startedAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
    elapsedSeconds: 42,
    questions: [],
  }
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    ...session,
    ...data,
  }))
  const prisma = {
    session: { findUniqueOrThrow: vi.fn().mockResolvedValue(session), update },
    movement: { count: vi.fn().mockResolvedValue(3) },
  } as unknown as PrismaClient
  return { prisma, update, session }
}

describe('session transition persistence', () => {
  it.each(['pause', 'next', 'previous', 'ask', 'complete'] as const)(
    'persists elapsed time and %s together without an intermediate write',
    async (action) => {
      const { prisma, update, session } = database('PLAYING')
      session.updatedAt = new Date(Date.now() - 5000)
      session.currentMovementIndex = 1
      const result = await transitionSession(prisma, 'session-1', action)
      expect(result.elapsedSeconds).toBe(47)
      expect(update).toHaveBeenCalledTimes(1)
      expect(prisma.session.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'session-1' },
      })
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { questions: { orderBy: { createdAt: 'asc' } } },
        }),
      )
      expect(prisma.movement.count).toHaveBeenCalledTimes(
        action === 'next' ? 1 : 0,
      )
    },
  )
  it('does not add paused wall time when resuming', async () => {
    const { prisma, session } = database('PAUSED')
    session.updatedAt = new Date(Date.now() - 60000)
    const result = await transitionSession(prisma, 'session-1', 'resume')
    expect(result).toMatchObject({ status: 'PLAYING', elapsedSeconds: 42 })
    expect(prisma.movement.count).not.toHaveBeenCalled()
  })
  it('rejects the last movement without writing elapsed time or advancing', async () => {
    const { prisma, update, session } = database('PLAYING')
    session.updatedAt = new Date(Date.now() - 5000)
    session.currentMovementIndex = 2
    await expect(
      transitionSession(prisma, 'session-1', 'next'),
    ).rejects.toThrow('No se puede avanzar')
    expect(update).not.toHaveBeenCalled()
  })
  it('does not count movements or write for a forbidden transition', async () => {
    const { prisma, update } = database('ASKING')
    await expect(
      transitionSession(prisma, 'session-1', 'next'),
    ).rejects.toThrow('No se puede avanzar')
    expect(prisma.movement.count).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
})

describe('session completion', () => {
  it.each(['PLAYING', 'PAUSED'] as const)(
    'allows early completion from %s',
    async (status) => {
      const { prisma } = database(status)
      const result = await transitionSession(prisma, 'session-1', 'complete')
      expect(result).toMatchObject({
        status: 'COMPLETED',
        currentMovementIndex: 0,
        elapsedSeconds: 42,
      })
      expect(result.completedAt).toBe(Date.now())
    },
  )
  it.each(['ASKING', 'COMPLETED'] as const)(
    'rejects completion from %s',
    async (status) => {
      const { prisma, update } = database(status)
      await expect(
        transitionSession(prisma, 'session-1', 'complete'),
      ).rejects.toThrow(
        'Solo se puede finalizar una sesión en reproducción o pausada.',
      )
      expect(update).not.toHaveBeenCalled()
    },
  )
})
