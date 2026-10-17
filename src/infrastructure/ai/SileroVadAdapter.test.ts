import { describe, expect, it, vi } from 'vitest'
import {
  SileroVadAdapter,
  type VoiceActivityCallbacks,
} from './SileroVadAdapter'

function callbacks(): VoiceActivityCallbacks {
  return {
    onReady: vi.fn(),
    onSpeechStart: vi.fn(),
    onSpeechEnd: vi.fn(),
    onMisfire: vi.fn(),
    onError: vi.fn(),
  }
}

describe('SileroVadAdapter', () => {
  it('loads once, applies each owner profile and pauses the current owner', async () => {
    const instance = {
      start: vi.fn(async () => undefined),
      pause: vi.fn(async () => undefined),
      destroy: vi.fn(async () => undefined),
      setOptions: vi.fn(),
    }
    const factory = vi.fn(async () => instance)
    const adapter = new SileroVadAdapter('observe', factory)
    const commandOwner = {}
    const questionOwner = {}
    const commandCallbacks = callbacks()
    const questionCallbacks = callbacks()

    adapter.start(commandOwner, 'command', commandCallbacks)
    await vi.waitFor(() => expect(instance.start).toHaveBeenCalledTimes(1))
    expect(factory).toHaveBeenCalledOnce()
    expect(instance.setOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ redemptionMs: 500 }),
    )
    expect(commandCallbacks.onReady).toHaveBeenCalledOnce()

    adapter.stop(commandOwner)
    adapter.start(questionOwner, 'question', questionCallbacks)
    await vi.waitFor(() => expect(instance.start).toHaveBeenCalledTimes(2))
    expect(instance.pause).toHaveBeenCalledTimes(2)
    expect(instance.setOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ redemptionMs: 1_000 }),
    )
    expect(factory).toHaveBeenCalledOnce()
    await adapter.destroy()
    expect(instance.destroy).toHaveBeenCalledOnce()
  })

  it('invalidates stale callbacks as soon as ownership changes', async () => {
    let libraryCallbacks: Partial<VoiceActivityCallbacks> = {}
    const instance = {
      start: vi.fn(async () => undefined),
      pause: vi.fn(async () => undefined),
      destroy: vi.fn(async () => undefined),
      setOptions: vi.fn(),
    }
    const adapter = new SileroVadAdapter('endpoint', async (options) => {
      libraryCallbacks = {
        onSpeechStart: options.onSpeechStart,
        onSpeechEnd: () => options.onSpeechEnd?.(new Float32Array()),
        onMisfire: options.onVADMisfire,
      }
      return instance
    })
    const first = callbacks()
    const second = callbacks()
    adapter.start({}, 'command', first)
    await vi.waitFor(() => expect(instance.start).toHaveBeenCalledOnce())
    adapter.start({}, 'question', second)
    libraryCallbacks.onSpeechEnd?.()
    expect(first.onSpeechEnd).not.toHaveBeenCalled()
    expect(second.onSpeechEnd).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(instance.start).toHaveBeenCalledTimes(2))
    libraryCallbacks.onSpeechEnd?.()
    expect(second.onSpeechEnd).toHaveBeenCalledOnce()
    await adapter.destroy()
  })

  it('does not load the runtime while disabled', async () => {
    const factory = vi.fn()
    const adapter = new SileroVadAdapter('off', factory)
    adapter.start({}, 'command', callbacks())
    expect(factory).not.toHaveBeenCalled()
    await adapter.destroy()
  })

  it('drops an errored runtime so a later capture can retry cleanly', async () => {
    const failed = {
      start: vi.fn(async () => {
        throw new Error('permission denied')
      }),
      pause: vi.fn(async () => undefined),
      destroy: vi.fn(async () => undefined),
      setOptions: vi.fn(),
    }
    const recovered = {
      start: vi.fn(async () => undefined),
      pause: vi.fn(async () => undefined),
      destroy: vi.fn(async () => undefined),
      setOptions: vi.fn(),
    }
    const factory = vi
      .fn()
      .mockResolvedValueOnce(failed)
      .mockResolvedValueOnce(recovered)
    const adapter = new SileroVadAdapter('observe', factory)
    const first = callbacks()
    adapter.start({}, 'command', first)
    await vi.waitFor(() => expect(first.onError).toHaveBeenCalledOnce())
    expect(failed.destroy).toHaveBeenCalledOnce()

    const second = callbacks()
    adapter.start({}, 'question', second)
    await vi.waitFor(() => expect(second.onReady).toHaveBeenCalledOnce())
    expect(factory).toHaveBeenCalledTimes(2)
    await adapter.destroy()
  })
})
