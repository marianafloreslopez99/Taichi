import type { AIResponse } from '../../application/ports'
import type { AIQuestion, PracticeSession, Routine } from '../../domain/models'

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
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
  if (response.status === 204) return undefined as T
  const body = (await response.json()) as { data: T }
  return body.data
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
    request<PracticeSession>(`/sessions/${sessionId}/${action}`, {
      method: 'POST',
    }),
  addQuestion: (sessionId: string, question: AIQuestion) =>
    request<PracticeSession>(`/sessions/${sessionId}/questions`, {
      method: 'POST',
      body: JSON.stringify({
        movementId: question.movementId,
        question: question.question,
        answer: question.answer,
      }),
    }),
  answerQuestion: (
    sessionId: string,
    movementId: string,
    question: string,
    signal?: AbortSignal,
  ) =>
    request<AIResponse>(`/sessions/${sessionId}/answer`, {
      method: 'POST',
      body: JSON.stringify({ movementId, question }),
      signal,
    }),
  deleteSession: (sessionId: string) =>
    request<void>(`/sessions/${sessionId}`, { method: 'DELETE' }),
}
