import type { VoiceServices } from '../application/ports'
import { VoiceController } from '../application/voiceController'
import { BrowserTextToSpeechAdapter } from '../infrastructure/ai/BrowserTextToSpeechAdapter'
import { BrowserSpeechToTextAdapter } from '../infrastructure/ai/BrowserSpeechToTextAdapter'
import { ApiLLMAdapter } from '../infrastructure/ai/ApiLLMAdapter'

export const voiceCaptureController = new VoiceController()

export const voiceServices: VoiceServices = {
  stt: new BrowserSpeechToTextAdapter(voiceCaptureController),
  ai: new ApiLLMAdapter(),
  tts: new BrowserTextToSpeechAdapter(),
}
