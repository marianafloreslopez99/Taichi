import type { AIContext, AIResponse, VoiceServices } from './ports'

export type AIInteractionStatus =
  | 'IDLE'
  | 'LISTENING'
  | 'TRANSCRIBING'
  | 'THINKING'
  | 'SPEAKING'
  | 'ERROR'
  | 'COMPLETED'

export interface QuestionFlowResult {
  question: string
  response: AIResponse
  audioError: boolean
}

export class QuestionFlowError extends Error {
  constructor(
    public readonly stage: 'MICROPHONE' | 'STT' | 'LLM',
    message: string,
  ) {
    super(message)
  }
}

export async function runQuestionFlow(
  context: Omit<AIContext, 'question'>,
  services: VoiceServices,
  onStatus: (status: AIInteractionStatus) => void,
  listen: () => Promise<Blob>,
  onQuestion?: (question: string) => void,
  onAnswer?: (response: AIResponse) => void,
  signal?: AbortSignal,
): Promise<QuestionFlowResult> {
  const ensureActive = () => {
    if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError')
  }
  onStatus('LISTENING')
  let audio: Blob
  try {
    try {
      audio = await listen()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        throw new QuestionFlowError(
          'MICROPHONE',
          'El micrófono no tiene permiso. Puedes volver a la rutina y seguir las instrucciones escritas.',
        )
      }
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        throw new QuestionFlowError(
          'MICROPHONE',
          'No encontramos un micrófono disponible. Puedes continuar la rutina sin audio.',
        )
      }
      throw new QuestionFlowError(
        'MICROPHONE',
        'No pudimos iniciar el micrófono. Inténtalo de nuevo o continúa la rutina.',
      )
    }
    ensureActive()
    onStatus('TRANSCRIBING')
    const question = (await services.stt.transcribe(audio)).trim()
    ensureActive()
    if (!question) throw new Error('La pregunta está vacía')
    onQuestion?.(question)
    onStatus('THINKING')
    let response: AIResponse
    try {
      response = await services.ai.ask({ ...context, question }, signal)
      ensureActive()
    } catch {
      throw new QuestionFlowError(
        'LLM',
        'No pudimos responder ahora. Inténtalo de nuevo.',
      )
    }
    onAnswer?.(response)
    onStatus('SPEAKING')
    let audioError = false
    try {
      await services.tts.speak(response.text)
      ensureActive()
    } catch {
      audioError = true
    }
    onStatus('COMPLETED')
    return { question, response, audioError }
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError')
    if (error instanceof QuestionFlowError) throw error
    throw new QuestionFlowError(
      'STT',
      'No pudimos entender la pregunta. Inténtalo de nuevo.',
    )
  }
}
