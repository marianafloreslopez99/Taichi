import { useCallback, useEffect, useReducer, useRef } from 'react'

const MAX_PENDING_COMMANDS = 10

/** Start each job after a React commit, so it sees the preceding session update. */
export function useCommandQueue<T>(
  execute: (item: T, signal: AbortSignal) => Promise<void>,
  onFailure: (item: T, error: unknown) => void,
) {
  const waiting = useRef<T[]>([])
  const active = useRef<AbortController | null>(null)
  const pendingRef = useRef(false)
  const [revision, wake] = useReducer((value: number) => value + 1, 0)

  const enqueue = useCallback((item: T, urgent = false) => {
    if (
      waiting.current.length + Number(active.current !== null) >=
      MAX_PENDING_COMMANDS + Number(urgent)
    )
      return false
    waiting.current.push(item)
    pendingRef.current = true
    wake()
    return true
  }, [])

  const clearWaiting = useCallback(() => {
    const removed = waiting.current.splice(0)
    pendingRef.current = active.current !== null
    wake()
    return removed
  }, [])

  useEffect(() => {
    if (active.current || waiting.current.length === 0) return
    const item = waiting.current.shift()!
    const controller = new AbortController()
    active.current = controller
    void (async () => {
      try {
        await execute(item, controller.signal)
      } catch (error) {
        if (!controller.signal.aborted) onFailure(item, error)
      } finally {
        if (!controller.signal.aborted) {
          active.current = null
          pendingRef.current = waiting.current.length > 0
          wake()
        }
      }
    })()
  }, [execute, onFailure, revision])

  useEffect(
    () => () => {
      waiting.current = []
      active.current?.abort()
      active.current = null
      pendingRef.current = false
    },
    [],
  )

  return { enqueue, clearWaiting, pendingRef }
}
