import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSessionTiming } from './sessionTiming'

afterEach(() => vi.restoreAllMocks())

describe('session timing', () => {
  it('measures successful and failed operations without swallowing the failure', async () => {
    let now = 100
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const timing = createSessionTiming()
    await timing.measure('db-read', async () => {
      now += 20
      return 'session'
    })
    await expect(
      timing.measure('db-write', async () => {
        now += 30
        throw new Error('DB unavailable')
      }),
    ).rejects.toThrow('DB unavailable')
    expect(timing.header()).toBe(
      'server;dur=50.000, db-read;dur=20.000, db-write;dur=30.000',
    )
  })
})
