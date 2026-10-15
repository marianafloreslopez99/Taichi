import type { TextToSpeechService } from './ports'
import { playVoiceGuide } from './voiceGuide'
import type { VoiceCommand } from './voiceIntent'

export type ConfirmedPracticeCommand = Exclude<
  VoiceCommand,
  'finish' | 'commands'
>

export const commandConfirmations: Record<ConfirmedPracticeCommand, string> = {
  resume: 'Continuemos con la práctica.',
  repeat: 'Voy a repetir las instrucciones.',
  previous: 'Regresemos al paso anterior.',
  pause: 'Tomemos un break.',
  next: 'Pasemos al siguiente paso.',
  help: '¿En qué te puedo ayudar?',
  'push-to-talk': 'Cambiemos a modo Pulsar para hablar.',
  continuous: 'Cambiemos a modo Escucha continua.',
}

export const practiceGuidance = {
  essentials: {
    title: 'Lo esencial para comenzar',
    text: 'Puedes decir Pausar, Continuar o Ayuda. El micrófono tiene dos modos: Escucha continua, que ya está activa, y Pulsar para hablar, que escucha cuando tocas el icono. Para cambiarlos, di Ayuda o toca Ayuda junto al micrófono.',
  },
  navigation: {
    title: 'Muévete a tu ritmo',
    text: 'La práctica avanza al terminar las instrucciones de cada paso. Puedes decir Siguiente para adelantar, Anterior para regresar o Repetir para escuchar de nuevo las instrucciones.',
  },
  questions: {
    title: 'También puedes preguntar',
    text: 'Si tienes una duda sobre un movimiento, di Oye y tu pregunta. También puedes usar Preguntar a IA. En Pulsar para hablar, toca primero el micrófono.',
  },
  finish: {
    title: 'Cuando quieras terminar',
    text: 'Estás en el último movimiento. Puedes decir Finalizar para terminar la práctica. Confirma con Sí, finalizar o di Cancelar para seguir.',
  },
  'push-to-talk': {
    title: 'Cómo usar Pulsar para hablar',
    text: 'Toca el micrófono antes de hablar. Para volver a Escucha continua, pulsa y di Escucha continua, o toca Ayuda para cambiar de modo.',
  },
} as const

export type PracticeGuidanceId = keyof typeof practiceGuidance
export const guidanceStorageKey = 'taichi.guidance.v1'

export function readGuidanceSeen(): Set<PracticeGuidanceId> {
  try {
    const saved: unknown = JSON.parse(
      window.localStorage.getItem(guidanceStorageKey) ?? '[]',
    )
    return new Set(
      Array.isArray(saved)
        ? saved.filter(
            (id): id is PracticeGuidanceId =>
              typeof id === 'string' && Object.hasOwn(practiceGuidance, id),
          )
        : [],
    )
  } catch {
    return new Set()
  }
}

export function rememberGuidance(id: PracticeGuidanceId) {
  try {
    const seen = readGuidanceSeen()
    seen.add(id)
    window.localStorage.setItem(guidanceStorageKey, JSON.stringify([...seen]))
  } catch {
    // The current practice still remembers tips if browser storage is unavailable.
  }
}

export const voiceHelpTopics = [
  {
    id: 'movements',
    title: 'Movimientos y controles',
    sections: [
      'Di Pausar para detener la guía y Continuar para retomarla.',
      'La práctica avanza al terminar las instrucciones de cada paso. Di Siguiente para adelantar, Anterior para volver al paso previo o Repetir para escuchar las instrucciones otra vez.',
    ],
  },
  {
    id: 'questions',
    title: 'Preguntas a IA',
    sections: [
      'Di Oye o Tengo una duda seguido de tu pregunta, o usa Preguntar a IA. La guía espera mientras recibes la respuesta. Al terminar, di Continuar para retomarla.',
    ],
  },
  {
    id: 'modes',
    title: 'Modos del micrófono',
    sections: [
      'En Escucha continua puedes decir comandos sin tocar la pantalla. Toca el icono para apagar o activar el micrófono.',
      'Di Pulsar para hablar para cambiar de modo. Toca el micrófono antes de cada frase; otra pulsación solicita el resultado final.',
      'Para volver, pulsa y di Escucha continua. También puedes tocar Ayuda junto al micrófono y cambiar el modo desde ese panel.',
    ],
  },
  {
    id: 'finish',
    title: 'Finalizar la práctica',
    sections: [
      'Di Finalizar en cualquier paso. Confirma con Sí, finalizar para ir al resumen, o di Cancelar para seguir. En Pulsar para hablar, pulsa el control de voz antes de responder.',
    ],
  },
] as const

export type VoiceHelpTopic = (typeof voiceHelpTopics)[number]['id']
export const voiceCommandSections: readonly string[] = voiceHelpTopics.flatMap(
  (topic) => [...topic.sections],
)
export const commandListIntroduction =
  'Aquí están los comandos por temas. Elige movimientos, preguntas a IA, modos del micrófono o finalizar para escuchar solo lo que necesitas.'

export const voiceCommandsHelp = voiceCommandSections.join(' ')

export function playCommandHelp(
  tts: TextToSpeechService,
  signal: AbortSignal,
  onSection: (text: string) => void,
  topic?: VoiceHelpTopic,
) {
  const sections = topic
    ? voiceHelpTopics.find((item) => item.id === topic)!.sections
    : voiceCommandSections
  return playVoiceGuide(
    sections.map((text) => ({ text, pauseAfterMs: 0 })),
    tts,
    signal,
    (cue) => onSection(cue.text),
  )
}

export const catalogSelection = 'Elige una rutina para comenzar.'

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
  const sections = [`${greeting}. Bienvenido a taichí.`, catalogSelection]
  return {
    greeting,
    sections,
    text: sections.join(' '),
  }
}

export function routineIntroduction(routineName: string) {
  return `Hoy vamos a realizar la rutina ${routineName}. Comencemos con calma, a tu ritmo.`
}
