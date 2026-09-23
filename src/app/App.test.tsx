import { render } from '@testing-library/react'
import { screen, waitFor } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { voiceServices } from './services'
import { App } from './App'
import { routines } from '../infrastructure/routines'
import type { PracticeSession } from '../domain/models'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('practice journey', () => {
  it('starts, repeats, pauses, resumes and navigates a movement', async () => {
    window.history.pushState({}, '', '/')
    let session: PracticeSession = {
      id: '00000000-0000-4000-8000-000000000001',
      routineId: 'forma-basica-taichi',
      currentMovementIndex: 0,
      status: 'PLAYING',
      startedAt: Date.now(),
      completedAt: null,
      elapsedSeconds: 0,
      questions: [],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)
        if (path.endsWith('/routines'))
          return new Response(JSON.stringify({ data: routines }), {
            status: 200,
          })
        if (path.endsWith('/routines/forma-basica-taichi'))
          return new Response(JSON.stringify({ data: routines[0] }), {
            status: 200,
          })
        if (path.endsWith('/sessions') && init?.method === 'POST')
          return new Response(JSON.stringify({ data: session }), {
            status: 201,
          })
        const action = path.split('/').pop()
        if (action === 'pause') session = { ...session, status: 'PAUSED' }
        if (action === 'resume') session = { ...session, status: 'PLAYING' }
        if (action === 'next') session = { ...session, currentMovementIndex: 1 }
        if (action === 'previous')
          session = { ...session, currentMovementIndex: 0 }
        if (action === 'ask') session = { ...session, status: 'ASKING' }
        if (action === 'close-question')
          session = { ...session, status: 'PAUSED' }
        if (action === 'complete') session = { ...session, status: 'COMPLETED' }
        return new Response(JSON.stringify({ data: session }), { status: 200 })
      }),
    )
    vi.stubGlobal('scrollTo', vi.fn())
    const speak = vi.spyOn(voiceServices.tts, 'speak').mockResolvedValue()
    vi.spyOn(voiceServices.tts, 'stop').mockImplementation(() => {})
    const user = userEvent.setup()
    render(<App />)

    await user.click(
      (
        await screen.findAllByRole('button', { name: /Elegir esta rutina/i })
      )[0]!,
    )

    expect(
      await screen.findByRole('heading', { name: 'Apertura' }),
    ).toBeInTheDocument()
    const callsBeforeRepeat = speak.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Repetir' }))
    expect(speak.mock.calls.length).toBeGreaterThan(callsBeforeRepeat)
    await user.click(screen.getByRole('button', { name: 'Pausar' }))
    expect(screen.getByRole('status')).toHaveTextContent('En pausa')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    await waitFor(() =>
      expect(
        speak.mock.calls.filter(
          ([text]) =>
            text === 'Coloca los pies separados y adopta una postura cómoda.',
        ).length,
      ).toBeGreaterThanOrEqual(3),
    )
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(
      screen.getByRole('heading', { name: 'Acariciar la Crin del Caballo' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(
      await screen.findByRole('heading', { name: 'Apertura' }),
    ).toBeInTheDocument()
  })
})
