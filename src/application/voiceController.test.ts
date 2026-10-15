import { describe, expect, it, vi } from 'vitest'
import { VoiceController } from './voiceController'

describe('voice capture ownership', () => {
  it('invalidates the previous lease before cancelling its owner', () => {
    const controller = new VoiceController()
    const cancel = vi.fn(() => expect(controller.isCurrent(first)).toBe(false))
    const first = controller.begin(1, 'continuous', cancel)
    const second = controller.begin(2, 'question', vi.fn())
    expect(cancel).toHaveBeenCalledOnce()
    expect(controller.isCurrent(first)).toBe(false)
    expect(controller.isCurrent(second)).toBe(true)
    controller.end(first)
    expect(controller.isCurrent(second)).toBe(true)
  })

  it('closes the current intervention once and keeps it owned until completion', () => {
    const controller = new VoiceController()
    const capture = controller.begin(1, 'push-to-talk', vi.fn())
    expect(controller.requestFinish(capture)).toBe(true)
    expect(controller.requestFinish(capture)).toBe(false)
    expect(controller.getState()).toEqual({
      status: 'FINALIZING',
      intervention: capture,
    })
    expect(controller.isCurrent(capture)).toBe(true)
    controller.end(capture)
    expect(controller.getState()).toEqual({ status: 'IDLE' })
    expect(controller.requestFinish(capture)).toBe(false)
  })

  it('retains ownership while reconnecting so a new owner can cancel the retry', () => {
    const controller = new VoiceController()
    const cancel = vi.fn()
    const first = controller.begin(1, 'continuous', cancel)
    controller.reconnect(first)
    expect(controller.getState()).toEqual({
      status: 'RECONNECTING',
      intervention: first,
    })
    expect(controller.requestFinish(first)).toBe(false)
    const question = controller.begin(2, 'question', vi.fn())
    controller.reconnect(first)
    expect(cancel).toHaveBeenCalledOnce()
    expect(controller.getState()).toEqual({
      status: 'CAPTURING',
      intervention: question,
    })
  })

  it('uses lease identity even if different callers reuse an id', () => {
    const controller = new VoiceController()
    const first = controller.begin(1, 'continuous', vi.fn())
    const second = controller.begin(1, 'continuous', vi.fn())
    expect(controller.isCurrent(first)).toBe(false)
    expect(controller.isCurrent(second)).toBe(true)
    expect(Object.isFrozen(second)).toBe(true)
  })
})
