import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useState,
  type ReactNode,
} from 'react'
import type { PracticeSession, Routine } from '../domain/models'
import { sessionReducer } from '../domain/sessionMachine'
import { ApiError, api } from '../infrastructure/api/client'

interface SessionContextValue {
  session: PracticeSession | null
  isLoading: boolean
  start: (routine: Routine) => Promise<PracticeSession>
  pause: () => Promise<void>
  resume: () => Promise<void>
  next: () => Promise<void>
  previous: () => Promise<void>
  ask: () => Promise<void>
  closeQuestion: () => Promise<void>
  refresh: () => Promise<void>
  complete: () => Promise<void>
  clear: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, dispatch] = useReducer(sessionReducer, null)
  const [pendingSession, setPendingSession] = useState<PracticeSession | null>(
    null,
  )
  const [isLoading, setIsLoading] = useState(true)
  const activeSession = pendingSession ?? session
  const sessionId = activeSession?.id

  useEffect(() => {
    const storedId = window.localStorage.getItem('taichi.sessionId')
    if (!storedId) {
      setIsLoading(false)
      return
    }
    void api
      .getSession(storedId)
      .then((remoteSession) => {
        dispatch({ type: 'HYDRATE', session: remoteSession })
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) {
          window.localStorage.removeItem('taichi.sessionId')
        }
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [])

  useEffect(() => {
    if (session?.status !== 'PLAYING') return
    const interval = window.setInterval(() => dispatch({ type: 'TICK' }), 1000)
    return () => window.clearInterval(interval)
  }, [session?.status])

  useEffect(() => {
    if (pendingSession && session?.id === pendingSession.id)
      setPendingSession(null)
  }, [pendingSession, session?.id])

  const sync = async (action: Parameters<typeof api.transition>[1]) => {
    if (!sessionId) return
    const remoteSession = await api.transition(sessionId, action)
    dispatch({ type: 'HYDRATE', session: remoteSession })
  }

  const value: SessionContextValue = {
    session: activeSession,
    isLoading,
    start: async (routine) => {
      const remoteSession = await api.createSession(
        routine.id,
        window.localStorage.getItem('taichi.sessionId') ?? undefined,
      )
      window.localStorage.setItem('taichi.sessionId', remoteSession.id)
      setPendingSession(remoteSession)
      dispatch({ type: 'HYDRATE', session: remoteSession })
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      return remoteSession
    },
    pause: async () => {
      await sync('pause')
    },
    resume: async () => {
      await sync('resume')
    },
    next: async () => {
      await sync('next')
    },
    previous: async () => {
      await sync('previous')
    },
    ask: async () => {
      await sync('ask')
    },
    closeQuestion: async () => {
      await sync('close-question')
    },
    refresh: async () => {
      if (!sessionId) return
      const remoteSession = await api.getSession(sessionId)
      dispatch({ type: 'HYDRATE', session: remoteSession })
    },
    complete: async () => {
      await sync('complete')
    },
    clear: async () => {
      if (sessionId) await api.deleteSession(sessionId).catch(() => undefined)
      window.localStorage.removeItem('taichi.sessionId')
      dispatch({ type: 'CLEAR' })
    },
  }

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  )
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession requiere SessionProvider')
  return value
}
