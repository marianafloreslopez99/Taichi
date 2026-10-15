import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './client'
import {
  clearVoiceEvaluation,
  getVoiceEvaluation,
  startVoiceEvaluation,
} from '../../application/voiceLatency'

beforeEach(() => {
  startVoiceEvaluation({
    browser: 'edge',
    device: 'desktop',
    deviceProfile: 'primary',
    noise: 'quiet',
    audioOutput: 'speakers',
    startup: 'warm',
  })
})
afterEach(() => {
  clearVoiceEvaluation()
  vi.unstubAllGlobals()
})

function measurements() {
  return getVoiceEvaluation()!.entries.flatMap((entry) =>
    entry.kind === 'latency' ? [entry.sample] : [],
  )
}

describe('session request diagnostics', () => {
  it('captures server timing while returning the original session payload', async () => {
    const session = { id: 'private-session-id', status: 'PAUSED' }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: session }), {
          headers: {
            'Server-Timing': 'server;dur=20, db-read;dur=5, db-write;dur=15',
          },
        }),
      ),
    )
    expect(await api.transition(session.id, 'pause')).toEqual(session)
    expect(measurements()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: 'pause',
          phase: 'http',
          outcome: 'success',
          httpStatus: 200,
        }),
        expect.objectContaining({
          command: 'pause',
          phase: 'db-write',
          durationMs: 15,
        }),
      ]),
    )
    expect(JSON.stringify(getVoiceEvaluation())).not.toContain(session.id)
  })
  it('preserves API errors and records their HTTP status', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              error: {
                code: 'INVALID_SESSION_TRANSITION',
                message: 'No se puede continuar',
              },
            }),
            { status: 409 },
          ),
        ),
    )
    await expect(
      api.transition('private-session-id', 'resume'),
    ).rejects.toBeInstanceOf(ApiError)
    expect(measurements()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: 'resume',
          phase: 'http',
          outcome: 'error',
          httpStatus: 409,
        }),
      ]),
    )
  })
  it('preserves a network rejection without inventing response measurements', async () => {
    const failure = new TypeError('Failed to fetch')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(failure))
    await expect(api.transition('private-session-id', 'next')).rejects.toBe(
      failure,
    )
    expect(measurements()).toEqual([
      expect.objectContaining({
        command: 'next',
        phase: 'http',
        outcome: 'error',
      }),
    ])
  })
})
