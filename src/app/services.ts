import type { VoiceServices } from '../application/ports'
import { BrowserTextToSpeechAdapter } from '../infrastructure/ai/BrowserTextToSpeechAdapter'
import { BrowserSpeechToTextAdapter } from '../infrastructure/ai/BrowserSpeechToTextAdapter'
import { ApiLLMAdapter } from '../infrastructure/ai/ApiLLMAdapter'

export const voiceServices: VoiceServices = {
  stt: new BrowserSpeechToTextAdapter(),
  ai: new ApiLLMAdapter(),
  tts: new BrowserTextToSpeechAdapter(),
}
