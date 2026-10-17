import { describe, expect, it } from 'vitest'
import { parseFinishConfirmation, parseVoiceIntent } from './voiceIntent'

describe('parseVoiceIntent', () => {
  it.each(['constructor', '__proto__', 'hasOwnProperty'])(
    'does not treat an object property as a voice command: %s',
    (text) => {
      expect(parseVoiceIntent(text)).toBeNull()
      expect(parseVoiceIntent(`Oye, ${text}`)).toEqual({
        type: 'wake',
        question: text,
      })
    },
  )

  it.each([
    ['Pausar', 'pause'],
    ['pausa.', 'pause'],
    ['Paúsalo', 'pause'],
    ['Continuar', 'resume'],
    ['Continúa', 'resume'],
    ['REPRODUCIR', 'resume'],
    ['Repetir', 'repeat'],
    ['Repite', 'repeat'],
    ['Siguiente', 'next'],
    ['Anterior', 'previous'],
    ['Finalizar', 'finish'],
    ['Finalizar rutina.', 'finish'],
    ['Finalizar práctica', 'finish'],
    ['¿Qué acciones puedo realizar?', 'commands'],
    ['Puedes decirme qué acciones puedo realizar', 'commands'],
    ['Repetir comandos', 'commands'],
    ['Oye, ¿qué comandos puedo usar?', 'commands'],
    ['Ayuda', 'help'],
    ['Necesito ayuda', 'help'],
    ['¿Cuáles eran los comandos?', 'commands'],
    ['Aplica el modo Pulsar para hablar', 'push-to-talk'],
    ['Oye, aplica el modo Pulsar para hablar.', 'push-to-talk'],
    ['Aplica el modo Escucha continua', 'continuous'],
    ['Cambia a escucha continua', 'continuous'],
    ['Cambiar escucha continua', 'continuous'],
    ['Activa escucha continua', 'continuous'],
    ['Activa la escucha continua.', 'continuous'],
    ['Cambia el modo a escucha continua', 'continuous'],
    ['Oye, cambia a modo escucha continua', 'continuous'],
    ['Modo escucha continua', 'continuous'],
    ['Usar escucha continua', 'continuous'],
    ['Cambia a pulsar para hablar', 'push-to-talk'],
    ['Aplica  el modo  escucha continua', 'continuous'],
  ] as const)('recognizes the isolated command %s', (transcript, command) => {
    expect(parseVoiceIntent(transcript)).toEqual({ type: 'command', command })
  })

  it.each([
    ['Oye, pausar', 'pause'],
    ['Oye, paúsalo.', 'pause'],
    ['Tengo una duda: continúa', 'resume'],
    ['Oye, repite', 'repeat'],
    ['Tengo   una duda: siguiente', 'next'],
    ['Oye, anterior', 'previous'],
    ['Oye, finalizar práctica', 'finish'],
    ['Tengo una duda, repetir comandos', 'commands'],
  ] as const)(
    'routes the complete command after activation: %s',
    (text, command) => {
      expect(parseVoiceIntent(text)).toEqual({ type: 'command', command })
    },
  )

  it.each([
    'No pauses',
    'No continúes',
    'Pausar no, mejor siguiente',
    'Quiero repetirlo mañana',
    '¿Cómo hago el siguiente movimiento?',
  ])('does not execute a command inferred from a longer phrase: %s', (text) => {
    expect(parseVoiceIntent(text)).toBeNull()
    expect(parseVoiceIntent(`Oye, ${text}`)).toMatchObject({
      type: 'wake',
    })
  })

  it('ignores matching words inside background conversations', () => {
    expect(parseVoiceIntent('Vamos a pausar más tarde')).toBeNull()
    expect(parseVoiceIntent('La siguiente postura')).toBeNull()
    expect(parseVoiceIntent('pausaremos')).toBeNull()
    expect(parseVoiceIntent('Vamos a finalizar después')).toBeNull()
    expect(parseVoiceIntent('Mi vecino necesita ayuda')).toBeNull()
    expect(parseVoiceIntent('Después cambia a escucha continua')).toBeNull()
    expect(
      parseVoiceIntent('Después aplica el modo Pulsar para hablar'),
    ).toBeNull()
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
