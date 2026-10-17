import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { voiceServices } from '../../app/services'
import {
  guidanceStorageKey,
  practiceGuidance,
} from '../../application/practiceInteraction'
import { usePracticeGuidance } from './usePracticeGuidance'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.restoreAllMocks()
})

it('remembers completed explanations after remounting', async () => {
  const speak = vi.spyOn(voiceServices.tts, 'speak').mockResolvedValue()
  const first = renderHook(usePracticeGuidance)
  await act(async () =>
    first.result.current.playTip('essentials', new AbortController().signal),
  )
  first.unmount()
  const second = renderHook(usePracticeGuidance)
  await act(async () =>
    second.result.current.playTip('essentials', new AbortController().signal),
  )
  expect(speak).toHaveBeenCalledExactlyOnceWith(
    practiceGuidance.essentials.text,
  )
})

it('lets the user skip a pending explanation and remembers the choice', async () => {
  vi.spyOn(voiceServices.tts, 'speak').mockImplementation(
    () => new Promise<void>(() => {}),
  )
  const stop = vi.spyOn(voiceServices.tts, 'stop').mockImplementation(() => {})
  const { result } = renderHook(usePracticeGuidance)
  let pending: Promise<void> = Promise.resolve()
  act(() => {
    pending = result.current.playTip(
      'push-to-talk',
      new AbortController().signal,
    )
  })
  expect(result.current.activeTip).toBe('push-to-talk')
  await act(async () => {
    result.current.skipTip()
    await pending
  })
  expect(stop).toHaveBeenCalledOnce()
  expect(result.current.activeTip).toBeNull()
  expect(
    JSON.parse(window.localStorage.getItem(guidanceStorageKey)!),
  ).toContain('push-to-talk')
})

it('does not mark an interrupted explanation as completed', async () => {
  const speak = vi
    .spyOn(voiceServices.tts, 'speak')
    .mockImplementationOnce(() => new Promise<void>(() => {}))
    .mockResolvedValue(undefined)
  const { result } = renderHook(usePracticeGuidance)
  const controller = new AbortController()
  let pending: Promise<void> = Promise.resolve()
  act(() => {
    pending = result.current.playTip('essentials', controller.signal)
  })
  await act(async () => {
    controller.abort()
    await pending
  })
  expect(window.localStorage.getItem(guidanceStorageKey)).toBeNull()
  await act(async () =>
    result.current.playTip('essentials', new AbortController().signal),
  )
  expect(speak).toHaveBeenCalledTimes(2)
})

it('keeps working when browser storage is unavailable', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('Storage blocked')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Storage blocked')
  })
  const speak = vi.spyOn(voiceServices.tts, 'speak').mockResolvedValue()
  const { result } = renderHook(usePracticeGuidance)
  await act(async () =>
    result.current.playTip('essentials', new AbortController().signal),
  )
  await act(async () =>
    result.current.playTip('essentials', new AbortController().signal),
  )
  expect(speak).toHaveBeenCalledOnce()
})
