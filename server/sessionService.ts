import { randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import type { SessionStatus } from '../src/domain/models.js'
import { HttpError } from './http.js'
import { routineInclude, serializeRoutine, serializeSession } from './serializers.js'

const sessionInclude = {
  questions: { orderBy: { createdAt: 'asc' as const } },
} as const

type SessionRecord = Awaited<ReturnType<PrismaClient['session']['findUniqueOrThrow']>> & {
  questions: Array<{
    id: string
    sessionId: string
    movementId: string
    question: string
    answer: string
    createdAt: Date
  }>
}

function elapsedNow(session: Pick<SessionRecord, 'status' | 'updatedAt' | 'elapsedSeconds'>) {
  if (session.status !== 'PLAYING') return session.elapsedSeconds
  return session.elapsedSeconds + Math.max(0, Math.floor((Date.now() - session.updatedAt.getTime()) / 1000))
}

function transitionError(message: string) {
  return new HttpError(409, 'INVALID_SESSION_TRANSITION', message)
}

async function getSession(prisma: PrismaClient, id: string) {
  try {
    return await prisma.session.findUniqueOrThrow({ where: { id }, include: sessionInclude })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new HttpError(404, 'SESSION_NOT_FOUND', 'Sesión no encontrada.')
    }
    throw error
  }
}

async function saveElapsed(prisma: PrismaClient, session: SessionRecord) {
  const elapsedSeconds = elapsedNow(session)
  if (elapsedSeconds === session.elapsedSeconds || session.status !== 'PLAYING') return session
  return prisma.session.update({
    where: { id: session.id },
    data: { elapsedSeconds },
    include: sessionInclude,
  })
}

export async function listRoutines(prisma: PrismaClient) {
  const routines = await prisma.routine.findMany({ include: routineInclude, orderBy: { name: 'asc' } })
  return routines.map(serializeRoutine)
}

export async function findRoutine(prisma: PrismaClient, routineId: string) {
  const routine = await prisma.routine.findUnique({ where: { id: routineId }, include: routineInclude })
  if (!routine) throw new HttpError(404, 'ROUTINE_NOT_FOUND', 'Rutina no encontrada.')
  return serializeRoutine(routine)
}

export async function createSession(prisma: PrismaClient, routineId: string, replaceSessionId?: string) {
  const routine = await prisma.routine.findUnique({ where: { id: routineId } })
  if (!routine) throw new HttpError(404, 'ROUTINE_NOT_FOUND', 'Rutina no encontrada.')
  const movementCount = await prisma.movement.count({ where: { routineId } })
  if (movementCount === 0) throw new HttpError(409, 'EMPTY_ROUTINE', 'La rutina no tiene movimientos.')

  return prisma.$transaction(async (transaction) => {
    if (replaceSessionId) await transaction.session.deleteMany({ where: { id: replaceSessionId } })
    const session = await transaction.session.create({
      data: { id: randomUUID(), routineId, startedAt: new Date() },
      include: sessionInclude,
    })
    return serializeSession(session)
  })
}

export async function readSession(prisma: PrismaClient, id: string) {
  const session = await getSession(prisma, id)
  const fresh = await saveElapsed(prisma, session)
  return serializeSession(fresh, elapsedNow(fresh))
}

export async function transitionSession(
  prisma: PrismaClient,
  id: string,
  action: 'pause' | 'resume' | 'next' | 'previous' | 'ask' | 'close-question' | 'complete',
) {
  const initial = await getSession(prisma, id)
  const session = await saveElapsed(prisma, initial)
  const movementCount = await prisma.movement.count({ where: { routineId: session.routineId } })
  let data: { status?: SessionStatus; currentMovementIndex?: number; completedAt?: Date | null; elapsedSeconds: number }

  if (action === 'pause') {
    if (session.status !== 'PLAYING') throw transitionError('Solo se puede pausar una sesión en reproducción.')
    data = { status: 'PAUSED', elapsedSeconds: elapsedNow(session) }
  } else if (action === 'resume') {
    if (session.status !== 'PAUSED') throw transitionError('Solo se puede continuar una sesión pausada.')
    data = { status: 'PLAYING', elapsedSeconds: session.elapsedSeconds }
  } else if (action === 'next') {
    if (!['PLAYING', 'PAUSED'].includes(session.status) || session.currentMovementIndex >= movementCount - 1) {
      throw transitionError('No se puede avanzar desde este estado o movimiento.')
    }
    data = { currentMovementIndex: session.currentMovementIndex + 1, elapsedSeconds: elapsedNow(session) }
  } else if (action === 'previous') {
    if (!['PLAYING', 'PAUSED'].includes(session.status) || session.currentMovementIndex <= 0) {
      throw transitionError('No se puede regresar desde este estado o movimiento.')
    }
    data = { currentMovementIndex: session.currentMovementIndex - 1, elapsedSeconds: elapsedNow(session) }
  } else if (action === 'ask') {
    if (!['PLAYING', 'PAUSED'].includes(session.status)) throw transitionError('No se puede iniciar una pregunta desde este estado.')
    data = { status: 'ASKING', elapsedSeconds: elapsedNow(session) }
  } else if (action === 'close-question') {
    if (session.status !== 'ASKING') throw transitionError('No hay una pregunta activa para cerrar.')
    data = { status: 'PAUSED', elapsedSeconds: session.elapsedSeconds }
  } else {
    if (!['PLAYING', 'PAUSED'].includes(session.status) || session.currentMovementIndex !== movementCount - 1) {
      throw transitionError('Solo se puede finalizar en el último movimiento.')
    }
    data = { status: 'COMPLETED', completedAt: new Date(), elapsedSeconds: elapsedNow(session) }
  }

  const updated = await prisma.session.update({
    where: { id },
    data,
    include: sessionInclude,
  })
  return serializeSession(updated)
}

export async function addQuestion(
  prisma: PrismaClient,
  sessionId: string,
  input: { movementId: string; question: string; answer: string },
) {
  const session = await getSession(prisma, sessionId)
  if (session.status !== 'ASKING') throw transitionError('La sesión no está esperando una pregunta.')
  const movement = await prisma.movement.findFirst({ where: { id: input.movementId, routineId: session.routineId } })
  if (!movement) throw new HttpError(400, 'INVALID_MOVEMENT', 'El movimiento no pertenece a la rutina.')
  await prisma.aIQuestion.create({ data: { id: randomUUID(), sessionId, ...input } })
  const updated = await getSession(prisma, sessionId)
  return serializeSession(updated)
}

export async function deleteSession(prisma: PrismaClient, id: string) {
  const result = await prisma.session.deleteMany({ where: { id } })
  if (result.count === 0) throw new HttpError(404, 'SESSION_NOT_FOUND', 'Sesión no encontrada.')
}
