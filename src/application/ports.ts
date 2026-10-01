import type { Difficulty } from '../domain/models'

export interface AIContext {
  sessionId: string
  routineId: string
  routineName: string
  difficulty: Difficulty
  movementId: string
  movementName: string
  instruction: string
  question: string
}

export interface AIResponse {
  text: string
  requiresProfessionalAdvice?: boolean
}

export interface SpeechToTextService {
  listen(
    signal?: AbortSignal,
    onInterim?: (text: string) => void,
  ): Promise<string>
  stop(): void
}

export interface AIQuestionService {
  ask(context: AIContext, signal?: AbortSignal): Promise<AIResponse>
}

export interface TextToSpeechService {
  speak(text: string): Promise<void>
  stop(): void
}

export interface VoiceServices {
  stt: SpeechToTextService
  ai: AIQuestionService
  tts: TextToSpeechService
}
