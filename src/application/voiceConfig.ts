// Shared grace period for a requested final result/end, not a silence threshold.
export const VOICE_FINALIZATION_TIMEOUT_MS = 5_000

export type VoiceVadMode = 'off' | 'observe' | 'endpoint'
export type VoiceVadProfileName = 'command' | 'question'

export interface VoiceVadProfile {
  readonly redemptionMs: number
  readonly minSpeechMs: number
  readonly preSpeechPadMs: number
  readonly positiveSpeechThreshold: number
  readonly negativeSpeechThreshold: number
  readonly submitUserSpeechOnPause: false
}

export function parseVoiceVadMode(value: string | undefined): VoiceVadMode {
  return value === 'observe' || value === 'endpoint' ? value : 'off'
}

const assetRoot = `${import.meta.env.BASE_URL}vendor/voice/`

export const VOICE_VAD_CONFIG = Object.freeze({
  mode: parseVoiceVadMode(import.meta.env.VITE_VOICE_VAD_MODE),
  model: 'v6' as const,
  assetBasePath: `${assetRoot}vad/`,
  onnxWASMBasePath: `${assetRoot}onnx/`,
  profiles: Object.freeze({
    command: Object.freeze({
      redemptionMs: 500,
      minSpeechMs: 150,
      preSpeechPadMs: 300,
      positiveSpeechThreshold: 0.5,
      negativeSpeechThreshold: 0.35,
      submitUserSpeechOnPause: false,
    }),
    question: Object.freeze({
      redemptionMs: 1_000,
      minSpeechMs: 200,
      preSpeechPadMs: 300,
      positiveSpeechThreshold: 0.5,
      negativeSpeechThreshold: 0.35,
      submitUserSpeechOnPause: false,
    }),
  } satisfies Record<VoiceVadProfileName, VoiceVadProfile>),
})
