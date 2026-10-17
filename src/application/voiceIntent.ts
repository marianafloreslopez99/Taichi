export type VoiceCommand =
  | 'pause'
  | 'resume'
  | 'repeat'
  | 'next'
  | 'previous'
  | 'finish'
  | 'help'
  | 'commands'
  | 'push-to-talk'
  | 'continuous'

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
  'que acciones puedo realizar': 'commands',
  'puedes decirme que acciones puedo realizar': 'commands',
  'dime que acciones puedo realizar': 'commands',
  'que comandos puedo usar': 'commands',
  'cuales son los comandos': 'commands',
  'cuales eran los comandos': 'commands',
  'repetir comandos': 'commands',
  'repite los comandos': 'commands',
  ayuda: 'help',
  'necesito ayuda': 'help',
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

function parseCommand(text: string): VoiceCommand | undefined {
  const normalized = normalizeCommand(text)
  const mode =
    /^(?:(?:aplica|aplicar|activa|activar|cambia|cambiar|cambiemos|pon|poner|usa|usar|vuelve|volver|regresa|regresar)\s+(?:(?:a|al|el|la)\s+)?)?(?:modo\s+(?:(?:de|a)\s+)?)?(escucha continua|pulsar para hablar)$/.exec(
      normalized,
    )
  if (mode)
    return mode[1] === 'escucha continua' ? 'continuous' : 'push-to-talk'
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
    const command = parseCommand(question)
    if (command) return { type: 'command', command }
    return { type: 'wake', question }
  }

  const command = parseCommand(spoken)
  return command ? { type: 'command', command } : null
}
