import type { VoiceServices } from '../application/ports'
import {
  MockLLMAdapter,
  MockSpeechToTextAdapter,
  MockTextToSpeechAdapter,
} from '../infrastructure/ai/mockAdapters'

export const voiceServices: VoiceServices = {
  stt: new MockSpeechToTextAdapter(),
  ai: new MockLLMAdapter(),
  tts: new MockTextToSpeechAdapter(),
}
