import type { VoiceServices } from '../application/ports'
import { VoiceController } from '../application/voiceController'
import { BrowserTextToSpeechAdapter } from '../infrastructure/ai/BrowserTextToSpeechAdapter'
import { BrowserSpeechToTextAdapter } from '../infrastructure/ai/BrowserSpeechToTextAdapter'
import { ApiLLMAdapter } from '../infrastructure/ai/ApiLLMAdapter'
import { SileroVadAdapter } from '../infrastructure/ai/SileroVadAdapter'

export const voiceCaptureController = new VoiceController()
export const voiceActivityDetector = new SileroVadAdapter()

export const voiceServices: VoiceServices = {
  stt: new BrowserSpeechToTextAdapter(
    voiceCaptureController,
    voiceActivityDetector,
  ),
  ai: new ApiLLMAdapter(),
  tts: new BrowserTextToSpeechAdapter(),
}
