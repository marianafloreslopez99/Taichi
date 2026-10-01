import { describe, expect, it, vi } from 'vitest'
import {
  runQuestionFlow,
  runTextQuestionFlow,
  QuestionFlowError,
  type AIInteractionStatus,
} from './questionFlow'
import type { VoiceServices } from './ports'

const context = {
  sessionId: '00000000-0000-4000-8000-000000000001',
  routineId: 'r',
  routineName: 'Rutina',
  difficulty: 'Principiante' as const,
  movementId: 'm',
  movementName: 'Apertura',
  instruction: 'Respira.',
}
const services = (): VoiceServices => ({
  stt: {
    listen: vi.fn().mockResolvedValue('¿Cómo respiro?'),
    stop: vi.fn(),
  },
  ai: { ask: vi.fn().mockResolvedValue({ text: 'Con calma.' }) },
  tts: { speak: vi.fn().mockResolvedValue(undefined), stop: vi.fn() },
})

describe('runTextQuestionFlow', () => {
  it('sends a written question directly to the API-backed LLM', async () => {
    const deps = services()
    const states: AIInteractionStatus[] = []
    const result = await runTextQuestionFlow(
      context,
      '  ¿Cómo coordino los brazos?  ',
      deps,
      (status) => states.push(status),
    )

    expect(deps.stt.listen).not.toHaveBeenCalled()
    expect(deps.ai.ask).toHaveBeenCalledWith(
      { ...context, question: '¿Cómo coordino los brazos?' },
      undefined,
    )
    expect(states).toEqual(['THINKING', 'SPEAKING', 'COMPLETED'])
    expect(result.question).toBe('¿Cómo coordino los brazos?')
  })

  it('rejects blank written questions before calling the LLM', async () => {
    const deps = services()
    await expect(
      runTextQuestionFlow(context, '   ', deps, () => {}),
    ).rejects.toMatchObject({ stage: 'INPUT' })
    expect(deps.ai.ask).not.toHaveBeenCalled()
  })
})

describe('runQuestionFlow', () => {
  it('runs STT, LLM and TTS in order with movement context', async () => {
    const deps = services()
    const states: AIInteractionStatus[] = []
    const result = await runQuestionFlow(context, deps, (status) =>
      states.push(status),
    )
    expect(states).toEqual([
      'LISTENING',
      'TRANSCRIBING',
      'THINKING',
      'SPEAKING',
      'COMPLETED',
    ])
    expect(deps.ai.ask).toHaveBeenCalledWith(
      {
        ...context,
        question: '¿Cómo respiro?',
      },
      undefined,
    )
    expect(deps.tts.speak).toHaveBeenCalledWith('Con calma.')
    expect(result.question).toBe('¿Cómo respiro?')
  })

  it('does not send an empty transcription to the LLM', async () => {
    const deps = services()
    vi.mocked(deps.stt.listen).mockResolvedValue('  ')
    await expect(
      runQuestionFlow(context, deps, () => {}),
    ).rejects.toBeInstanceOf(QuestionFlowError)
    expect(deps.ai.ask).not.toHaveBeenCalled()
  })

  it('keeps STT and LLM errors recoverable', async () => {
    const deps = services()
    vi.mocked(deps.stt.listen).mockRejectedValueOnce(new Error('offline'))
    await expect(
      runQuestionFlow(context, deps, () => {}),
    ).rejects.toMatchObject({ stage: 'STT' })
    vi.mocked(deps.ai.ask).mockRejectedValueOnce(new Error('offline'))
    await expect(
      runQuestionFlow(context, deps, () => {}),
    ).rejects.toMatchObject({ stage: 'LLM' })
  })

  it('retains the textual answer if TTS fails', async () => {
    const deps = services()
    vi.mocked(deps.tts.speak).mockRejectedValue(new Error('no voice'))
    const result = await runQuestionFlow(context, deps, () => {})
    expect(result).toMatchObject({
      response: { text: 'Con calma.' },
      audioError: true,
    })
  })

  it('stops before sending to Gemini when listening is cancelled', async () => {
    const deps = services()
    const controller = new AbortController()
    vi.mocked(deps.stt.listen).mockImplementationOnce(async () => {
      controller.abort()
      return '¿Cómo respiro?'
    })
    await expect(
      runQuestionFlow(
        context,
        deps,
        () => {},
        undefined,
        undefined,
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(deps.ai.ask).not.toHaveBeenCalled()
  })

  it('maps denied and unavailable microphone errors without calling Gemini', async () => {
    const deps = services()
    vi.mocked(deps.stt.listen).mockRejectedValueOnce(
      new DOMException('denied', 'NotAllowedError'),
    )
    await expect(
      runQuestionFlow(context, deps, () => {}),
    ).rejects.toMatchObject({
      stage: 'MICROPHONE',
      message: expect.stringContaining('permiso'),
    })
    vi.mocked(deps.stt.listen).mockRejectedValueOnce(
      new DOMException('missing', 'NotFoundError'),
    )
    await expect(
      runQuestionFlow(context, deps, () => {}),
    ).rejects.toMatchObject({
      stage: 'MICROPHONE',
      message: expect.stringContaining('micrófono disponible'),
    })
    expect(deps.ai.ask).not.toHaveBeenCalled()
  })
})
