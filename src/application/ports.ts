import type { Difficulty } from '../domain/models'

export interface AIContext {
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
  transcribe(audio: Blob): Promise<string>
}

export interface AIQuestionService {
  ask(context: AIContext): Promise<AIResponse>
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
