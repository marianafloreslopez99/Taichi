import type {
  AIContext,
  AIQuestionService,
  AIResponse,
} from '../../application/ports'
import { api } from '../api/client'

export class ApiLLMAdapter implements AIQuestionService {
  ask(context: AIContext, signal?: AbortSignal): Promise<AIResponse> {
    return api.answerQuestion(
      context.sessionId,
      context.movementId,
      context.question,
      signal,
    )
  }
}
