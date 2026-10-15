import { act, cleanup, fireEvent, render } from '@testing-library/react'
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
  commandListIntroduction,
  voiceHelpTopics,
  practiceGuidance,
  guidanceStorageKey,
} from '../application/practiceInteraction'
import { finishConfirmationPrompt } from '../presentation/components/FinishConfirmation'
import { queryClient } from './queryClient'
import { getVoiceLatencySamples } from '../application/voiceLatency'
import { flattenRoutineMovements } from '../domain/routines'

const openingInstruction =
  'En Apertura, coloca los pies separados y adopta una postura cómoda.'
const horseInstruction =
  'En Acariciar la Crin del Caballo, imagina que sostienes una pelota grande frente al cuerpo.'

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
  initial: {
    status?: 'PLAYING' | 'PAUSED'
    movementIndex?: number
    guidance?: 'new'
    routineIndex?: number
  } = {},
) {
  const routineIndex = initial.routineIndex ?? 0
  const routine = routines[routineIndex]!
  if (initial.guidance !== 'new')
    window.localStorage.setItem(
      guidanceStorageKey,
      JSON.stringify(Object.keys(practiceGuidance)),
    )
  window.history.pushState({}, '', '/')
  vi.stubGlobal('SpeechRecognition', FakeContinuousRecognition)
  let session: PracticeSession = {
    id: '00000000-0000-4000-8000-000000000009',
    routineId: routine.id,
    currentMovementIndex: initial.movementIndex ?? 0,
    status: initial.status ?? 'PLAYING',
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
        return new Response(JSON.stringify({ data: routine }))
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
    (await screen.findAllByRole('button', { name: /Elegir esta rutina/i }))[
      routineIndex
    ]!,
  )
  await screen.findByText('Micrófono atento')
  return { user, speak, stop, transitions, getSession: () => session }
}

describe('practice journey', () => {
  it.each(routines.map((routine, routineIndex) => ({ routine, routineIndex })))(
    'automatically narrates every step of $routine.name and asks before finishing',
    async ({ routine, routineIndex }) => {
      const { speak, transitions, getSession } = await startVoicePractice(
        undefined,
        { routineIndex },
      )
      const steps = flattenRoutineMovements(routine)
      vi.useFakeTimers()
      await act(async () => say('Repetir'))
      for (const [index, { movement }] of steps.entries()) {
        expect(getSession().currentMovementIndex).toBe(index)
        expect(
          screen.getByRole('heading', { name: movement.name }),
        ).toBeInTheDocument()
        await act(async () =>
          vi.advanceTimersByTimeAsync(movement.voiceGuide.length * 1500 - 1),
        )
        expect(getSession().currentMovementIndex).toBe(index)
        expect(speak).toHaveBeenLastCalledWith(movement.voiceGuide.at(-1)!.text)
        await act(async () => vi.advanceTimersByTimeAsync(1))
      }
      expect(transitions).toEqual(Array(steps.length - 1).fill('next'))
      expect(
        screen.getByRole('dialog', { name: /finalizar/i }),
      ).toBeInTheDocument()
      expect(getSession().status).toBe('PLAYING')
      await act(async () => vi.advanceTimersByTimeAsync(60000))
      expect(transitions).not.toContain('complete')
      await act(async () => say('Cancelar'))
      await act(async () => vi.advanceTimersByTimeAsync(60000))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(
        speak.mock.calls.filter(([text]) => text === finishConfirmationPrompt),
      ).toHaveLength(1)
    },
  )

  it('suspends automatic progression while paused or consulting help, then advances once after continuing', async () => {
    const { getSession, transitions } = await startVoicePractice()
    const guide = flattenRoutineMovements(routines[0]!)[0]!.movement.voiceGuide
    vi.useFakeTimers()
    await act(async () => say('Repetir'))
    await act(async () => vi.advanceTimersByTimeAsync(1500))
    await act(async () => say('Pausar'))
    await act(async () => vi.advanceTimersByTimeAsync(60000))
    expect(getSession().currentMovementIndex).toBe(0)
    expect(getSession().status).toBe('PAUSED')
    await act(async () => say('Continuar'))
    await act(async () => say('Ayuda'))
    await act(async () => vi.advanceTimersByTimeAsync(60000))
    expect(getSession().currentMovementIndex).toBe(0)
    await act(async () => say('Continuar'))
    await act(async () =>
      vi.advanceTimersByTimeAsync((guide.length - 1) * 1500),
    )
    expect(getSession().currentMovementIndex).toBe(1)
    expect(transitions.filter((action) => action === 'next')).toHaveLength(1)
  })

  it('does not advance before the final spoken instruction ends or duplicate a manual advance', async () => {
    const { speak, transitions, getSession } = await startVoicePractice()
    const guide = flattenRoutineMovements(routines[0]!)[0]!.movement.voiceGuide
    let finishSpeaking: () => void = () => {}
    speak.mockImplementation((text) =>
      text === guide.at(-1)!.text
        ? new Promise<void>((resolve) => {
            finishSpeaking = resolve
          })
        : Promise.resolve(),
    )
    vi.useFakeTimers()
    await act(async () => say('Repetir'))
    await act(async () => vi.advanceTimersByTimeAsync(60000))
    expect(getSession().currentMovementIndex).toBe(0)
    expect(transitions).not.toContain('next')
    await act(async () => finishSpeaking())
    await act(async () => vi.advanceTimersByTimeAsync(1499))
    await act(async () => say('Siguiente'))
    await act(async () => vi.advanceTimersByTimeAsync(1))
    expect(getSession().currentMovementIndex).toBe(1)
    expect(transitions).toEqual(['next'])
  })

  it('stops automatic retries after a failed transition and allows an explicit retry', async () => {
    let failNext = true
    const { transitions, getSession } = await startVoicePractice(
      async (action) =>
        action === 'next' && failNext
          ? new Response(
              JSON.stringify({
                error: { code: 'TEMPORARY_ERROR', message: 'Reintenta' },
              }),
              { status: 500 },
            )
          : undefined,
    )
    vi.useFakeTimers()
    await act(async () => say('Repetir'))
    await act(async () => vi.advanceTimersByTimeAsync(60000))
    expect(transitions).toEqual(['next'])
    expect(getSession().currentMovementIndex).toBe(0)
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo ejecutar')
    failNext = false
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' })),
    )
    expect(getSession().currentMovementIndex).toBe(1)
    expect(transitions).toEqual(['next', 'next'])
  })

  it('introduces essential controls and both modes once, then teaches navigation, questions and finishing in context', async () => {
    const { speak } = await startVoicePractice(undefined, { guidance: 'new' })
    expect(speak).toHaveBeenCalledWith(practiceGuidance.essentials.text)
    for (const id of [
      'navigation',
      'questions',
      'finish',
      'push-to-talk',
    ] as const)
      expect(speak).not.toHaveBeenCalledWith(practiceGuidance[id].text)
    say('Siguiente')
    await screen.findByRole('heading', {
      name: 'Acariciar la Crin del Caballo',
    })
    await screen.findByText('Micrófono atento')
    expect(speak).toHaveBeenCalledWith(practiceGuidance.navigation.text)
    expect(speak).not.toHaveBeenCalledWith(practiceGuidance.questions.text)
    say('Pausar')
    await screen.findByText('En pausa')
    await screen.findByText('Micrófono atento')
    expect(speak).toHaveBeenCalledWith(practiceGuidance.questions.text)
    say('Continuar')
    await screen.findByText('En movimiento')
    await screen.findByText('Micrófono atento')
    say('Siguiente')
    await screen.findByRole('heading', {
      name: 'Grulla Blanca Extiende las Alas',
    })
    await screen.findByText('Micrófono atento')
    expect(speak).toHaveBeenCalledWith(practiceGuidance.finish.text)
    expect(speak).toHaveBeenLastCalledWith(
      'En Grulla Blanca Extiende las Alas, comienza sosteniendo una pelota grande frente al cuerpo.',
    )
    for (const id of [
      'essentials',
      'navigation',
      'questions',
      'finish',
    ] as const)
      expect(
        speak.mock.calls.filter(([text]) => text === practiceGuidance[id].text),
      ).toHaveLength(1)
  })

  it('opens help from the microphone container and narrates only a requested topic', async () => {
    const { user, speak } = await startVoicePractice()
    const beforeHelp = speak.mock.calls.length
    await user.click(
      screen.getByRole('button', {
        name: 'Ayuda',
      }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Ayuda para tu práctica',
    })
    await waitFor(() =>
      expect(
        within(dialog).getByRole('button', { name: 'Continuar práctica' }),
      ).toBeEnabled(),
    )
    expect(speak.mock.calls.slice(beforeHelp).map(([text]) => text)).toEqual([
      '¿En qué te puedo ayudar?',
    ])
    const beforeModes = speak.mock.calls.length
    await user.click(
      within(dialog).getByRole('button', {
        name: 'Escuchar: Modos del micrófono',
      }),
    )
    await waitFor(() =>
      expect(
        within(dialog).getByRole('button', { name: 'Continuar práctica' }),
      ).toBeEnabled(),
    )
    expect(speak.mock.calls.slice(beforeModes).map(([text]) => text)).toEqual(
      voiceHelpTopics.find((topic) => topic.id === 'modes')!.sections,
    )
    const beforeQuestions = speak.mock.calls.length
    let finishQuestionHelp: () => void = () => {}
    speak.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishQuestionHelp = resolve
        }),
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Escuchar: Preguntas a IA' }),
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Detener explicación' }),
    )
    await waitFor(() =>
      expect(
        within(dialog).getByRole('button', { name: 'Continuar práctica' }),
      ).toBeEnabled(),
    )
    expect(
      speak.mock.calls.slice(beforeQuestions).map(([text]) => text),
    ).toEqual(
      voiceHelpTopics.find((topic) => topic.id === 'questions')!.sections,
    )
    await act(async () => finishQuestionHelp())
    expect(speak.mock.calls.slice(beforeQuestions)).toHaveLength(1)
  })

  it('explains push-to-talk on first activation and lets the user skip the explanation', async () => {
    const { user, speak } = await startVoicePractice(undefined, {
      guidance: 'new',
    })
    speak.mockImplementation((text) =>
      text === practiceGuidance['push-to-talk'].text
        ? new Promise<void>(() => {})
        : Promise.resolve(),
    )
    say('Pulsar para hablar')
    const voiceConsole = screen.getByRole('region', {
      name: 'Estado del control por voz',
    })
    await within(voiceConsole).findByText(practiceGuidance['push-to-talk'].text)
    await user.click(
      within(voiceConsole).getByRole('button', { name: 'Omitir explicación' }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Pulsar para hablar' }),
      ).toBeEnabled(),
    )
    expect(
      screen.getByRole('button', {
        name: 'Ayuda',
      }),
    ).toBeEnabled()
    expect(
      JSON.parse(window.localStorage.getItem(guidanceStorageKey)!),
    ).toContain('push-to-talk')
    expect(
      screen.queryByRole('button', { name: 'Omitir explicación' }),
    ).not.toBeInTheDocument()
  })

  it('opens spoken help, lists commands, and changes the microphone to push-to-talk by voice', async () => {
    const { user, speak, transitions } = await startVoicePractice()
    const ask = vi.spyOn(voiceServices.ai, 'ask')
    let finishGreeting: () => void = () => {}
    speak.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishGreeting = resolve
        }),
    )
    say('Necesito ayuda')
    let dialog = await screen.findByRole('dialog', {
      name: 'Ayuda para tu práctica',
    })
    expect(
      within(dialog).getByText('¿En qué te puedo ayudar?'),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(speak).toHaveBeenLastCalledWith('¿En qué te puedo ayudar?'),
    )
    say('Cuáles eran los comandos')
    expect(
      screen.getByRole('dialog', { name: 'Ayuda para tu práctica' }),
    ).toBeInTheDocument()
    await act(async () => finishGreeting())
    await waitFor(() =>
      expect(
        within(dialog).getByRole('button', {
          name: 'Cuáles eran los comandos',
        }),
      ).toBeEnabled(),
    )
    const beforeList = speak.mock.calls.length
    say('Cuáles eran los comandos')
    dialog = await screen.findByRole('dialog', {
      name: 'Estos son tus comandos',
    })
    for (const text of voiceCommandSections)
      expect(within(dialog).getByText(text)).toBeInTheDocument()
    await waitFor(() =>
      expect(
        within(dialog).getByRole('button', {
          name: 'Cuáles eran los comandos',
        }),
      ).toBeEnabled(),
    )
    expect(speak.mock.calls.slice(beforeList).map(([text]) => text)).toEqual([
      commandListIntroduction,
    ])
    expect(ask).not.toHaveBeenCalled()
    let finishMode: () => void = () => {}
    speak.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishMode = resolve
        }),
    )
    say('Aplica el modo Pulsar para hablar')
    await within(dialog).findByText('Cambiemos a modo Pulsar para hablar.')
    await waitFor(() =>
      expect(speak).toHaveBeenLastCalledWith(
        'Cambiemos a modo Pulsar para hablar.',
      ),
    )
    expect(
      within(dialog).getByRole('button', { name: 'Pulsar para hablar' }),
    ).toBeDisabled()
    await act(async () => finishMode())
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    const microphone = screen.getByRole('button', {
      name: 'Pulsar para hablar',
    })
    expect(microphone).toBeEnabled()
    const beforeTalk = FakeContinuousRecognition.instances.length
    say('Siguiente')
    expect(transitions).toHaveLength(0)
    await user.click(microphone)
    expect(FakeContinuousRecognition.current.continuous).toBe(false)
    expect(FakeContinuousRecognition.instances).toHaveLength(beforeTalk + 1)
    expect(
      screen.getByRole('button', { name: 'Terminar escucha' }),
    ).toBeInTheDocument()
    say('Siguiente')
    await screen.findByText('Pasemos al siguiente paso.')
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Pulsar para hablar' }),
      ).toBeEnabled(),
    )
    expect(transitions).toEqual(['next'])
    say('Siguiente')
    expect(transitions).toEqual(['next'])
    await user.click(screen.getByRole('button', { name: 'Pulsar para hablar' }))
    sayInterim('Cambia a escucha continua')
    await user.click(screen.getByRole('button', { name: 'Terminar escucha' }))
    expect(FakeContinuousRecognition.current.stop).toHaveBeenCalledOnce()
    say('Cambia a escucha continua')
    await screen.findByText('Cambiemos a modo Escucha continua.')
    await screen.findByText('Micrófono atento')
    expect(
      screen.getByRole('button', { name: 'Apagar micrófono' }),
    ).toBeEnabled()
  })

  it('switches to continuous listening by voice inside push-to-talk help', async () => {
    const { user, speak } = await startVoicePractice()
    say('Pulsar para hablar')
    await screen.findByText('Cambiemos a modo Pulsar para hablar.')
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Pulsar para hablar' }),
      ).toBeEnabled(),
    )
    await user.click(screen.getByRole('button', { name: 'Pulsar para hablar' }))
    say('Ayuda')
    const dialog = await screen.findByRole('dialog', {
      name: 'Ayuda para tu práctica',
    })
    await waitFor(() =>
      expect(
        within(dialog).getByRole('button', { name: 'Pulsar para hablar' }),
      ).toBeEnabled(),
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Pulsar para hablar' }),
    )
    say('Activa escucha continua')
    await within(dialog).findByText('Cambiemos a modo Escucha continua.')
    await screen.findByText('Micrófono atento')
    expect(speak).toHaveBeenCalledWith('Cambiemos a modo Escucha continua.')
    expect(FakeContinuousRecognition.current.continuous).toBe(true)
    expect(
      screen.getByRole('button', { name: 'Apagar micrófono' }),
    ).toBeEnabled()
    expect(
      screen.queryByRole('button', { name: 'Abrir ayuda' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Ver comandos' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/para recordar los comandos/),
    ).not.toBeInTheDocument()
  })

  it('allows changing voice mode from help while the command list is being read', async () => {
    const { user, speak } = await startVoicePractice()
    let finishList: () => void = () => {}
    speak.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishList = resolve
        }),
    )
    say('Cuáles eran los comandos')
    const dialog = await screen.findByRole('dialog', {
      name: 'Estos son tus comandos',
    })
    const switchMode = within(dialog).getByRole('button', {
      name: 'Usar Pulsar para hablar',
    })
    expect(switchMode).toBeEnabled()
    await user.click(switchMode)
    await screen.findByText('Cambiemos a modo Pulsar para hablar.')
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Pulsar para hablar' }),
      ).toBeEnabled(),
    )
    const afterSwitch = speak.mock.calls.length
    await act(async () => finishList())
    expect(speak).toHaveBeenCalledTimes(afterSwitch)
    await user.click(screen.getByRole('button', { name: 'Pulsar para hablar' }))
    say('Ayuda')
    const help = await screen.findByRole('dialog', {
      name: 'Ayuda para tu práctica',
    })
    const continuous = within(help).getByRole('button', {
      name: 'Usar escucha continua',
    })
    await waitFor(() => expect(continuous).toBeEnabled())
    await user.click(continuous)
    await screen.findByText('Cambiemos a modo Escucha continua.')
    await screen.findByText('Micrófono atento')
    expect(FakeContinuousRecognition.current.continuous).toBe(true)
  })

  it('cancels help speech on close and still shows the command list when audio fails', async () => {
    const { user, speak } = await startVoicePractice()
    let finishGreeting: () => void = () => {}
    speak.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishGreeting = resolve
        }),
    )
    say('Ayuda')
    await screen.findByRole('dialog', { name: 'Ayuda para tu práctica' })
    await user.keyboard('{Escape}')
    await screen.findByText('Micrófono atento')
    const afterClose = speak.mock.calls.length
    await act(async () => finishGreeting())
    expect(speak).toHaveBeenCalledTimes(afterClose)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    speak.mockRejectedValueOnce(new Error('No audio'))
    say('Cuáles eran los comandos')
    const dialog = await screen.findByRole('dialog', {
      name: 'Estos son tus comandos',
    })
    await within(dialog).findByText(
      'El audio de ayuda no está disponible. Puedes leer los comandos aquí.',
    )
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(
      voiceCommandSections.length,
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Cerrar ayuda' }),
    )
    await screen.findByText('Micrófono atento')
  })

  it.each([
    ['Pausar', 'Tomemos un break.', 'PLAYING', 0, 'PAUSED', 0],
    ['Continuar', 'Continuemos con la práctica.', 'PAUSED', 0, 'PLAYING', 0],
    ['Repetir', 'Voy a repetir las instrucciones.', 'PLAYING', 0, 'PLAYING', 0],
    ['Anterior', 'Regresemos al paso anterior.', 'PLAYING', 1, 'PLAYING', 0],
    ['Siguiente', 'Pasemos al siguiente paso.', 'PLAYING', 0, 'PLAYING', 1],
    ['Repetir', 'Voy a repetir las instrucciones.', 'PAUSED', 0, 'PAUSED', 0],
  ] as const)(
    'confirms %s in text and voice from %s, before narrating the next instructions',
    async (
      command,
      confirmation,
      status,
      movementIndex,
      expectedStatus,
      expectedIndex,
    ) => {
      const { speak, transitions, getSession } = await startVoicePractice(
        undefined,
        { status, movementIndex },
      )
      let finishConfirmation: () => void = () => {}
      speak.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishConfirmation = resolve
          }),
      )
      const beforeCommand = speak.mock.calls.length
      say(command)
      const voiceConsole = screen.getByRole('region', {
        name: 'Estado del control por voz',
      })
      await within(voiceConsole).findByText(confirmation)
      await waitFor(() => expect(speak).toHaveBeenLastCalledWith(confirmation))
      expect(speak).toHaveBeenCalledTimes(beforeCommand + 1)
      expect(getSession().status).toBe(expectedStatus)
      expect(getSession().currentMovementIndex).toBe(expectedIndex)
      const microphone = screen.getByRole('button', {
        name: 'Apagar micrófono',
      })
      expect(microphone).toHaveClass('voice-microphone--speaking')
      expect(microphone).toBeDisabled()
      const beforeEcho = transitions.length
      say('Siguiente')
      expect(transitions).toHaveLength(beforeEcho)
      await act(async () => finishConfirmation())
      expect(microphone).not.toHaveClass('voice-microphone--speaking')
      expect(within(voiceConsole).getByText(confirmation)).toBeInTheDocument()
      if (command === 'Pausar') {
        expect(speak).toHaveBeenCalledTimes(beforeCommand + 1)
      } else {
        const cue = expectedIndex === 0 ? openingInstruction : horseInstruction
        await waitFor(() => expect(speak).toHaveBeenLastCalledWith(cue))
      }
    },
  )

  it.each(['voz', 'botón'])(
    'resumes the interrupted instruction using %s and resets only when repeating or navigating',
    async (control) => {
      const { speak, stop, getSession } = await startVoicePractice()
      expect(speak).toHaveBeenLastCalledWith(openingInstruction)
      const guide = flattenRoutineMovements(routines[0]!)[0]!.movement
        .voiceGuide
      const instruction = guide[1]!.text
      let finishInstruction: (() => void) | undefined
      speak.mockImplementation((text) => {
        if (text === instruction) {
          return new Promise<void>((resolve) => {
            finishInstruction = resolve
          })
        }
        return Promise.resolve()
      })
      stop.mockImplementation(() => {
        finishInstruction?.()
        finishInstruction = undefined
      })
      vi.useFakeTimers()
      await act(async () => say('Repetir'))
      await act(async () => vi.advanceTimersByTimeAsync(guide[0]!.pauseAfterMs))
      expect(speak).toHaveBeenLastCalledWith(instruction)
      await act(async () => {
        if (control === 'voz') {
          sayInterim('Pausar')
          say('Pausar')
        } else fireEvent.click(screen.getByRole('button', { name: 'Pausar' }))
      })
      expect(getSession().status).toBe('PAUSED')
      expect(speak).toHaveBeenLastCalledWith('Tomemos un break.')
      const beforeResume = speak.mock.calls.length
      await act(async () => {
        if (control === 'voz') say('Continuar')
        else fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
      })
      expect(getSession().status).toBe('PLAYING')
      expect(
        speak.mock.calls.slice(beforeResume).map(([text]) => text),
      ).toEqual(['Continuemos con la práctica.', instruction])
      expect(screen.getByText(instruction)).toBeInTheDocument()
      await act(async () => say('Repetir'))
      expect(speak).toHaveBeenLastCalledWith(openingInstruction)
      await act(async () => say('Siguiente'))
      expect(speak).toHaveBeenLastCalledWith(horseInstruction)
      await act(async () => say('Pausar'))
      await act(async () => say('Anterior'))
      await act(async () => say('Continuar'))
      expect(speak).toHaveBeenLastCalledWith(openingInstruction)
    },
  )

  it('repeats the current instruction after a pause between instructions, once the resume confirmation ends', async () => {
    const { speak } = await startVoicePractice()
    const guide = flattenRoutineMovements(routines[0]!)[0]!.movement.voiceGuide
    vi.useFakeTimers()
    await act(async () => say('Repetir'))
    await act(async () => vi.advanceTimersByTimeAsync(1200))
    await act(async () => say('Pausar'))
    await act(async () => vi.advanceTimersByTimeAsync(10000))
    let finishConfirmation: () => void = () => {}
    speak.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishConfirmation = resolve
        }),
    )
    await act(async () => say('Continuar'))
    await act(async () => vi.advanceTimersByTimeAsync(10000))
    expect(speak).toHaveBeenLastCalledWith('Continuemos con la práctica.')
    await act(async () => finishConfirmation())
    expect(speak).toHaveBeenLastCalledWith(openingInstruction)
    await act(async () => vi.advanceTimersByTimeAsync(1499))
    expect(speak).toHaveBeenLastCalledWith(openingInstruction)
    await act(async () => vi.advanceTimersByTimeAsync(1))
    expect(speak).toHaveBeenLastCalledWith(guide[1]!.text)
    expect(
      speak.mock.calls.filter(([text]) => text === openingInstruction),
    ).toHaveLength(3)
  })

  it('retains the written confirmation and resumes listening when confirmation audio fails', async () => {
    const { speak } = await startVoicePractice()
    speak.mockRejectedValueOnce(new Error('Audio unavailable'))
    say('Pausar')
    await screen.findByText('Tomemos un break.')
    await screen.findByText(
      'No se pudo reproducir la confirmación de voz. Puedes leerla en pantalla.',
    )
    expect(screen.getByText('En pausa')).toBeInTheDocument()
    await screen.findByText('Micrófono atento')
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
    expect(
      within(
        screen.getByRole('region', { name: 'Estado del control por voz' }),
      ).getByText('Detecté «Pausar». Aplicando…'),
    ).toBeInTheDocument()
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
    expect(screen.getByText('Tomemos un break.')).toBeInTheDocument()
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
    expect(screen.queryByText('Tomemos un break.')).not.toBeInTheDocument()
    expect(speak).not.toHaveBeenCalledWith('Tomemos un break.')
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

  it('uses a single microphone to toggle continuous listening and retry permission errors', async () => {
    const { user, transitions } = await startVoicePractice()
    expect(
      screen.queryByRole('combobox', { name: 'Modo de voz' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Escuchar comandos' }),
    ).not.toBeInTheDocument()
    const microphone = screen.getByRole('button', { name: 'Apagar micrófono' })
    expect(microphone).toHaveClass('voice-microphone--listening')
    expect(microphone).toHaveAttribute('aria-pressed', 'true')
    await user.click(microphone)
    expect(screen.getByText('Micrófono apagado')).toBeInTheDocument()
    say('Siguiente')
    expect(transitions).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Activar micrófono' }))
    say('Siguiente')
    await screen.findByRole('heading', {
      name: 'Acariciar la Crin del Caballo',
    })
    await screen.findByText('Micrófono atento')
    expect(transitions).toEqual(['next'])
    act(() =>
      FakeContinuousRecognition.current.onerror?.({ error: 'not-allowed' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Reintentar micrófono' }),
    )
    await screen.findByText('Micrófono atento')
  })

  it('lights the microphone while IA speaks, progressively shows the answer, and completes it when audio ends', async () => {
    const { speak } = await startVoicePractice()
    const answer = 'Abre los brazos al inhalar, sin forzar el ritmo.'
    vi.spyOn(voiceServices.stt, 'listen').mockResolvedValue('¿Cómo respiro?')
    vi.spyOn(voiceServices.ai, 'ask').mockResolvedValue({ text: answer })
    let finishAnswer: () => void = () => {}
    speak.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishAnswer = resolve
        }),
    )
    vi.useFakeTimers()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Preguntar a IA/i }))
    })
    const dialog = screen.getByRole('dialog')
    const microphone = within(dialog).getByRole('img', {
      name: 'IA respondiendo',
    })
    expect(microphone).toHaveClass('voice-microphone--speaking')
    const response = dialog.querySelector('.voice-response')!
    expect(response.querySelector('[aria-hidden="true"]')).toHaveTextContent(
      /^Abre$/,
    )
    await act(async () => vi.advanceTimersByTime(480))
    expect(response.querySelector('[aria-hidden="true"]')).toHaveTextContent(
      /^Abre los brazos$/,
    )
    await act(async () => finishAnswer())
    expect(response.querySelector('[aria-hidden="true"]')).toHaveTextContent(
      answer,
    )
    expect(dialog.querySelector('.voice-microphone--speaking')).toBeNull()
    expect(
      within(dialog).getByRole('button', { name: /Continuar rutina/i }),
    ).toBeEnabled()
    vi.useRealTimers()
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
    window.localStorage.setItem(
      guidanceStorageKey,
      JSON.stringify(Object.keys(practiceGuidance)),
    )
    render(<App />)

    const welcomeGuide = await screen.findByRole('region', {
      name: 'Bienvenida y comandos de voz',
    })
    const welcome = catalogWelcome()
    expect(within(welcomeGuide).getAllByRole('status')).toHaveLength(1)
    await waitFor(() =>
      expect(speak.mock.calls.map(([text]) => text)).toEqual([
        ...welcome.sections,
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
      screen.queryByRole('button', { name: 'Escuchar comandos' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Ver comandos')).not.toBeInTheDocument()
    let finishHelp: () => void = () => {}
    speak.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishHelp = resolve
        }),
    )
    say('Puedes decirme qué acciones puedo realizar')

    expect(screen.getByText('Estos son tus comandos')).toBeInTheDocument()
    expect(speak).toHaveBeenLastCalledWith(commandListIntroduction)
    // The guide's spoken commands must not be recognized as user actions.
    say('Siguiente')
    expect(session.currentMovementIndex).toBe(0)
    await act(async () => finishHelp())
    const helpDialog = screen.getByRole('dialog', {
      name: 'Estos son tus comandos',
    })
    await waitFor(() =>
      expect(
        within(helpDialog).getByRole('button', { name: 'Continuar práctica' }),
      ).toBeEnabled(),
    )
    await user.click(
      within(helpDialog).getByRole('button', { name: 'Cerrar ayuda' }),
    )
    await screen.findByText('Micrófono atento')
    expect(speak).toHaveBeenLastCalledWith(openingInstruction)
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
    await screen.findByText('Micrófono atento')
    const callsBeforePausedHelp = speak.mock.calls.length
    say('Oye, ¿qué acciones puedo realizar?')
    const pausedHelp = await screen.findByRole('dialog', {
      name: 'Estos son tus comandos',
    })
    await waitFor(() =>
      expect(
        within(pausedHelp).getByRole('button', { name: 'Continuar práctica' }),
      ).toBeEnabled(),
    )
    expect(speak).toHaveBeenCalledTimes(callsBeforePausedHelp + 1)
    expect(speak).toHaveBeenLastCalledWith(commandListIntroduction)
    expect(session.status).toBe('PAUSED')
    say('Continuar')
    await waitFor(() =>
      expect(screen.getByText('En movimiento')).toBeInTheDocument(),
    )
    await screen.findByText('Micrófono atento')
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
      await within(dialog).findByText(
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
    expect(screen.getByText('Continuemos con la práctica.')).toBeInTheDocument()
    expect(speak).toHaveBeenCalledWith('Continuemos con la práctica.')
    const callsBeforeRepeat = speak.mock.calls.length
    say('Repetir')
    await waitFor(() =>
      expect(speak.mock.calls.length).toBeGreaterThan(callsBeforeRepeat),
    )
    await waitFor(() =>
      expect(
        speak.mock.calls.filter(([text]) => text === openingInstruction).length,
      ).toBeGreaterThanOrEqual(3),
    )
    say('Siguiente')
    expect(
      await screen.findByRole('heading', {
        name: 'Acariciar la Crin del Caballo',
      }),
    ).toBeInTheDocument()
    await screen.findByText('Micrófono atento')
    say('Anterior')
    expect(
      await screen.findByRole('heading', { name: 'Apertura' }),
    ).toBeInTheDocument()
    await screen.findByText('Micrófono atento')
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
    await screen.findByText('Micrófono atento')
    let finishCancelledHelp: () => void = () => {}
    speak.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishCancelledHelp = resolve
        }),
    )
    say('Repetir comandos')
    expect(screen.getByText('Estos son tus comandos')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cerrar ayuda' }))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await screen.findByRole('heading', {
      name: 'Grulla Blanca Extiende las Alas',
    })
    await screen.findByText('Micrófono atento')
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
    window.localStorage.setItem(
      guidanceStorageKey,
      JSON.stringify(Object.keys(practiceGuidance)),
    )
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
    await screen.findByText('Micrófono atento')
    say('Finalizar')
    await screen.findByText('Te escucho: «Sí, finalizar» o «Cancelar».')
    say('No')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(session.status).toBe('PAUSED')
    say('Continuar')
    await screen.findByText('En movimiento')
    await screen.findByText('Micrófono atento')
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
