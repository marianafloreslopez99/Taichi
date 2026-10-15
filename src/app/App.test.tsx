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
import {
  clearVoiceEvaluation,
  getVoiceEvaluation,
  getVoiceLatencySamples,
  startVoiceEvaluation,
} from '../application/voiceLatency'

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

  repeatLastResult() {
    this.onresult?.({
      resultIndex: this.results.length - 1,
      results: this.results,
    })
  }

  finalizeInterim(transcript: string) {
    this.results[this.results.length - 1] = { isFinal: true, 0: { transcript } }
    this.repeatLastResult()
  }
}

function say(transcript: string) {
  act(() => FakeContinuousRecognition.current.emit(transcript))
}

async function sayAndSettle(transcript: string) {
  await act(async () => FakeContinuousRecognition.current.emit(transcript))
}

function sayInterim(transcript: string) {
  act(() => FakeContinuousRecognition.current.emitInterim(transcript))
}

afterEach(() => {
  clearVoiceEvaluation()
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
        [
          'pause',
          'resume',
          'next',
          'previous',
          'complete',
          'ask',
          'close-question',
          'questions',
        ].includes(action)
      ) {
        transitions.push(action)
        const response = await transition?.(action)
        if (response) return response
        if (action === 'pause') session = { ...session, status: 'PAUSED' }
        if (action === 'resume') session = { ...session, status: 'PLAYING' }
        if (action === 'ask') session = { ...session, status: 'ASKING' }
        if (action === 'close-question')
          session = { ...session, status: 'PAUSED' }
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
  it('restores routine commands after a question quota error without repeating the Gemini request', async () => {
    const quotaMessage =
      'Se agotó la cuota diaria de Gemini para este proyecto. Inténtalo después del reinicio de la cuota.'
    const { transitions } = await startVoicePractice(async (action) =>
      action === 'questions'
        ? new Response(
            JSON.stringify({
              error: {
                code: 'AI_DAILY_QUOTA_EXHAUSTED',
                message: quotaMessage,
              },
            }),
            { status: 429 },
          )
        : undefined,
    )
    const oldRecognition = FakeContinuousRecognition.current
    await sayAndSettle('Oye, cómo coordino la respiración')
    await screen.findByText(quotaMessage)
    await waitFor(() =>
      expect(FakeContinuousRecognition.current).not.toBe(oldRecognition),
    )
    await sayAndSettle('Continuar')
    await screen.findByText('Micrófono atento')
    await sayAndSettle('Pausar')
    await screen.findByText('En pausa')
    expect(transitions).toEqual([
      'ask',
      'questions',
      'close-question',
      'resume',
      'pause',
    ])
  })
  it('records one audio stop for a provisional pause and its final result', async () => {
    await startVoicePractice()
    startVoiceEvaluation({
      browser: 'edge',
      device: 'desktop',
      deviceProfile: 'primary',
      noise: 'quiet',
      audioOutput: 'speakers',
      startup: 'warm',
    })
    sayInterim('Pausar')
    await act(async () =>
      FakeContinuousRecognition.current.finalizeInterim('Pausar'),
    )
    await screen.findByText('En pausa')
    const cuts = () =>
      getVoiceEvaluation()!.entries.flatMap((entry) =>
        entry.kind === 'latency' && entry.sample.phase === 'audio-stop'
          ? [entry.sample]
          : [],
      )
    expect(cuts()).toEqual([
      expect.objectContaining({ command: 'pause', audioStopBasis: 'interim' }),
    ])
    await sayAndSettle('Continuar')
    await sayAndSettle('Pausar')
    expect(cuts()).toHaveLength(2)
    expect(cuts()[1]).toMatchObject({
      command: 'pause',
      audioStopBasis: 'final',
    })
  })

  it('records an unmatched rapid phrase without storing its text and still accepts a later command', async () => {
    const { transitions } = await startVoicePractice()
    startVoiceEvaluation({
      browser: 'edge',
      device: 'desktop',
      deviceProfile: 'primary',
      noise: 'quiet',
      audioOutput: 'speakers',
      startup: 'warm',
    })
    say('Pausar continuar repetir')
    expect(transitions).toHaveLength(0)
    expect(getVoiceEvaluation()!.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'capture',
          event: expect.objectContaining({
            name: 'phrase-ignored',
            reason: 'unmatched',
          }),
        }),
      ]),
    )
    expect(JSON.stringify(getVoiceEvaluation())).not.toContain(
      'Pausar continuar repetir',
    )
    await sayAndSettle('Pausar')
    expect(transitions).toEqual(['pause'])
  })
  it('serializes voice and button commands using the updated session, with immediate pause audio', async () => {
    let releaseNext: () => void = () => {}
    let releasePause: () => void = () => {}
    let nextCount = 0
    const { user, speak, stop, transitions, getSession } =
      await startVoicePractice(async (action) => {
        if (action === 'next' && nextCount++ === 0)
          await new Promise<void>((resolve) => {
            releaseNext = resolve
          })
        if (action === 'pause')
          await new Promise<void>((resolve) => {
            releasePause = resolve
          })
        return undefined
      })
    const ask = vi.spyOn(voiceServices.ai, 'ask')
    say('Siguiente')
    say('Siguiente')
    // A button shares the same queue as voice commands.
    await user.click(screen.getByRole('button', { name: 'Repetir' }))
    say('Anterior')
    const stopsBeforePause = stop.mock.calls.length
    sayInterim('Pausar')
    expect(stop.mock.calls.length).toBe(stopsBeforePause + 1)
    say('Pausar')
    say('Continuar')
    const narrationAfterPause = speak.mock.calls.length
    expect(transitions).toEqual(['next'])
    await act(async () => releaseNext())
    await waitFor(() =>
      expect(transitions).toEqual(['next', 'next', 'previous', 'pause']),
    )
    expect(getSession().currentMovementIndex).toBe(1)
    expect(speak).toHaveBeenCalledTimes(narrationAfterPause)
    await act(async () => releasePause())
    await waitFor(() =>
      expect(transitions).toEqual([
        'next',
        'next',
        'previous',
        'pause',
        'resume',
      ]),
    )
    expect(getSession().status).toBe('PLAYING')
    await waitFor(() =>
      expect(speak.mock.calls.length).toBeGreaterThan(narrationAfterPause),
    )
    expect(ask).not.toHaveBeenCalled()
    expect(getVoiceLatencySamples()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ command: 'pause', phase: 'queue-wait' }),
      ]),
    )
  })

  it('stops the queue after a failed action and accepts newly repeated commands', async () => {
    let rejectNext: () => void = () => {}
    let nextCount = 0
    const { transitions, getSession } = await startVoicePractice(
      async (action) => {
        if (action === 'next' && nextCount++ === 0) {
          await new Promise<void>((resolve) => {
            rejectNext = resolve
          })
          return new Response(
            JSON.stringify({
              error: { code: 'TEMPORARY_ERROR', message: 'Reintenta' },
            }),
            { status: 500 },
          )
        }
        return undefined
      },
    )
    say('Siguiente')
    say('Pausar')
    say('Siguiente')
    await act(async () => rejectNext())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Se descartaron los comandos pendientes; repítelos.',
    )
    expect(transitions).toEqual(['next'])
    expect(getSession().currentMovementIndex).toBe(0)
    await sayAndSettle('Siguiente')
    expect(transitions).toEqual(['next', 'next'])
    expect(getSession().currentMovementIndex).toBe(1)
  })

  it('discards commands behind Finish when its confirmation opens', async () => {
    let releaseNext: () => void = () => {}
    const { transitions, getSession } = await startVoicePractice(
      async (action) => {
        if (action === 'next')
          await new Promise<void>((resolve) => {
            releaseNext = resolve
          })
        return undefined
      },
    )
    say('Siguiente')
    say('Finalizar')
    say('Pausar')
    say('Siguiente')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await act(async () => releaseNext())
    await screen.findByText('Te escucho: «Sí, finalizar» o «Cancelar».')
    expect(transitions).toEqual(['next'])
    await sayAndSettle('Cancelar')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(transitions).toEqual(['next'])
    expect(getSession().currentMovementIndex).toBe(1)
    expect(getSession().status).toBe('PLAYING')
  })

  it('does not run queued commands after leaving practice', async () => {
    let releaseNext: () => void = () => {}
    const { user, transitions } = await startVoicePractice(async (action) => {
      if (action === 'next')
        await new Promise<void>((resolve) => {
          releaseNext = resolve
        })
      return undefined
    })
    say('Siguiente')
    say('Pausar')
    await user.click(
      screen.getByRole('link', { name: 'Taichi, elegir rutina' }),
    )
    await act(async () => releaseNext())
    expect(transitions).toEqual(['next'])
    expect(
      screen.queryByRole('button', { name: 'Pausar' }),
    ).not.toBeInTheDocument()
  })

  it('uses the latest movement boundary for queued Next commands', async () => {
    let releaseNext: () => void = () => {}
    let nextCount = 0
    const { transitions, getSession } = await startVoicePractice(
      async (action) => {
        if (action === 'next' && nextCount++ === 0)
          await new Promise<void>((resolve) => {
            releaseNext = resolve
          })
        return undefined
      },
    )
    say('Siguiente')
    say('Siguiente')
    say('Siguiente')
    say('Anterior')
    await act(async () => releaseNext())
    await screen.findByText('Te escucho: «Sí, finalizar» o «Cancelar».')
    expect(transitions).toEqual(['next', 'next'])
    expect(getSession().currentMovementIndex).toBe(2)
    await sayAndSettle('Cancelar')
    expect(transitions).toEqual(['next', 'next'])
  })

  it('reports overflow and reserves space for immediate Pause without restarting help or repeat', async () => {
    let releaseNext: () => void = () => {}
    const { transitions, speak, stop } = await startVoicePractice(
      async (action) => {
        if (action === 'next')
          await new Promise<void>((resolve) => {
            releaseNext = resolve
          })
        return undefined
      },
    )
    say('Siguiente')
    for (let index = 0; index < 8; index++) say('Repetir')
    say('Repetir comandos')
    say('Repetir')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Hay demasiados comandos pendientes.',
    )
    const stopsBeforePause = stop.mock.calls.length
    say('Pausar')
    expect(stop).toHaveBeenCalledTimes(stopsBeforePause + 1)
    const narrationAfterPause = speak.mock.calls.length
    await act(async () => releaseNext())
    await screen.findByText('En pausa')
    expect(transitions).toEqual(['next', 'pause'])
    expect(speak).toHaveBeenCalledTimes(narrationAfterPause)
  })

  it('rearms the microphone only after paused command help finishes speaking', async () => {
    const { speak, transitions } = await startVoicePractice()
    await sayAndSettle('Pausar')
    expect(screen.getByText('En pausa')).toBeInTheDocument()
    let finishHelp: () => void = () => {}
    speak.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishHelp = resolve
        }),
    )
    await sayAndSettle('Oye, ¿qué acciones puedo realizar?')
    expect(screen.getByText('Estos son tus comandos')).toBeInTheDocument()
    expect(screen.queryByText('Micrófono atento')).not.toBeInTheDocument()
    say('Siguiente')
    expect(transitions).toEqual(['pause'])
    await act(async () => finishHelp())
    expect(screen.getByText('Micrófono atento')).toBeInTheDocument()
    expect(screen.getByText('En pausa')).toBeInTheDocument()
    expect(speak).toHaveBeenLastCalledWith(voiceCommandSections.at(-1))
  })

  it('routes prefixed commands and their variants without opening a Gemini question', async () => {
    const { transitions, getSession } = await startVoicePractice()
    const ask = vi.spyOn(voiceServices.ai, 'ask')
    sayInterim('Oye')
    say('Oye, paúsalo')
    await screen.findByText('En pausa')
    say('Tengo una duda: continúa')
    await waitFor(() => expect(getSession().status).toBe('PLAYING'))
    say('Oye, siguiente')
    await waitFor(() => expect(getSession().currentMovementIndex).toBe(1))
    say('Oye, anterior')
    await waitFor(() => expect(getSession().currentMovementIndex).toBe(0))
    expect(transitions).toEqual(['pause', 'resume', 'next', 'previous'])
    expect(ask).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const requests = vi.mocked(fetch).mock.calls.map(([input]) => String(input))
    expect(requests.some((path) => /\/(ask|questions)$/.test(path))).toBe(false)
  })

  it('routes a command spoken after a separate wake phrase without leaving a pending question', async () => {
    const { transitions } = await startVoicePractice()
    const ask = vi.spyOn(voiceServices.ai, 'ask')
    say('Oye')
    expect(screen.getByText('Dinos tu pregunta')).toBeInTheDocument()
    say('Pausar')
    await screen.findByText('En pausa')
    expect(transitions).toEqual(['pause'])
    expect(screen.queryByText('Dinos tu pregunta')).not.toBeInTheDocument()
    expect(ask).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('still requires a final confirmation after a prefixed finish command', async () => {
    const { transitions } = await startVoicePractice()
    const ask = vi.spyOn(voiceServices.ai, 'ask')
    say('Oye, finalizar práctica')
    await screen.findByText('Te escucho: «Sí, finalizar» o «Cancelar».')
    sayInterim('Sí, finalizar')
    expect(transitions).not.toContain('complete')
    say('Cancelar')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(transitions).not.toContain('complete')
    expect(ask).not.toHaveBeenCalled()
  })

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
    act(() => FakeContinuousRecognition.current.repeatLastResult())
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
      /No se pudo ejecutar el comando de voz\. Inténtalo de nuevo\./,
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
    // Flush the pause request and its React effects before starting another
    // narration; seeing the paused label alone can precede effect cleanup.
    await sayAndSettle('Pausar')
    expect(screen.getByText('En pausa')).toBeInTheDocument()
    const callsBeforePausedHelp = speak.mock.calls.length
    await sayAndSettle('Oye, ¿qué acciones puedo realizar?')
    expect(screen.getByText('Micrófono atento')).toBeInTheDocument()
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
    expect(
      screen.getByRole('heading', { name: 'Acariciar la Crin del Caballo' }),
    ).toBeInTheDocument()
    await act(async () => finishCancelledHelp())
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
