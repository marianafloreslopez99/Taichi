import { describe, expect, it, vi } from 'vitest'
import {
  runQuestionFlow,
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
  stt: { transcribe: vi.fn().mockResolvedValue('¿Cómo respiro?') },
  ai: { ask: vi.fn().mockResolvedValue({ text: 'Con calma.' }) },
  tts: { speak: vi.fn().mockResolvedValue(undefined), stop: vi.fn() },
})

describe('runQuestionFlow', () => {
  it('runs STT, LLM and TTS in order with movement context', async () => {
    const deps = services()
    const states: AIInteractionStatus[] = []
    const result = await runQuestionFlow(
      context,
      deps,
      (status) => states.push(status),
      async () => new Blob(),
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
    vi.mocked(deps.stt.transcribe).mockResolvedValue('  ')
    await expect(
      runQuestionFlow(
        context,
        deps,
        () => {},
        async () => new Blob(),
      ),
    ).rejects.toBeInstanceOf(QuestionFlowError)
    expect(deps.ai.ask).not.toHaveBeenCalled()
  })

  it('keeps STT and LLM errors recoverable', async () => {
    const deps = services()
    vi.mocked(deps.stt.transcribe).mockRejectedValueOnce(new Error('offline'))
    await expect(
      runQuestionFlow(
        context,
        deps,
        () => {},
        async () => new Blob(),
      ),
    ).rejects.toMatchObject({ stage: 'STT' })
    vi.mocked(deps.ai.ask).mockRejectedValueOnce(new Error('offline'))
    await expect(
      runQuestionFlow(
        context,
        deps,
        () => {},
        async () => new Blob(),
      ),
    ).rejects.toMatchObject({ stage: 'LLM' })
  })

  it('retains the textual answer if TTS fails', async () => {
    const deps = services()
    vi.mocked(deps.tts.speak).mockRejectedValue(new Error('no voice'))
    const result = await runQuestionFlow(
      context,
      deps,
      () => {},
      async () => new Blob(),
    )
    expect(result).toMatchObject({
      response: { text: 'Con calma.' },
      audioError: true,
    })
  })

  it('stops before STT when a question is cancelled', async () => {
    const deps = services()
    const controller = new AbortController()
    const listen = async () => {
      controller.abort()
      return new Blob()
    }
    await expect(
      runQuestionFlow(
        context,
        deps,
        () => {},
        listen,
        undefined,
        undefined,
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(deps.stt.transcribe).not.toHaveBeenCalled()
  })

  it('maps denied and unavailable microphone errors without calling STT', async () => {
    const deps = services()
    await expect(
      runQuestionFlow(
        context,
        deps,
        () => {},
        async () => {
          throw new DOMException('denied', 'NotAllowedError')
        },
      ),
    ).rejects.toMatchObject({
      stage: 'MICROPHONE',
      message: expect.stringContaining('permiso'),
    })
    await expect(
      runQuestionFlow(
        context,
        deps,
        () => {},
        async () => {
          throw new DOMException('missing', 'NotFoundError')
        },
      ),
    ).rejects.toMatchObject({
      stage: 'MICROPHONE',
      message: expect.stringContaining('micrófono disponible'),
    })
    expect(deps.stt.transcribe).not.toHaveBeenCalled()
  })
})
