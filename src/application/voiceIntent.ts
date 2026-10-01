export type VoiceCommand =
  'pause' | 'resume' | 'repeat' | 'next' | 'previous' | 'finish'

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
    return { type: 'wake', question }
  }

  const normalized = spoken
    .replace(/[\s¡¿.,:;!?-]+$/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
  const command = commands[normalized]
  return command ? { type: 'command', command } : null
}
