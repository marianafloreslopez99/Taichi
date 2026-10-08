import { describe, expect, it, vi } from 'vitest'
import { getVoiceLatencySamples, recordVoiceLatency } from './voiceLatency'

describe('voice latency diagnostics', () => {
  it('does not prevent commands when the browser cannot create a measurement', () => {
    vi.stubGlobal('performance', {
      now: () => 200,
      measure: () => {
        throw new Error('Unsupported options')
      },
    })
    try {
      expect(() => recordVoiceLatency('next', 'action', 100)).not.toThrow()
    } finally {
      vi.unstubAllGlobals()
    }
  })
  it('keeps a bounded local history and browser performance measurements without transcripts', () => {
    const measure = vi.fn()
    const clearMeasures = vi.fn()
    vi.stubGlobal('performance', { now: () => 200, measure, clearMeasures })
    try {
      for (let index = 0; index < 25; index++)
        recordVoiceLatency(
          'pause',
          'action',
          100 + index,
          index === 24 ? 'error' : 'success',
        )
      const samples = getVoiceLatencySamples()
      expect(samples).toHaveLength(20)
      expect(samples.at(-1)).toEqual({
        command: 'pause',
        phase: 'action',
        durationMs: 76,
        outcome: 'error',
      })
      expect(clearMeasures).toHaveBeenCalledWith('taichi.voz.action')
      expect(measure).toHaveBeenLastCalledWith(
        'taichi.voz.action',
        expect.objectContaining({ start: 124, end: 200 }),
      )
      const copy = getVoiceLatencySamples()
      copy[0]!.durationMs = -1
      expect(getVoiceLatencySamples()[0]!.durationMs).toBeGreaterThanOrEqual(0)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
