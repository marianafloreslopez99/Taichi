import type { NextFunction, Request, Response } from 'express'
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
  _next: NextFunction,
) {
  void _next
  if (error instanceof HttpError) {
    response.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    })
    return
  }
  console.error(error)
  response.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado.' },
  })
}
