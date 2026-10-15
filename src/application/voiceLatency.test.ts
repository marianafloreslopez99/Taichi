import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearVoiceEvaluation,
  exportVoiceEvaluation,
  finishVoiceEvaluation,
  getVoiceEvaluation,
  getVoiceEvaluationSummary,
  getVoiceLatencySamples,
  recordVoiceCaptureEvent,
  recordVoiceLatency,
  recordVoiceRecognitionLatency,
  startVoiceEvaluation,
  type VoiceEvaluationMetadata,
} from './voiceLatency'

const metadata: VoiceEvaluationMetadata = {
  browser: 'chrome',
  device: 'desktop',
  deviceProfile: 'primary',
  noise: 'quiet',
  audioOutput: 'speakers',
  startup: 'warm',
}

beforeEach(clearVoiceEvaluation)
afterEach(() => {
  clearVoiceEvaluation()
  vi.unstubAllGlobals()
})

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

describe('opt-in voice evaluations', () => {
  it('records nothing before opting in and stops collecting when finished', () => {
    const event = {
      name: 'started',
      captureId: 1,
      captureKind: 'continuous',
    } as const
    recordVoiceCaptureEvent(event)
    expect(getVoiceEvaluation()).toBeNull()
    startVoiceEvaluation(metadata)
    recordVoiceCaptureEvent(event)
    expect(getVoiceEvaluation()?.entries).toHaveLength(1)
    expect(() => startVoiceEvaluation(metadata)).toThrow(/Termina/)
    expect(finishVoiceEvaluation()?.finishedAt).not.toBeNull()
    recordVoiceCaptureEvent(event)
    recordVoiceLatency('pause', 'action', 0, 'success', 100)
    expect(getVoiceEvaluation()?.entries).toHaveLength(1)
    startVoiceEvaluation(metadata)
    expect(getVoiceEvaluation()?.entries).toHaveLength(0)
  })

  it('bounds one evaluation at 1000 entries and reports discarded entries', () => {
    startVoiceEvaluation(metadata)
    for (let index = 0; index < 1005; index++)
      recordVoiceCaptureEvent({
        name: 'started',
        captureId: index,
        captureKind: 'continuous',
      })
    expect(getVoiceEvaluation()).toMatchObject({
      limit: 1000,
      droppedEntries: 5,
      entries: expect.any(Array),
    })
    expect(getVoiceEvaluation()?.entries).toHaveLength(1000)
  })

  it('separates recognition bases and excludes unavailable durations from percentiles', () => {
    startVoiceEvaluation(metadata)
    recordVoiceRecognitionLatency('pause', {
      captureId: 7,
      firstResultAt: 0,
      speechEndedAt: 50,
      receivedAt: 100,
    })
    recordVoiceRecognitionLatency('pause', {
      firstResultAt: 0,
      receivedAt: 100,
    })
    recordVoiceRecognitionLatency('pause', {
      firstResultAt: 100,
      receivedAt: 100,
    })
    recordVoiceLatency('pause', 'action', 0, 'success', 30)
    recordVoiceLatency('pause', 'action', 0, 'error', 300)
    expect(getVoiceEvaluationSummary()).toEqual([
      {
        command: 'pause',
        phase: 'recognition',
        recognitionBasis: 'speech-end-event',
        outcome: 'success',
        count: 1,
        p50Ms: 50,
        p95Ms: 50,
      },
      {
        command: 'pause',
        phase: 'recognition',
        recognitionBasis: 'first-result',
        outcome: 'success',
        count: 1,
        p50Ms: 100,
        p95Ms: 100,
      },
      {
        command: 'pause',
        phase: 'action',
        outcome: 'success',
        count: 1,
        p50Ms: 30,
        p95Ms: 30,
      },
      {
        command: 'pause',
        phase: 'action',
        outcome: 'error',
        count: 1,
        p50Ms: 300,
        p95Ms: 300,
      },
    ])
  })

  it('calculates nearest-rank percentiles for a complete group', () => {
    startVoiceEvaluation(metadata)
    for (let duration = 100; duration > 0; duration--)
      recordVoiceLatency('next', 'action', 0, 'success', duration)
    expect(getVoiceEvaluationSummary()).toEqual([
      {
        command: 'next',
        phase: 'action',
        outcome: 'success',
        count: 100,
        p50Ms: 50,
        p95Ms: 95,
      },
    ])
  })

  it('exports defensive copies with metadata and timing only', () => {
    startVoiceEvaluation(metadata)
    recordVoiceCaptureEvent({
      name: 'final-result',
      captureId: 1,
      captureKind: 'question',
      resultIndex: 0,
    })
    recordVoiceLatency('next', 'action', 0, 'success', 50)
    const snapshot = getVoiceEvaluation()!
    snapshot.metadata.browser = 'other'
    snapshot.entries.splice(0)
    expect(getVoiceEvaluation()?.metadata.browser).toBe('chrome')
    expect(getVoiceEvaluation()?.entries).toHaveLength(2)
    const exported = exportVoiceEvaluation()
    expect(JSON.parse(exported)).toMatchObject({
      evaluation: { schemaVersion: 2, metadata },
      summary: [{ phase: 'action', p95Ms: 50 }],
    })
    expect(exported).not.toMatch(/transcript|audioBuffer|questionText/)
  })
})
