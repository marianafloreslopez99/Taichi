import { afterEach, describe, expect, it } from 'vitest'
import { recordSessionRequestTiming } from './sessionRequestTiming'
import {
  clearVoiceEvaluation,
  getVoiceEvaluation,
  startVoiceEvaluation,
} from './voiceLatency'

afterEach(clearVoiceEvaluation)

function samples() {
  return getVoiceEvaluation()!.entries.flatMap((entry) =>
    entry.kind === 'latency' ? [entry.sample] : [],
  )
}

function start() {
  startVoiceEvaluation({
    browser: 'edge',
    device: 'desktop',
    deviceProfile: 'primary',
    noise: 'quiet',
    audioOutput: 'speakers',
    startup: 'warm',
  })
}

describe('session request timing', () => {
  it('separates HTTP, body and server stages using a shared request id', () => {
    start()
    recordSessionRequestTiming(
      'pause',
      {
        startedAt: 0,
        headersAt: 90,
        endedAt: 100,
        httpStatus: 200,
        serverTiming: 'server;dur=85, db-read;dur=20, db-write;dur=65',
      },
      'success',
    )
    expect(
      samples().map(({ phase, durationMs }) => [phase, durationMs]),
    ).toEqual([
      ['http', 100],
      ['http-headers', 90],
      ['response-body', 10],
      ['server', 85],
      ['db-read', 20],
      ['db-write', 65],
    ])
    expect(new Set(samples().map(({ requestId }) => requestId)).size).toBe(1)
    expect(samples().every(({ httpStatus }) => httpStatus === 200)).toBe(true)
  })

  it('keeps network failures without inventing server or body durations', () => {
    start()
    recordSessionRequestTiming(
      'resume',
      { startedAt: 10, endedAt: 50 },
      'error',
    )
    expect(samples()).toEqual([
      expect.objectContaining({
        phase: 'http',
        durationMs: 40,
        outcome: 'error',
      }),
    ])
  })

  it('ignores unknown or malformed server fields and preserves the HTTP measurement', () => {
    start()
    recordSessionRequestTiming(
      'next',
      {
        startedAt: 0,
        headersAt: 90,
        endedAt: 100,
        serverTiming:
          'secret;dur=20, db-read;dur=NaN, db-write;dur=-1, server;dur=.., db-elapsed;dur=3',
      },
      'success',
    )
    expect(samples().map(({ phase }) => phase)).toEqual([
      'http',
      'http-headers',
      'response-body',
      'db-elapsed',
    ])
  })
})
