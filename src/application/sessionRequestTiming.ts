import { recordVoiceLatency, type VoiceLatencySample } from './voiceLatency'
import type { VoiceCommand } from './voiceIntent'

const serverStages = [
  'server',
  'db-read',
  'db-elapsed',
  'db-movement-count',
  'db-write',
] as const
let requestSequence = 0

export function recordSessionRequestTiming(
  command: VoiceCommand,
  timing: {
    startedAt: number
    headersAt?: number
    endedAt: number
    httpStatus?: number
    serverTiming?: string | null
  },
  outcome: VoiceLatencySample['outcome'],
) {
  const details = {
    requestId: ++requestSequence,
    httpStatus: timing.httpStatus,
  }
  recordVoiceLatency(
    command,
    'http',
    timing.startedAt,
    outcome,
    timing.endedAt,
    details,
  )
  if (timing.headersAt !== undefined) {
    recordVoiceLatency(
      command,
      'http-headers',
      timing.startedAt,
      outcome,
      timing.headersAt,
      details,
    )
    recordVoiceLatency(
      command,
      'response-body',
      timing.headersAt,
      outcome,
      timing.endedAt,
      details,
    )
  }
  for (const metric of timing.serverTiming?.split(',') ?? []) {
    const match = /^\s*([a-z-]+)\s*;\s*dur=([\d.]+)\s*$/.exec(metric)
    if (!match) continue
    const stage = serverStages.find((name) => name === match[1])
    const duration = Number(match[2])
    if (!stage || !Number.isFinite(duration) || duration < 0) continue
    recordVoiceLatency(
      command,
      stage,
      timing.endedAt - duration,
      outcome,
      timing.endedAt,
      details,
    )
  }
}
