import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AIContext } from '../../application/ports'
import { ApiLLMAdapter } from './ApiLLMAdapter'

afterEach(() => vi.unstubAllGlobals())

describe('ApiLLMAdapter', () => {
  it('sends only the current session, movement and question to the backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            text: 'Respira de forma natural.',
            requiresProfessionalAdvice: false,
          },
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const context: AIContext = {
      sessionId: '00000000-0000-4000-8000-000000000001',
      routineId: 'primeros-movimientos',
      routineName: 'Primeros movimientos',
      difficulty: 'Principiante',
      movementId: 'pp-apertura',
      movementName: 'Apertura',
      instruction: 'Eleva los brazos.',
      question: '¿Cómo respiro?',
    }

    await expect(new ApiLLMAdapter().ask(context)).resolves.toEqual({
      text: 'Respira de forma natural.',
      requiresProfessionalAdvice: false,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/sessions/00000000-0000-4000-8000-000000000001/questions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          movementId: 'pp-apertura',
          question: '¿Cómo respiro?',
        }),
      }),
    )
  })
})
