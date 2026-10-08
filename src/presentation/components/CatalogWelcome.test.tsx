import { act, cleanup, render } from '@testing-library/react'
import { screen, waitFor, within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { voiceServices } from '../../app/services'
import {
  catalogWelcome,
  catalogSelection,
  voiceCommandSections,
} from '../../application/practiceInteraction'
import { CatalogWelcome } from './CatalogWelcome'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('lets the user stop the catalog welcome and replay its separate command sections', async () => {
  let finishWelcome: () => void = () => {}
  const speak = vi
    .spyOn(voiceServices.tts, 'speak')
    .mockResolvedValue()
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishWelcome = resolve
        }),
    )
  const stop = vi.spyOn(voiceServices.tts, 'stop').mockImplementation(() => {})
  const user = userEvent.setup()
  render(<CatalogWelcome />)
  expect(speak).toHaveBeenCalledExactlyOnceWith(catalogWelcome().sections[0])
  await user.click(screen.getByRole('button', { name: 'Detener bienvenida' }))
  expect(stop).toHaveBeenCalledTimes(2)
  await act(async () => finishWelcome())
  expect(speak).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('button', { name: 'Escuchar bienvenida' }))
  await waitFor(() =>
    expect(speak.mock.calls.slice(1).map(([text]) => text)).toEqual([
      ...catalogWelcome().sections,
      ...voiceCommandSections,
    ]),
  )
})

it('does not continue the catalog explanation after leaving it for a routine', async () => {
  let finishSection: () => void = () => {}
  const speak = vi
    .spyOn(voiceServices.tts, 'speak')
    .mockResolvedValue()
    .mockImplementationOnce(async () => {})
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSection = resolve
        }),
    )
  vi.spyOn(voiceServices.tts, 'stop').mockImplementation(() => {})
  const { unmount } = render(<CatalogWelcome />)
  await screen.findByText(catalogSelection)
  expect(speak.mock.calls.map(([text]) => text)).toEqual([
    catalogWelcome().sections[0],
    catalogSelection,
  ])
  unmount()
  await voiceServices.tts.speak('Movimiento de la nueva rutina')
  await act(async () => finishSection())
  expect(speak).toHaveBeenCalledTimes(3)
  expect(speak).toHaveBeenLastCalledWith('Movimiento de la nueva rutina')
})

it('allows retrying the welcome after an audio failure', async () => {
  const speak = vi
    .spyOn(voiceServices.tts, 'speak')
    .mockResolvedValue()
    .mockRejectedValueOnce(new Error('Audio bloqueado'))
  vi.spyOn(voiceServices.tts, 'stop').mockImplementation(() => {})
  const user = userEvent.setup()
  render(<CatalogWelcome />)
  await screen.findByText(/No se pudo reproducir la bienvenida/)
  await user.click(screen.getByRole('button', { name: 'Escuchar bienvenida' }))
  await waitFor(() =>
    expect(speak.mock.calls.slice(1).map(([text]) => text)).toEqual([
      ...catalogWelcome().sections,
      ...voiceCommandSections,
    ]),
  )
  expect(
    screen.queryByText(/No se pudo reproducir la bienvenida/),
  ).not.toBeInTheDocument()
})

it('refreshes the Mexico City greeting on replay inside the voice guide', async () => {
  vi.setSystemTime(new Date('2026-10-07T17:59:00Z'))
  const speak = vi.spyOn(voiceServices.tts, 'speak').mockResolvedValue()
  vi.spyOn(voiceServices.tts, 'stop').mockImplementation(() => {})
  const user = userEvent.setup()
  render(<CatalogWelcome />)
  const guide = screen.getByRole('region', {
    name: 'Bienvenida y comandos de voz',
  })
  expect(
    within(guide).getByText(catalogWelcome().sections[0]!),
  ).toBeInTheDocument()
  expect(within(guide).queryByText(catalogSelection)).not.toBeInTheDocument()
  await screen.findByRole('button', { name: 'Escuchar bienvenida' })
  expect(within(guide).getByText(catalogSelection)).toBeInTheDocument()
  vi.setSystemTime(new Date('2026-10-07T18:00:00Z'))
  const callsBeforeReplay = speak.mock.calls.length
  let finishGreeting: () => void = () => {}
  speak.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishGreeting = resolve
      }),
  )
  await user.click(screen.getByRole('button', { name: 'Escuchar bienvenida' }))
  expect(
    within(guide).getByText('Buenas tardes. Bienvenido a taichí.'),
  ).toBeInTheDocument()
  expect(speak.mock.calls[callsBeforeReplay]?.[0]).toBe(
    catalogWelcome().sections[0],
  )
  await act(async () => finishGreeting())
})

it('shows only the currently narrated section, then leaves the selection invitation', async () => {
  let finishSection: () => void = () => {}
  const speak = vi.spyOn(voiceServices.tts, 'speak').mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finishSection = resolve
      }),
  )
  vi.spyOn(voiceServices.tts, 'stop').mockImplementation(() => {})
  render(<CatalogWelcome />)
  const guide = screen.getByRole('region', {
    name: 'Bienvenida y comandos de voz',
  })
  const sections = [...catalogWelcome().sections, ...voiceCommandSections]
  for (const [index, text] of sections.entries()) {
    expect(within(guide).getAllByRole('status')).toHaveLength(1)
    expect(within(guide).getByRole('status')).toHaveTextContent(text)
    expect(speak).toHaveBeenLastCalledWith(text)
    if (index > 0)
      expect(
        within(guide).queryByText(sections[index - 1]!),
      ).not.toBeInTheDocument()
    await act(async () => finishSection())
  }
  expect(within(guide).getByRole('status')).toHaveTextContent(catalogSelection)
  expect(
    within(guide).getByRole('button', { name: 'Escuchar bienvenida' }),
  ).toBeInTheDocument()
})
