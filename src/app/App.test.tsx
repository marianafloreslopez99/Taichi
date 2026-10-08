import { act, cleanup, render } from '@testing-library/react'
import { screen, waitFor, within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { voiceServices } from './services'
import { App } from './App'
import { routines } from '../infrastructure/routines'
import type { PracticeSession } from '../domain/models'
import {
  catalogWelcome,
  routineIntroduction,
  voiceCommandSections,
} from '../application/practiceInteraction'
import { finishConfirmationPrompt } from '../presentation/components/FinishConfirmation'
import { queryClient } from './queryClient'
import { getVoiceLatencySamples } from '../application/voiceLatency'

class FakeContinuousRecognition {
  static current: FakeContinuousRecognition
  static instances: FakeContinuousRecognition[] = []
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
    FakeContinuousRecognition.instances.push(this)
  }

  start() {
    this.onstart?.()
  }

  abort() {}
  stop = vi.fn()

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
  cleanup()
  queryClient.clear()
  window.localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  FakeContinuousRecognition.instances = []
})

async function startVoicePractice(
  transition?: (action: string) => Promise<Response | undefined>,
) {
  window.history.pushState({}, '', '/')
  vi.stubGlobal('SpeechRecognition', FakeContinuousRecognition)
  let session: PracticeSession = {
    id: '00000000-0000-4000-8000-000000000009',
    routineId: routines[0]!.id,
    currentMovementIndex: 0,
    status: 'PLAYING',
    startedAt: Date.now(),
    completedAt: null,
    elapsedSeconds: 0,
    questions: [],
  }
  const transitions: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input)
      if (path.endsWith('/routines'))
        return new Response(JSON.stringify({ data: routines }))
      if (path.endsWith(`/routines/${session.routineId}`))
        return new Response(JSON.stringify({ data: routines[0] }))
      const action = path.split('/').pop()!
      if (
        ['pause', 'resume', 'next', 'previous', 'complete'].includes(action)
      ) {
        transitions.push(action)
        const response = await transition?.(action)
        if (response) return response
        if (action === 'pause') session = { ...session, status: 'PAUSED' }
        if (action === 'resume') session = { ...session, status: 'PLAYING' }
        if (action === 'next')
          session = {
            ...session,
            currentMovementIndex: session.currentMovementIndex + 1,
          }
        if (action === 'previous')
          session = {
            ...session,
            currentMovementIndex: session.currentMovementIndex - 1,
          }
        if (action === 'complete')
          session = { ...session, status: 'COMPLETED', completedAt: Date.now() }
      }
      return new Response(JSON.stringify({ data: session }))
    }),
  )
  const speak = vi.spyOn(voiceServices.tts, 'speak').mockResolvedValue()
  const stop = vi.spyOn(voiceServices.tts, 'stop').mockImplementation(() => {})
  const user = userEvent.setup()
  render(<App />)
  await user.click(
    (await screen.findAllByRole('button', { name: /Elegir esta rutina/i }))[0]!,
  )
  await screen.findByText('Micrófono atento')
  return { user, speak, stop, transitions, getSession: () => session }
}

describe('practice journey', () => {
  it('stops provisional pause audio immediately, rolls back corrections, and executes the confirmed command once', async () => {
    let finishPause: () => void = () => {}
    const { speak, stop, transitions, getSession } = await startVoicePractice(
      async (action) => {
        if (action === 'pause')
          await new Promise<void>((resolve) => {
            finishPause = resolve
          })
        return undefined
      },
    )
    const beforePause = stop.mock.calls.length
    sayInterim('Pausar')
    expect(stop).toHaveBeenCalledTimes(beforePause + 1)
    expect(screen.getByRole('button', { name: 'Pausar' })).toHaveClass(
      'control-button--active',
    )
    expect(
      screen.getByText('Detecté «Pausar». Confirmando…'),
    ).toBeInTheDocument()
    expect(getSession().status).toBe('PLAYING')
    expect(transitions).toHaveLength(0)
    sayInterim('Pausar')
    expect(stop).toHaveBeenCalledTimes(beforePause + 1)
    const beforeCorrection = speak.mock.calls.length
    say('Pausar no, estaba hablando con alguien')
    expect(screen.getByRole('button', { name: 'Pausar' })).not.toHaveClass(
      'control-button--active',
    )
    await waitFor(() =>
      expect(speak.mock.calls.length).toBeGreaterThan(beforeCorrection),
    )
    expect(transitions).toHaveLength(0)
    sayInterim('Pausar')
    say('Pausar')
    expect(screen.getByText('Detecté «Pausar». Aplicando…')).toBeInTheDocument()
    say('Pausar')
    say('Siguiente')
    expect(transitions).toEqual(['pause'])
    expect(screen.getByRole('button', { name: 'Pausar' })).toHaveClass(
      'control-button--active',
    )
    expect(screen.getByRole('button', { name: 'Siguiente' })).not.toHaveClass(
      'control-button--active',
    )
    vi.useFakeTimers()
    await act(async () => finishPause())
    expect(screen.getByText('En pausa')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuar' })).toHaveClass(
      'control-button--active',
    )
    await act(async () => vi.advanceTimersByTime(1000))
    expect(screen.getByRole('button', { name: 'Continuar' })).not.toHaveClass(
      'control-button--active',
    )
    vi.useRealTimers()
    expect(screen.getByText('«Pausar» realizado.')).toBeInTheDocument()
    expect(getVoiceLatencySamples()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ command: 'pause', phase: 'recognition' }),
        expect.objectContaining({ command: 'pause', phase: 'audio-stop' }),
        expect.objectContaining({ command: 'pause', phase: 'action' }),
      ]),
    )
  })

  it('recovers from an unconfirmed pause timeout and a failed pause request', async () => {
    const { speak, transitions } = await startVoicePractice(async (action) =>
      action === 'pause'
        ? new Response(
            JSON.stringify({
              error: { code: 'TEMPORARY_ERROR', message: 'Reintenta' },
            }),
            { status: 500 },
          )
        : undefined,
    )
    vi.useFakeTimers()
    sayInterim('Pausar')
    const beforeTimeout = speak.mock.calls.length
    await act(async () => vi.advanceTimersByTime(4000))
    expect(screen.getByRole('button', { name: 'Pausar' })).not.toHaveClass(
      'control-button--active',
    )
    expect(speak.mock.calls.length).toBeGreaterThan(beforeTimeout)
    expect(transitions).toHaveLength(0)
    expect(
      screen.getByText('No se confirmó la pausa. Puedes pulsar Pausar.'),
    ).toBeInTheDocument()
    vi.useRealTimers()
    sayInterim('Pausar')
    const beforeFailure = speak.mock.calls.length
    say('Pausar')
    await screen.findByText(
      'No se pudo ejecutar el comando de voz. Inténtalo de nuevo.',
    )
    expect(speak.mock.calls.length).toBeGreaterThan(beforeFailure)
    expect(screen.getByText('En movimiento')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pausar' })).not.toHaveClass(
      'control-button--active',
    )
    expect(getVoiceLatencySamples()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: 'pause',
          phase: 'action',
          outcome: 'error',
        }),
      ]),
    )
  })

  it('only listens after pressing in push-to-talk mode, preserves final results, and confirms finish in the dialog', async () => {
    const { user, transitions, getSession } = await startVoicePractice()
    const selector = screen.getByRole('combobox', { name: 'Modo de voz' })
    await user.selectOptions(selector, 'push-to-talk')
    expect(screen.getByText('Pulsa para hablar')).toBeInTheDocument()
    const initialListeners = FakeContinuousRecognition.instances.length
    say('Siguiente')
    expect(transitions).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Pulsar para hablar' }))
    expect(FakeContinuousRecognition.current.continuous).toBe(false)
    say('Siguiente')
    await screen.findByRole('heading', {
      name: 'Acariciar la Crin del Caballo',
    })
    expect(screen.getByRole('button', { name: 'Siguiente' })).toHaveClass(
      'control-button--active',
    )
    expect(FakeContinuousRecognition.instances).toHaveLength(
      initialListeners + 1,
    )
    say('Siguiente')
    expect(transitions).toEqual(['next'])
    await user.click(screen.getByRole('button', { name: 'Pulsar para hablar' }))
    sayInterim('Pausar')
    await user.click(screen.getByRole('button', { name: 'Terminar escucha' }))
    expect(FakeContinuousRecognition.current.stop).toHaveBeenCalledOnce()
    say('Pausar')
    await screen.findByText('En pausa')
    await user.click(screen.getByRole('button', { name: 'Pulsar para hablar' }))
    say('Continuar')
    await screen.findByText('En movimiento')
    expect(screen.getByRole('button', { name: 'Pausar' })).toHaveClass(
      'control-button--active',
    )
    await user.click(screen.getByRole('button', { name: 'Pulsar para hablar' }))
    sayInterim('Finalizar')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    say('Finalizar')
    let dialog = await screen.findByRole('dialog', {
      name: '¿Quieres finalizar la práctica?',
    })
    await within(dialog).findByText('Puedes usar los botones para responder.')
    say('Sí, finalizar')
    expect(getSession().status).toBe('PLAYING')
    await user.click(
      within(dialog).getByRole('button', { name: 'Pulsar para hablar' }),
    )
    say('Cancelar')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    await user.click(screen.getByRole('button', { name: 'Pulsar para hablar' }))
    say('Finalizar')
    dialog = await screen.findByRole('dialog', {
      name: '¿Quieres finalizar la práctica?',
    })
    await waitFor(() =>
      expect(
        within(dialog).getByRole('button', { name: 'Pulsar para hablar' }),
      ).toBeEnabled(),
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Pulsar para hablar' }),
    )
    sayInterim('Sí, finalizar')
    expect(getSession().status).toBe('PLAYING')
    say('Sí, finalizar')
    await waitFor(() => expect(window.location.pathname).toBe('/resumen'))
    expect(transitions).toEqual(['next', 'pause', 'resume', 'complete'])
  })

  it('welcomes, explains commands, controls the routine and asks IA hands-free', async () => {
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

    const welcomeGuide = await screen.findByRole('region', {
      name: 'Bienvenida y comandos de voz',
    })
    const welcome = catalogWelcome()
    expect(within(welcomeGuide).getAllByRole('status')).toHaveLength(1)
    await waitFor(() =>
      expect(speak.mock.calls.map(([text]) => text)).toEqual([
        ...welcome.sections,
        ...voiceCommandSections,
      ]),
    )
    expect(
      screen.queryByRole('button', { name: 'Escuchar comandos' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Ver comandos')).not.toBeInTheDocument()
    const callsBeforePractice = speak.mock.calls.length

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
    ).toHaveAttribute('src', '/img/routines/j1/1.jpg')
    await screen.findByText('Micrófono atento')
    expect(speak.mock.calls[callsBeforePractice]?.[0]).toBe(
      routineIntroduction('Primeros movimientos'),
    )
    expect(
      speak.mock.calls
        .slice(callsBeforePractice)
        .some(([text]) => voiceCommandSections.includes(text)),
    ).toBe(false)
    expect(
      screen.getByRole('button', { name: 'Escuchar comandos' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Ver comandos')).toBeInTheDocument()
    let finishHelp: () => void = () => {}
    speak.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishHelp = resolve
        }),
    )
    say('Puedes decirme qué acciones puedo realizar')
    expect(
      screen.getByRole('button', { name: 'Escuchar comandos' }),
    ).toHaveClass('voice-console-toggle--active')
    expect(screen.getByText('Estos son tus comandos')).toBeInTheDocument()
    expect(speak).toHaveBeenLastCalledWith(voiceCommandSections[0])
    // The guide's spoken commands must not be recognized as user actions.
    say('Siguiente')
    expect(session.currentMovementIndex).toBe(0)
    await act(async () => finishHelp())
    await screen.findByText('Micrófono atento')
    expect(speak).toHaveBeenLastCalledWith(
      'Coloca los pies separados y adopta una postura cómoda.',
    )
    expect(session.questions).toHaveLength(0)
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
    const callsBeforePausedHelp = speak.mock.calls.length
    say('Oye, ¿qué acciones puedo realizar?')
    await screen.findByText('Micrófono atento')
    expect(speak).toHaveBeenCalledTimes(
      callsBeforePausedHelp + voiceCommandSections.length,
    )
    expect(speak).toHaveBeenLastCalledWith(voiceCommandSections.at(-1))
    expect(session.status).toBe('PAUSED')
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
    await screen.findByRole('dialog', {
      name: '¿Quieres finalizar la práctica?',
    })
    expect(session.status).toBe('PLAYING')
    expect(window.location.pathname).not.toBe('/resumen')
    await screen.findByText('Te escucho: «Sí, finalizar» o «Cancelar».')
    say('Siguiente')
    expect(session.currentMovementIndex).toBe(0)
    say('Cancelar')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(session.status).toBe('PLAYING')
    say('Siguiente')
    await screen.findByRole('heading', {
      name: 'Acariciar la Crin del Caballo',
    })
    let finishCancelledHelp: () => void = () => {}
    speak.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishCancelledHelp = resolve
        }),
    )
    say('Repetir comandos')
    expect(screen.getByText('Estos son tus comandos')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await screen.findByRole('heading', {
      name: 'Grulla Blanca Extiende las Alas',
    })
    const callsAfterMovementChange = speak.mock.calls.length
    await act(async () => finishCancelledHelp())
    expect(speak).toHaveBeenCalledTimes(callsAfterMovementChange)
    expect(screen.queryByText('Estos son tus comandos')).not.toBeInTheDocument()
    const stopsBeforeFinish = stopNarration.mock.calls.length
    const narrationCallsBeforeFinish = speak.mock.calls.length
    say('Finalizar')
    expect(stopNarration.mock.calls.length).toBeGreaterThan(stopsBeforeFinish)
    expect(speak).toHaveBeenLastCalledWith(finishConfirmationPrompt)
    expect(session.status).toBe('PLAYING')
    await screen.findByText('Te escucho: «Sí, finalizar» o «Cancelar».')
    say('Sí, finalizar')
    await waitFor(() => expect(window.location.pathname).toBe('/resumen'))
    expect(session.status).toBe('COMPLETED')
    expect(speak).toHaveBeenCalledTimes(narrationCallsBeforeFinish + 1)
    expect(
      speak.mock.calls.filter(([text]) => text === welcome.sections[0]),
    ).toHaveLength(1)
  })

  it('requires confirmation before finishing on the first movement and shows partial progress', async () => {
    window.history.pushState({}, '', '/')
    vi.stubGlobal('SpeechRecognition', FakeContinuousRecognition)
    let session: PracticeSession = {
      id: '00000000-0000-4000-8000-000000000004',
      routineId: routines[0]!.id,
      currentMovementIndex: 0,
      status: 'PLAYING',
      startedAt: Date.now(),
      completedAt: null,
      elapsedSeconds: 30,
      questions: [],
    }
    let completions = 0
    let completionAttempts = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input)
        if (path.endsWith('/routines'))
          return new Response(JSON.stringify({ data: routines }))
        if (path.endsWith(`/routines/${session.routineId}`))
          return new Response(JSON.stringify({ data: routines[0] }))
        if (path.endsWith('/complete')) {
          completionAttempts++
          if (completionAttempts === 1)
            return new Response(
              JSON.stringify({
                error: {
                  code: 'TEMPORARY_ERROR',
                  message: 'Inténtalo de nuevo',
                },
              }),
              { status: 500 },
            )
          completions++
          session = { ...session, status: 'COMPLETED', completedAt: Date.now() }
        }
        if (path.endsWith('/pause')) session = { ...session, status: 'PAUSED' }
        if (path.endsWith('/resume'))
          session = { ...session, status: 'PLAYING' }
        return new Response(JSON.stringify({ data: session }))
      }),
    )
    vi.spyOn(voiceServices.tts, 'speak').mockResolvedValue()
    vi.spyOn(voiceServices.tts, 'stop').mockImplementation(() => {})
    const user = userEvent.setup()
    render(<App />)
    await user.click(
      (
        await screen.findAllByRole('button', { name: /Elegir esta rutina/i })
      )[0]!,
    )
    await screen.findByText('Micrófono atento')
    say('Sí, finalizar')
    expect(completions).toBe(0)
    say('Pausar')
    await screen.findByText('En pausa')
    say('Finalizar')
    await screen.findByText('Te escucho: «Sí, finalizar» o «Cancelar».')
    say('No')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(session.status).toBe('PAUSED')
    say('Continuar')
    await screen.findByText('En movimiento')
    say('Finalizar')
    say('Sí, finalizar')
    expect(completions).toBe(0)
    await screen.findByText('Te escucho: «Sí, finalizar» o «Cancelar».')
    expect(completions).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(completions).toBe(0)
    say('Finalizar')
    await screen.findByText('Te escucho: «Sí, finalizar» o «Cancelar».')
    say('Confirmar')
    await screen.findByText(
      'No se pudo finalizar. Puedes reintentar o cancelar para seguir practicando.',
    )
    expect(window.location.pathname).not.toBe('/resumen')
    expect(completions).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Sí, finalizar' }))
    await waitFor(() => expect(window.location.pathname).toBe('/resumen'))
    expect(completions).toBe(1)
    expect(completionAttempts).toBe(2)
    expect(session.currentMovementIndex).toBe(0)
    expect(screen.getByText('paso alcanzado')).toBeInTheDocument()
    expect(screen.getByText('1/3')).toBeInTheDocument()
  })
})
