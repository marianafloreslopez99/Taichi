import { useCallback, useEffect, useReducer, useRef } from 'react'

const MAX_PENDING_COMMANDS = 10

/** Start each job after a React commit, so it sees the preceding session update. */
export function useCommandQueue<T>(
  execute: (item: T, signal: AbortSignal) => Promise<void>,
  onFailure: (item: T, error: unknown) => void,
  onPendingChange?: (pending: boolean) => void,
) {
  const waiting = useRef<T[]>([])
  const active = useRef<AbortController | null>(null)
  const pendingRef = useRef(false)
  const onPendingChangeRef = useRef(onPendingChange)
  onPendingChangeRef.current = onPendingChange
  const [revision, wake] = useReducer((value: number) => value + 1, 0)

  const setPending = useCallback((pending: boolean) => {
    pendingRef.current = pending
    onPendingChangeRef.current?.(pending)
  }, [])

  const enqueue = useCallback(
    (item: T, urgent = false) => {
      if (
        waiting.current.length + Number(active.current !== null) >=
        MAX_PENDING_COMMANDS + Number(urgent)
      )
        return false
      waiting.current.push(item)
      setPending(true)
      wake()
      return true
    },
    [setPending],
  )

  const clearWaiting = useCallback(() => {
    const removed = waiting.current.splice(0)
    setPending(active.current !== null)
    wake()
    return removed
  }, [setPending])

  const cancelAll = useCallback(() => {
    const removed = waiting.current.splice(0)
    active.current?.abort()
    active.current = null
    setPending(false)
    wake()
    return removed
  }, [setPending])

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
          setPending(waiting.current.length > 0)
          wake()
        }
      }
    })()
  }, [execute, onFailure, revision, setPending])

  useEffect(
    () => () => {
      waiting.current = []
      active.current?.abort()
      active.current = null
      pendingRef.current = false
    },
    [],
  )

  return { enqueue, clearWaiting, cancelAll, pendingRef }
}
