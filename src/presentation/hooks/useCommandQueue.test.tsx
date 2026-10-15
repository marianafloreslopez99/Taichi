import { useState } from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCommandQueue } from './useCommandQueue'

afterEach(cleanup)

describe('command queue', () => {
  it('executes in order with the state committed by the previous job', async () => {
    let release: () => void = () => {}
    const committed: number[] = []
    const failure = vi.fn()
    const { result } = renderHook(() => {
      const [position, setPosition] = useState(0)
      return useCommandQueue<number>(async (delta) => {
        committed.push(position)
        if (committed.length === 1)
          await new Promise<void>((resolve) => {
            release = resolve
          })
        setPosition(position + delta)
      }, failure)
    })
    act(() => {
      result.current.enqueue(1)
      result.current.enqueue(2)
      result.current.enqueue(-1)
    })
    expect(committed).toEqual([0])
    expect(result.current.pendingRef.current).toBe(true)
    await act(async () => release())
    await waitFor(() => expect(committed).toEqual([0, 1, 3]))
    expect(result.current.pendingRef.current).toBe(false)
    expect(failure).not.toHaveBeenCalled()
  })

  it('bounds the queue and can discard waiting jobs without canceling the active job', async () => {
    let release: () => void = () => {}
    const execute = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const { result } = renderHook(() => useCommandQueue(execute, vi.fn()))
    act(() => {
      expect(result.current.enqueue('first')).toBe(true)
    })
    act(() => {
      for (let index = 0; index < 9; index++)
        expect(result.current.enqueue(`waiting-${index}`)).toBe(true)
      expect(result.current.enqueue('overflow')).toBe(false)
      expect(result.current.enqueue('urgent-pause', true)).toBe(true)
      expect(result.current.enqueue('urgent-overflow', true)).toBe(false)
      expect(result.current.clearWaiting()).toHaveLength(10)
    })
    expect(result.current.pendingRef.current).toBe(true)
    await act(async () => release())
    expect(execute).toHaveBeenCalledTimes(1)
    expect(result.current.pendingRef.current).toBe(false)
  })

  it('invalidates the active job and drops waiting jobs on unmount', async () => {
    let release: () => void = () => {}
    let signal: AbortSignal | undefined
    const execute = vi.fn(
      async (_item: string, capturedSignal: AbortSignal) => {
        signal = capturedSignal
        await new Promise<void>((resolve) => {
          release = resolve
        })
      },
    )
    const failure = vi.fn()
    const { result, unmount } = renderHook(() =>
      useCommandQueue(execute, failure),
    )
    act(() => {
      result.current.enqueue('first')
      result.current.enqueue('second')
    })
    unmount()
    expect(signal?.aborted).toBe(true)
    await act(async () => release())
    expect(execute).toHaveBeenCalledTimes(1)
    expect(failure).not.toHaveBeenCalled()
  })
})
