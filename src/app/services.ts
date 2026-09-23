import type { VoiceServices } from '../application/ports'
import {
  MockSpeechToTextAdapter,
  MockTextToSpeechAdapter,
} from '../infrastructure/ai/mockAdapters'
import { ApiLLMAdapter } from '../infrastructure/ai/ApiLLMAdapter'

export const voiceServices: VoiceServices = {
  stt: new MockSpeechToTextAdapter(),
  ai: new ApiLLMAdapter(),
  tts: new MockTextToSpeechAdapter(),
}
