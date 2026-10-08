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
  return { prisma, update }
}

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
