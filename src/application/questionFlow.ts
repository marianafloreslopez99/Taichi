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
    public readonly stage: 'INPUT' | 'MICROPHONE' | 'STT' | 'LLM',
    message: string,
  ) {
    super(message)
  }
}

export async function runTextQuestionFlow(
  context: Omit<AIContext, 'question'>,
  question: string,
  services: Pick<VoiceServices, 'ai' | 'tts'>,
  onStatus: (status: AIInteractionStatus) => void,
  onAnswer?: (response: AIResponse) => void,
  signal?: AbortSignal,
): Promise<QuestionFlowResult> {
  const normalizedQuestion = question.trim()
  if (!normalizedQuestion) {
    throw new QuestionFlowError(
      'INPUT',
      'Escribe una pregunta antes de enviar.',
    )
  }
  if (normalizedQuestion.length > 2000) {
    throw new QuestionFlowError(
      'INPUT',
      'La pregunta es demasiado larga. Redúcela a 2000 caracteres.',
    )
  }
  const ensureActive = () => {
    if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError')
  }

  try {
    onStatus('THINKING')
    let response: AIResponse
    try {
      response = await services.ai.ask(
        { ...context, question: normalizedQuestion },
        signal,
      )
      ensureActive()
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError')
      throw new QuestionFlowError(
        'LLM',
        error instanceof Error
          ? error.message
          : 'No pudimos responder ahora. Inténtalo de nuevo.',
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
    return { question: normalizedQuestion, response, audioError }
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError')
    if (error instanceof QuestionFlowError) throw error
    throw new QuestionFlowError(
      'LLM',
      'No pudimos responder ahora. Inténtalo de nuevo.',
    )
  }
}

export async function runQuestionFlow(
  context: Omit<AIContext, 'question'>,
  services: VoiceServices,
  onStatus: (status: AIInteractionStatus) => void,
  onQuestion?: (question: string) => void,
  onAnswer?: (response: AIResponse) => void,
  signal?: AbortSignal,
  onInterim?: (text: string) => void,
): Promise<QuestionFlowResult> {
  const ensureActive = () => {
    if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError')
  }
  onStatus('LISTENING')
  try {
    let question: string
    try {
      question = await services.stt.listen(signal, onInterim)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        throw new QuestionFlowError(
          'MICROPHONE',
          'El micrófono no tiene permiso. Puedes habilitarlo o escribir tu pregunta.',
        )
      }
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        throw new QuestionFlowError(
          'MICROPHONE',
          'No encontramos un micrófono disponible. Puedes escribir tu pregunta.',
        )
      }
      throw new QuestionFlowError(
        'STT',
        error instanceof Error
          ? error.message
          : 'No pudimos iniciar el micrófono. Puedes escribir tu pregunta.',
      )
    }
    ensureActive()
    onStatus('TRANSCRIBING')
    question = question.trim()
    if (!question) {
      throw new QuestionFlowError(
        'STT',
        'No se escuchó una pregunta. Inténtalo de nuevo.',
      )
    }
    onQuestion?.(question)
    return await runTextQuestionFlow(
      context,
      question,
      services,
      onStatus,
      onAnswer,
      signal,
    )
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError')
    if (error instanceof QuestionFlowError) throw error
    throw new QuestionFlowError(
      'STT',
      'No pudimos entender la pregunta. Inténtalo de nuevo.',
    )
  }
}
