import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useContinuousVoiceControl } from './useContinuousVoiceControl'

class Recognition {
  static instances: Recognition[] = []
  onstart: (() => void) | null = null
  start = vi.fn(() => this.onstart?.())
  abort = vi.fn()
  constructor() {
    Recognition.instances.push(this)
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  Recognition.instances = []
})

it('never reopens push-to-talk after suspension or re-enabling until the user presses again', () => {
  vi.stubGlobal('SpeechRecognition', Recognition)
  const { result, rerender, unmount } = renderHook(
    ({ active }) => useContinuousVoiceControl(active, vi.fn()),
    { initialProps: { active: true } },
  )
  expect(Recognition.instances).toHaveLength(1)
  act(() => result.current.setMode('push-to-talk'))
  expect(result.current.status).toBe('ready')
  act(() => result.current.talk())
  expect(Recognition.instances).toHaveLength(2)
  expect(result.current.capturing).toBe(true)
  rerender({ active: false })
  expect(result.current.capturing).toBe(false)
  expect(Recognition.instances[1]!.abort).toHaveBeenCalledOnce()
  rerender({ active: true })
  expect(result.current.status).toBe('ready')
  expect(Recognition.instances).toHaveLength(2)
  act(() => result.current.talk())
  expect(Recognition.instances).toHaveLength(3)
  act(() => result.current.toggle())
  expect(result.current.status).toBe('off')
  act(() => result.current.toggle())
  expect(result.current.status).toBe('ready')
  expect(Recognition.instances).toHaveLength(3)
  act(() => result.current.setMode('continuous'))
  expect(Recognition.instances).toHaveLength(4)
  expect(result.current.status).toBe('listening')
  unmount()
  expect(Recognition.instances[3]!.abort).toHaveBeenCalledOnce()
})
