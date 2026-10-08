import { describe, expect, it } from 'vitest'
import { parseFinishConfirmation, parseVoiceIntent } from './voiceIntent'

describe('parseVoiceIntent', () => {
  it.each([
    ['Pausar', 'pause'],
    ['pausa.', 'pause'],
    ['Continuar', 'resume'],
    ['REPRODUCIR', 'resume'],
    ['Repetir', 'repeat'],
    ['Siguiente', 'next'],
    ['Anterior', 'previous'],
    ['Finalizar', 'finish'],
    ['Finalizar rutina.', 'finish'],
    ['Finalizar práctica', 'finish'],
    ['¿Qué acciones puedo realizar?', 'help'],
    ['Puedes decirme qué acciones puedo realizar', 'help'],
    ['Repetir comandos', 'help'],
    ['Oye, ¿qué comandos puedo usar?', 'help'],
  ] as const)('recognizes the isolated command %s', (transcript, command) => {
    expect(parseVoiceIntent(transcript)).toEqual({ type: 'command', command })
  })

  it('ignores matching words inside background conversations', () => {
    expect(parseVoiceIntent('Vamos a pausar más tarde')).toBeNull()
    expect(parseVoiceIntent('La siguiente postura')).toBeNull()
    expect(parseVoiceIntent('pausaremos')).toBeNull()
    expect(parseVoiceIntent('Vamos a finalizar después')).toBeNull()
    expect(
      parseVoiceIntent('Me pregunto qué acciones puedo realizar mañana'),
    ).toBeNull()
  })

  it('extracts a question only after a wake phrase', () => {
    expect(parseVoiceIntent('Oye, ¿cómo debo respirar?')).toEqual({
      type: 'wake',
      question: 'cómo debo respirar?',
    })
    expect(parseVoiceIntent('Tengo una duda: ¿dónde van las manos?')).toEqual({
      type: 'wake',
      question: 'dónde van las manos?',
    })
    expect(parseVoiceIntent('Oye')).toEqual({ type: 'wake', question: '' })
    expect(parseVoiceIntent('Estoy hablando de otra cosa')).toBeNull()
  })
})

describe('parseFinishConfirmation', () => {
  it.each(['Sí', 'Sí, finalizar', 'Confirmar', 'Confirmar finalización'])(
    'recognizes %s as confirmation',
    (text) => {
      expect(parseFinishConfirmation(text)).toBe('confirm')
    },
  )
  it.each(['No', 'Cancelar', 'No finalizar', 'Continuar'])(
    'recognizes %s as cancellation',
    (text) => {
      expect(parseFinishConfirmation(text)).toBe('cancel')
    },
  )
  it.each(['Finalizar', 'Siguiente', 'Creo que sí, más tarde'])(
    'does not treat %s as confirmation',
    (text) => {
      expect(parseFinishConfirmation(text)).toBeNull()
    },
  )
})
