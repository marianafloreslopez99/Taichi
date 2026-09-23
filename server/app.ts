import express from 'express'
import { z } from 'zod'
import { prisma } from './db.js'
import {
  asyncRoute,
  errorHandler,
  HttpError,
  requireServiceKey,
} from './http.js'
import {
  GeminiQuestionService,
  type ServerAIQuestionService,
} from './geminiService.js'
import {
  addQuestion,
  createSession,
  deleteSession,
  findRoutine,
  getQuestionContext,
  listRoutines,
  readSession,
  transitionSession,
} from './sessionService.js'

const routineIdParams = z.object({ routineId: z.string().min(1) })
const sessionIdParams = z.object({ sessionId: z.string().uuid() })
const createSessionBody = z.object({
  routineId: z.string().min(1),
  replaceSessionId: z.string().uuid().optional(),
})
const questionBody = z.object({
  movementId: z.string().min(1),
  question: z.string().trim().min(1).max(2000),
  answer: z.string().trim().min(1).max(5000),
})
const answerQuestionBody = questionBody.pick({
  movementId: true,
  question: true,
})

function createQuestionRateLimiter(maxRequests = 5, windowMs = 10 * 60_000) {
  const attempts = new Map<string, { count: number; resetsAt: number }>()
  return (sessionId: string) => {
    const now = Date.now()
    const current = attempts.get(sessionId)
    if (!current || current.resetsAt <= now) {
      attempts.set(sessionId, { count: 1, resetsAt: now + windowMs })
      return
    }
    if (current.count >= maxRequests) {
      throw new HttpError(
        429,
        'AI_RATE_LIMITED',
        'Alcanzaste el límite temporal de preguntas. Inténtalo más tarde.',
      )
    }
    current.count += 1
  }
}

function params<T extends z.ZodType>(schema: T, value: unknown) {
  const parsed = schema.safeParse(value)
  if (!parsed.success)
    throw new HttpError(
      400,
      'INVALID_PARAMETERS',
      'Los parámetros no son válidos.',
      parsed.error.flatten(),
    )
  return parsed.data
}

export function createApp(
  dependencies: { aiQuestionService?: ServerAIQuestionService } = {},
) {
  const app = express()
  const aiQuestionService =
    dependencies.aiQuestionService ?? new GeminiQuestionService()
  const consumeQuestionQuota = createQuestionRateLimiter()
  app.use(express.json({ limit: '100kb' }))

  app.get(
    '/health',
    asyncRoute(async (_request, response) => {
      await prisma.$queryRaw`SELECT 1`
      response.json({ ok: true })
    }),
  )

  const api = express.Router()
  api.get(
    '/routines',
    asyncRoute(async (_request, response) =>
      response.json({ data: await listRoutines(prisma) }),
    ),
  )
  api.get(
    '/routines/:routineId',
    asyncRoute(async (request, response) => {
      const { routineId } = params(routineIdParams, request.params)
      response.json({ data: await findRoutine(prisma, routineId) })
    }),
  )
  api.post(
    '/sessions',
    asyncRoute(async (request, response) => {
      const input = params(createSessionBody, request.body)
      response
        .status(201)
        .json({
          data: await createSession(
            prisma,
            input.routineId,
            input.replaceSessionId,
          ),
        })
    }),
  )
  api.get(
    '/sessions/:sessionId',
    asyncRoute(async (request, response) => {
      const { sessionId } = params(sessionIdParams, request.params)
      response.json({ data: await readSession(prisma, sessionId) })
    }),
  )
  for (const action of [
    'pause',
    'resume',
    'next',
    'previous',
    'ask',
    'close-question',
    'complete',
  ] as const) {
    api.post(
      `/sessions/:sessionId/${action}`,
      asyncRoute(async (request, response) => {
        const { sessionId } = params(sessionIdParams, request.params)
        response.json({
          data: await transitionSession(prisma, sessionId, action),
        })
      }),
    )
  }
  api.post(
    '/sessions/:sessionId/questions',
    asyncRoute(async (request, response) => {
      const { sessionId } = params(sessionIdParams, request.params)
      const input = params(questionBody, request.body)
      response
        .status(201)
        .json({ data: await addQuestion(prisma, sessionId, input) })
    }),
  )
  api.post(
    '/sessions/:sessionId/answer',
    asyncRoute(async (request, response) => {
      const { sessionId } = params(sessionIdParams, request.params)
      const input = params(answerQuestionBody, request.body)
      const context = await getQuestionContext(
        prisma,
        sessionId,
        input.movementId,
        input.question,
      )
      consumeQuestionQuota(sessionId)
      const controller = new AbortController()
      request.once('aborted', () => controller.abort())
      response.json({
        data: await aiQuestionService.answer(context, controller.signal),
      })
    }),
  )
  api.delete(
    '/sessions/:sessionId',
    asyncRoute(async (request, response) => {
      const { sessionId } = params(sessionIdParams, request.params)
      await deleteSession(prisma, sessionId)
      response.status(204).send()
    }),
  )
  api.use((_request, response) => {
    response.status(404).json({
      error: {
        code: 'API_ROUTE_NOT_FOUND',
        message: 'Ruta de API no encontrada.',
      },
    })
  })
  app.use('/api/v1', api)

  app.get(
    '/internal/v1/health',
    requireServiceKey,
    asyncRoute(async (_request, response) => {
      await prisma.$queryRaw`SELECT 1`
      response.json({ ok: true })
    }),
  )
  app.use(errorHandler)
  return app
}
