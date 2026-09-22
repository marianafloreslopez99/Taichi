import type { NextFunction, Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { env } from './config.js'

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
  }
}

export const asyncRoute =
  (
    handler: (request: Request, response: Response, next: NextFunction) =>
      Promise<unknown>,
  ) =>
  (request: Request, response: Response, next: NextFunction) => {
    void handler(request, response, next).catch(next)
  }

export function requireServiceKey(
  request: Request,
  _response: Response,
  next: NextFunction,
) {
  if (!env.SERVICE_API_KEY || request.header('x-service-key') !== env.SERVICE_API_KEY) {
    next(new HttpError(401, 'SERVICE_UNAUTHORIZED', 'Credencial de servicio inválida.'))
    return
  }
  next()
}

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  next: NextFunction,
) {
  if (response.headersSent) {
    next(error)
    return
  }
  if (error instanceof HttpError) {
    response.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    })
    return
  }
  if (
    error instanceof SyntaxError &&
    'status' in error &&
    error.status === 400
  ) {
    response.status(400).json({
      error: { code: 'INVALID_JSON', message: 'El cuerpo JSON no es válido.' },
    })
    return
  }
  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2024')
  ) {
    console.error(error)
    response.status(503).json({
      error: { code: 'DATABASE_UNAVAILABLE', message: 'La base de datos no está disponible.' },
    })
    return
  }
  console.error(error)
  response.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado.' },
  })
}
