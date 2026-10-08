import type { VoiceCommand } from './voiceIntent'

export interface VoiceRecognitionTiming {
  firstResultAt: number
  receivedAt: number
  speechEndedAt?: number
}

export interface VoiceLatencySample {
  command: VoiceCommand
  phase: 'recognition' | 'audio-stop' | 'action'
  durationMs: number
  outcome: 'success' | 'error'
}

const samples: VoiceLatencySample[] = []

// Bounded, local diagnostics: no recordings, transcripts or network reporting.
export function recordVoiceLatency(
  command: VoiceCommand,
  phase: VoiceLatencySample['phase'],
  start: number,
  outcome: VoiceLatencySample['outcome'] = 'success',
  end = performance.now(),
) {
  const sample = {
    command,
    phase,
    durationMs: Math.max(0, end - start),
    outcome,
  }
  samples.push(sample)
  if (samples.length > 20) samples.shift()
  const name = `taichi.voz.${phase}`
  try {
    performance.clearMeasures?.(name)
    performance.measure?.(name, {
      start,
      end: Math.max(start, end),
      detail: sample,
    })
  } catch {
    // Optional browser diagnostics must never interrupt a voice command.
  }
}

export function getVoiceLatencySamples(): readonly VoiceLatencySample[] {
  return samples.map((sample) => ({ ...sample }))
}
