export type VoiceCommand =
  'pause' | 'resume' | 'repeat' | 'next' | 'previous' | 'finish' | 'help'

export type VoiceIntent =
  | { type: 'command'; command: VoiceCommand }
  | { type: 'wake'; question: string }
  | null

const commands: Record<string, VoiceCommand> = {
  pausar: 'pause',
  pausa: 'pause',
  continuar: 'resume',
  reproducir: 'resume',
  repetir: 'repeat',
  siguiente: 'next',
  anterior: 'previous',
  finalizar: 'finish',
  'finalizar rutina': 'finish',
  'finalizar practica': 'finish',
  'que acciones puedo realizar': 'help',
  'puedes decirme que acciones puedo realizar': 'help',
  'dime que acciones puedo realizar': 'help',
  'que comandos puedo usar': 'help',
  'cuales son los comandos': 'help',
  'repetir comandos': 'help',
  'repite los comandos': 'help',
  ayuda: 'help',
}

function normalizeCommand(text: string) {
  return text
    .trim()
    .replace(/^[\s¡¿.,:;!?-]+|[\s¡¿.,:;!?-]+$/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
}

export function parseFinishConfirmation(
  transcript: string,
): 'confirm' | 'cancel' | null {
  const spoken = normalizeCommand(transcript)
    .replace(/[¡¿.,:;!?-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (
    ['si', 'si finalizar', 'confirmar', 'confirmar finalizacion'].includes(
      spoken,
    )
  )
    return 'confirm'
  if (
    [
      'no',
      'cancelar',
      'no finalizar',
      'seguir practicando',
      'continuar',
    ].includes(spoken)
  )
    return 'cancel'
  return null
}

export function parseVoiceIntent(transcript: string): VoiceIntent {
  const spoken = transcript.trim().replace(/^[\s¡¿.,:;!?-]+/g, '')
  if (!spoken) return null

  const wake = /^(oye|tengo una duda)(?=$|[\s¡¿.,:;!?-])/i.exec(spoken)
  if (wake) {
    const question = spoken
      .slice(wake[0].length)
      .replace(/^[\s¡¿.,:;!?-]+/, '')
      .trim()
    if (commands[normalizeCommand(question)] === 'help')
      return { type: 'command', command: 'help' }
    return { type: 'wake', question }
  }

  const normalized = normalizeCommand(spoken)
  const command = commands[normalized]
  return command ? { type: 'command', command } : null
}
