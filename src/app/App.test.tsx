import { act, render } from '@testing-library/react'
import { screen, waitFor, within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { voiceServices } from './services'
import { App } from './App'
import { routines } from '../infrastructure/routines'
import type { PracticeSession } from '../domain/models'

class FakeContinuousRecognition {
  static current: FakeContinuousRecognition
  lang = ''
  continuous = false
  interimResults = false
  onstart: (() => void) | null = null
  onresult:
    | ((event: {
        resultIndex: number
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
      }) => void)
    | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  private results: Array<{ isFinal: boolean; 0: { transcript: string } }> = []

  constructor() {
    FakeContinuousRecognition.current = this
  }

  start() {
    this.onstart?.()
  }

  abort() {}

  emit(transcript: string) {
    this.results.push({ isFinal: true, 0: { transcript } })
    this.onresult?.({
      resultIndex: this.results.length - 1,
      results: this.results,
    })
  }

  emitInterim(transcript: string) {
    this.results.push({ isFinal: false, 0: { transcript } })
    this.onresult?.({
      resultIndex: this.results.length - 1,
      results: this.results,
    })
  }
}

function say(transcript: string) {
  act(() => FakeContinuousRecognition.current.emit(transcript))
}

function sayInterim(transcript: string) {
  act(() => FakeContinuousRecognition.current.emitInterim(transcript))
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('practice journey', () => {
  it('controls the routine and asks Gemini hands-free', async () => {
    window.history.pushState({}, '', '/')
    vi.stubGlobal('SpeechRecognition', FakeContinuousRecognition)
    let session: PracticeSession = {
      id: '00000000-0000-4000-8000-000000000001',
      routineId: 'primeros-movimientos',
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
        if (path.endsWith('/routines/primeros-movimientos'))
          return new Response(JSON.stringify({ data: routines[0] }), {
            status: 200,
          })
        if (path.endsWith('/sessions') && init?.method === 'POST')
          return new Response(JSON.stringify({ data: session }), {
            status: 201,
          })
        if (path.endsWith('/questions') && init?.method === 'POST') {
          const input = JSON.parse(String(init.body)) as {
            movementId: string
            question: string
          }
          const answer = {
            text: 'Abre los brazos al inhalar, sin forzar el ritmo.',
            requiresProfessionalAdvice: false,
          }
          session = {
            ...session,
            questions: [
              ...session.questions,
              {
                id: '00000000-0000-4000-8000-000000000002',
                sessionId: session.id,
                movementId: input.movementId,
                question: input.question,
                answer: answer.text,
                createdAt: Date.now(),
              },
            ],
          }
          return new Response(JSON.stringify({ data: answer }), {
            status: 201,
          })
        }
        const action = path.split('/').pop()
        if (action === 'pause') session = { ...session, status: 'PAUSED' }
        if (action === 'resume') session = { ...session, status: 'PLAYING' }
        if (action === 'next')
          session = {
            ...session,
            currentMovementIndex: session.currentMovementIndex + 1,
          }
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
    const stopNarration = vi
      .spyOn(voiceServices.tts, 'stop')
      .mockImplementation(() => {})
    const listen = vi
      .spyOn(voiceServices.stt, 'listen')
      .mockResolvedValue('¿Cómo coordino la respiración?')
    vi.spyOn(voiceServices.stt, 'stop').mockImplementation(() => {})
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
    expect(
      screen.getByRole('img', {
        name: 'Coloca los pies separados y adopta una postura cómoda.',
      }),
    ).toHaveAttribute('src', '/img/routines/1.jpg')
    expect(screen.getByText('Micrófono atento')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Apagar micrófono' }))
    expect(screen.getByText('Micrófono apagado')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Activar micrófono' }))
    expect(screen.getByText('Micrófono atento')).toBeInTheDocument()
    say('La siguiente postura será después')
    expect(
      screen.getByRole('heading', { name: 'Apertura' }),
    ).toBeInTheDocument()
    say('Pausar')
    await waitFor(() =>
      expect(screen.getByText('En pausa')).toBeInTheDocument(),
    )
    say('Continuar')
    await waitFor(() =>
      expect(screen.getByText('En movimiento')).toBeInTheDocument(),
    )
    const stopsBeforeWake = stopNarration.mock.calls.length
    sayInterim('Oye, tengo una pregunta')
    expect(stopNarration.mock.calls.length).toBeGreaterThan(stopsBeforeWake)
    expect(screen.getByText('Dinos tu pregunta')).toBeInTheDocument()
    expect(screen.getByText('En movimiento')).toBeInTheDocument()
    expect(session.questions).toHaveLength(0)
    say('Oye')
    expect(screen.getByText('Dinos tu pregunta')).toBeInTheDocument()
    say('¿Cómo coordino la respiración?')
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText('La guía está en pausa mientras preguntas'),
    ).toBeInTheDocument()
    expect(listen).not.toHaveBeenCalled()
    expect(
      await within(dialog).findByText(/¿Cómo coordino la respiración\?/),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        'Abre los brazos al inhalar, sin forzar el ritmo.',
      ),
    ).toBeInTheDocument()
    await screen.findByRole('button', { name: /continuar rutina/i })
    say('Continuar')
    await waitFor(() =>
      expect(screen.getByText('En movimiento')).toBeInTheDocument(),
    )
    await waitFor(() =>
      expect(screen.getByText('Micrófono atento')).toBeInTheDocument(),
    )
    const callsBeforeRepeat = speak.mock.calls.length
    say('Repetir')
    await waitFor(() =>
      expect(speak.mock.calls.length).toBeGreaterThan(callsBeforeRepeat),
    )
    await waitFor(() =>
      expect(
        speak.mock.calls.filter(
          ([text]) =>
            text === 'Coloca los pies separados y adopta una postura cómoda.',
        ).length,
      ).toBeGreaterThanOrEqual(3),
    )
    say('Siguiente')
    expect(
      await screen.findByRole('heading', {
        name: 'Acariciar la Crin del Caballo',
      }),
    ).toBeInTheDocument()
    say('Anterior')
    expect(
      await screen.findByRole('heading', { name: 'Apertura' }),
    ).toBeInTheDocument()
    say('Finalizar')
    expect(
      screen.getByText('Puedes finalizar cuando llegues al último movimiento.'),
    ).toBeInTheDocument()
    say('Siguiente')
    await screen.findByRole('heading', {
      name: 'Acariciar la Crin del Caballo',
    })
    say('Siguiente')
    await screen.findByRole('heading', {
      name: 'Grulla Blanca Extiende las Alas',
    })
    say('Finalizar')
    await waitFor(() => expect(window.location.pathname).toBe('/resumen'))
    expect(session.status).toBe('COMPLETED')
  })
})
