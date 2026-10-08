import { describe, expect, it, vi } from 'vitest'
import {
  playCommandHelp,
  catalogWelcome,
  catalogSelection,
  routineIntroduction,
  voiceCommandSections,
} from './practiceInteraction'

describe('catalog and routine introductions', () => {
  it('welcomes the user before routine selection and introduces the available commands', () => {
    const welcome = catalogWelcome(new Date('2026-10-07T19:00:00Z'))
    expect(welcome.greeting).toBe('Buenas tardes')
    expect(welcome.text).toMatch(/^Buenas tardes\./)
    expect(welcome.text).toContain(catalogSelection)
    expect(welcome.text).toContain(
      'Durante las rutinas podrás usar estos comandos',
    )
    expect(welcome.text).not.toContain('Hoy vamos a realizar')
  })

  it.each([
    ['2026-10-07T06:00:00Z', 'Buenas noches'],
    ['2026-10-07T11:59:00Z', 'Buenas noches'],
    ['2026-10-07T12:00:00Z', 'Buenos días'],
    ['2026-10-07T17:59:00Z', 'Buenos días'],
    ['2026-10-07T18:00:00Z', 'Buenas tardes'],
    ['2026-10-08T00:59:00Z', 'Buenas tardes'],
    ['2026-10-08T01:00:00Z', 'Buenas noches'],
    ['2026-10-08T05:59:00Z', 'Buenas noches'],
  ])(
    'uses the Mexico City greeting at %s regardless of the device timezone',
    (date, greeting) => {
      const welcome = catalogWelcome(new Date(date))
      expect(welcome.greeting).toBe(greeting)
      expect(welcome.text).toMatch(new RegExp(`^${greeting}\\.`))
    },
  )

  it('names the selected routine without repeating the catalog welcome or commands', () => {
    const introduction = routineIntroduction('Brazos y coordinación')
    expect(introduction).toContain('rutina Brazos y coordinación')
    expect(introduction).not.toContain('Buenas tardes')
    expect(introduction).not.toContain('Selecciona')
    expect(introduction).not.toContain('Pausar')
  })
})

describe('playCommandHelp', () => {
  it('updates the displayed command for each spoken section', async () => {
    const onSection = vi.fn()
    const speak = vi.fn(async (text: string) => {
      expect(onSection).toHaveBeenLastCalledWith(text)
    })
    await playCommandHelp(
      { speak, stop: vi.fn() },
      new AbortController().signal,
      onSection,
    )
    expect(speak.mock.calls.map(([text]) => text)).toEqual(voiceCommandSections)
  })

  it('does not show or speak the remaining sections after cancellation', async () => {
    const controller = new AbortController()
    const onSection = vi.fn()
    const speak = vi.fn(async () => {
      controller.abort()
    })
    await playCommandHelp(
      { speak, stop: vi.fn() },
      controller.signal,
      onSection,
    )
    expect(speak).toHaveBeenCalledTimes(1)
    expect(onSection).toHaveBeenCalledTimes(1)
  })
})
