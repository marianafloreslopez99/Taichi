import type { TextToSpeechService } from './ports'
import { playVoiceGuide } from './voiceGuide'

export const voiceCommandSections = [
  'Puedes decir Pausar para detener la guía, y Continuar para retomarla.',
  'Di Repetir para escuchar de nuevo el movimiento actual.',
  'Di Siguiente para avanzar, o Anterior para volver al movimiento previo.',
  'Puedes decir Finalizar en cualquier paso. Te pediré confirmación: di Sí, finalizar para ir al resumen, o Cancelar para seguir practicando.',
  'Si tienes una pregunta sobre el ejercicio, di Oye y luego tu pregunta.',
  'Para escuchar estos comandos otra vez, di Qué acciones puedo realizar, o Repetir comandos.',
  'Si hay mucho ruido, elige Pulsar para hablar en Modo de voz. Pulsa el botón antes de decir un comando o responder a la confirmación.',
]

export const voiceCommandsHelp = voiceCommandSections.join(' ')

export function playCommandHelp(
  tts: TextToSpeechService,
  signal: AbortSignal,
  onSection: (text: string) => void,
) {
  return playVoiceGuide(
    voiceCommandSections.map((text) => ({ text, pauseAfterMs: 0 })),
    tts,
    signal,
    (cue) => onSection(cue.text),
  )
}

export const catalogSelection =
  'Selecciona la opción que prefieras. Puedes hacerla con calma y detenerte cuando lo necesites.'

export function catalogWelcome(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now),
  )
  const greeting =
    hour >= 6 && hour < 12
      ? 'Buenos días'
      : hour >= 12 && hour < 19
        ? 'Buenas tardes'
        : 'Buenas noches'
  const sections = [
    `${greeting}. Bienvenido a taichí.`,
    catalogSelection,
    'Durante las rutinas podrás usar estos comandos.',
  ]
  return {
    greeting,
    sections,
    text: sections.join(' '),
  }
}

export function routineIntroduction(routineName: string) {
  return `Hoy vamos a realizar la rutina ${routineName}. Comencemos con calma, a tu ritmo.`
}
