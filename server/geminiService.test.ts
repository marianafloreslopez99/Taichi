import { describe, expect, it, vi } from 'vitest'
import type { AIContext } from '../src/application/ports.js'
import {
  buildQuestionPrompt,
  GeminiQuestionService,
  requiresProfessionalAdvice,
} from './geminiService.js'

const context: AIContext = {
  sessionId: '00000000-0000-4000-8000-000000000001',
  routineId: 'primeros-movimientos',
  routineName: 'Primeros movimientos',
  difficulty: 'Principiante',
  movementId: 'pp-apertura',
  movementName: 'Apertura',
  instruction: 'Eleva los brazos lentamente.',
  question: '¿Cómo debo respirar?',
}

describe('GeminiQuestionService', () => {
  it('sends trusted movement context through the Interactions API', async () => {
    const createInteraction = vi.fn().mockResolvedValue({
      output_text: 'Respira con calma y sin forzar.',
    })
    const service = new GeminiQuestionService(
      'gemini-3.1-pro-preview',
      null,
      createInteraction,
    )

    await expect(service.answer(context)).resolves.toEqual({
      text: 'Respira con calma y sin forzar.',
      requiresProfessionalAdvice: false,
    })
    expect(createInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-3.1-pro-preview',
        input: expect.stringContaining('¿Cómo debo respirar?'),
        store: false,
      }),
      expect.objectContaining({ timeout_ms: expect.any(Number) }),
    )
  })

  it('marks health questions and keeps them in the safety prompt', () => {
    expect(requiresProfessionalAdvice('Me duele mucho la rodilla')).toBe(true)
    expect(buildQuestionPrompt(context)).toContain(
      'Instrucción oficial: Eleva los brazos lentamente.',
    )
  })

  it('fails safely when no API key is configured', async () => {
    const service = new GeminiQuestionService('gemini-3.1-pro-preview', null)
    await expect(service.answer(context)).rejects.toMatchObject({
      status: 503,
      code: 'AI_NOT_CONFIGURED',
    })
  })

  it('maps provider quota errors without exposing provider details', async () => {
    const createInteraction = vi.fn().mockRejectedValue({ status: 429 })
    const service = new GeminiQuestionService(
      'gemini-3.1-pro-preview',
      null,
      createInteraction,
    )
    await expect(service.answer(context)).rejects.toMatchObject({
      status: 429,
      code: 'AI_RATE_LIMITED',
    })
  })
})
