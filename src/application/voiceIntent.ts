export type VoiceCommand =
  'pause' | 'resume' | 'repeat' | 'next' | 'previous' | 'finish' | 'help'

export type VoiceIntent =
  | { type: 'command'; command: VoiceCommand }
  | { type: 'wake'; question: string }
  | null

const commands: Record<string, VoiceCommand> = {
  pausar: 'pause',
  pausa: 'pause',
  pausalo: 'pause',
  continuar: 'resume',
  continua: 'resume',
  reproducir: 'resume',
  repetir: 'repeat',
  repite: 'repeat',
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
    .replace(/\s+/g, ' ')
}

function findCommand(text: string): VoiceCommand | undefined {
  const normalized = normalizeCommand(text)
  return Object.hasOwn(commands, normalized) ? commands[normalized] : undefined
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

  const wake = /^(oye|tengo\s+una\s+duda)(?=$|[\s¡¿.,:;!?-])/i.exec(spoken)
  if (wake) {
    const question = spoken
      .slice(wake[0].length)
      .replace(/^[\s¡¿.,:;!?-]+/, '')
      .trim()
    const command = findCommand(question)
    if (command) return { type: 'command', command }
    return { type: 'wake', question }
  }

  const command = findCommand(spoken)
  return command ? { type: 'command', command } : null
}
