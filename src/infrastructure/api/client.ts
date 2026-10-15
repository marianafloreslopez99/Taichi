import type { AIResponse } from '../../application/ports'
import type { PracticeSession, Routine } from '../../domain/models'
import type { VoiceCommand } from '../../application/voiceIntent'
import { recordSessionRequestTiming } from '../../application/sessionRequestTiming'

const apiBase = '/api/v1'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
  command?: VoiceCommand,
): Promise<T> {
  const startedAt = performance.now()
  let headersAt: number | undefined
  let response: Response | undefined
  let outcome: 'success' | 'error' = 'error'
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
    headersAt = performance.now()
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { code?: string; message?: string }
      } | null
      throw new ApiError(
        response.status,
        body?.error?.code ?? 'API_ERROR',
        body?.error?.message ?? 'No se pudo completar la solicitud.',
      )
    }
    if (response.status === 204) {
      outcome = 'success'
      return undefined as T
    }
    const body = (await response.json()) as { data: T }
    outcome = 'success'
    return body.data
  } finally {
    if (command)
      recordSessionRequestTiming(
        command,
        {
          startedAt,
          headersAt,
          endedAt: performance.now(),
          httpStatus: response?.status,
          serverTiming: response?.headers.get('Server-Timing'),
        },
        outcome,
      )
  }
}

export const api = {
  listRoutines: () => request<Routine[]>('/routines'),
  getRoutine: (routineId: string) => request<Routine>(`/routines/${routineId}`),
  createSession: (routineId: string, replaceSessionId?: string) =>
    request<PracticeSession>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ routineId, replaceSessionId }),
    }),
  getSession: (sessionId: string) =>
    request<PracticeSession>(`/sessions/${sessionId}`),
  transition: (
    sessionId: string,
    action:
      | 'pause'
      | 'resume'
      | 'next'
      | 'previous'
      | 'ask'
      | 'close-question'
      | 'complete',
  ) =>
    request<PracticeSession>(
      `/sessions/${sessionId}/${action}`,
      {
        method: 'POST',
      },
      action === 'complete'
        ? 'finish'
        : action === 'ask' || action === 'close-question'
          ? undefined
          : action,
    ),
  createQuestion: (
    sessionId: string,
    movementId: string,
    question: string,
    signal?: AbortSignal,
  ) =>
    request<AIResponse>(`/sessions/${sessionId}/questions`, {
      method: 'POST',
      body: JSON.stringify({ movementId, question }),
      signal,
    }),
  deleteSession: (sessionId: string) =>
    request<void>(`/sessions/${sessionId}`, { method: 'DELETE' }),
}
