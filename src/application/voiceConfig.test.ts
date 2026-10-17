import { describe, expect, it } from 'vitest'
import { parseVoiceVadMode, VOICE_VAD_CONFIG } from './voiceConfig'

describe('voice VAD configuration', () => {
  it('only enables explicit supported modes', () => {
    expect(parseVoiceVadMode('observe')).toBe('observe')
    expect(parseVoiceVadMode('endpoint')).toBe('endpoint')
    expect(parseVoiceVadMode('on')).toBe('off')
    expect(parseVoiceVadMode(undefined)).toBe('off')
  })

  it('uses the documented command and question profiles with Silero v6', () => {
    expect(VOICE_VAD_CONFIG.model).toBe('v6')
    expect(VOICE_VAD_CONFIG.profiles.command.redemptionMs).toBe(500)
    expect(VOICE_VAD_CONFIG.profiles.question.redemptionMs).toBe(1_000)
    expect(VOICE_VAD_CONFIG.profiles.command.submitUserSpeechOnPause).toBe(
      false,
    )
  })
})
