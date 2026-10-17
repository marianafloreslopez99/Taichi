import type { VoiceCommand } from './voiceIntent'

export interface VoiceRecognitionTiming {
  captureId?: number
  resultIndex?: number
  firstResultAt: number
  receivedAt: number
  speechEndedAt?: number
}

export interface VoiceLatencySample {
  command: VoiceCommand
  phase:
    | 'recognition'
    | 'audio-stop'
    | 'queue-wait'
    | 'action'
    | 'http'
    | 'http-headers'
    | 'response-body'
    | 'server'
    | 'db-read'
    | 'db-elapsed'
    | 'db-movement-count'
    | 'db-write'
  durationMs: number
  outcome: 'success' | 'error'
  captureId?: number
  resultIndex?: number
  recognitionBasis?: 'speech-end-event' | 'first-result' | 'unavailable'
  audioStopBasis?: 'interim' | 'final' | 'button'
  requestId?: number
  httpStatus?: number
}

export type VoiceCaptureKind = 'continuous' | 'push-to-talk' | 'question'

export interface VoiceEvaluationMetadata {
  browser: 'chrome' | 'edge' | 'firefox' | 'safari' | 'other'
  device: 'desktop' | 'tablet' | 'mobile'
  deviceProfile: 'primary' | 'lower-power'
  noise: 'quiet' | 'moderate' | 'background-speech'
  audioOutput: 'speakers' | 'headphones'
  startup: 'cold' | 'warm'
}

export interface VoiceCaptureEvent {
  name:
    | 'start-requested'
    | 'started'
    | 'speech-ended'
    | 'first-interim'
    | 'final-result'
    | 'finish-requested'
    | 'finalization-timeout'
    | 'cancel-requested'
    | 'ended'
    | 'error'
    | 'audio-started'
    | 'audio-ended'
    | 'speech-started'
    | 'vad-ready'
    | 'vad-speech-started'
    | 'vad-speech-ended'
    | 'vad-misfire'
    | 'vad-endpoint-requested'
    | 'vad-error'
    | 'command-queued'
    | 'queue-full'
    | 'phrase-ignored'
  captureId: number
  captureKind: VoiceCaptureKind
  resultIndex?: number
  command?: VoiceCommand
  reason?:
    | 'unmatched'
    | 'question-busy'
    | 'confirmation-prompt'
    | 'panel-open'
    | 'session-asking'
  errorCode?: string
}

type VoiceEvaluationEntry =
  | { kind: 'capture'; at: number; event: VoiceCaptureEvent }
  | { kind: 'latency'; at: number; sample: VoiceLatencySample }

export interface VoiceEvaluation {
  schemaVersion: 2
  metadata: VoiceEvaluationMetadata
  startedAt: string
  finishedAt: string | null
  limit: number
  droppedEntries: number
  entries: VoiceEvaluationEntry[]
}

export interface VoiceEvaluationSummary {
  command: VoiceCommand
  phase: VoiceLatencySample['phase']
  recognitionBasis?: VoiceLatencySample['recognitionBasis']
  audioStopBasis?: VoiceLatencySample['audioStopBasis']
  outcome: VoiceLatencySample['outcome']
  count: number
  p50Ms: number
  p95Ms: number
}

const samples: VoiceLatencySample[] = []
const EVALUATION_LIMIT = 1000
let captureSequence = 0
let evaluation: VoiceEvaluation | null = null

export function nextVoiceCaptureId(): number {
  return ++captureSequence
}

export function startVoiceEvaluation(metadata: VoiceEvaluationMetadata): void {
  if (evaluation && evaluation.finishedAt === null)
    throw new Error(
      'Termina la evaluación de voz actual antes de iniciar otra.',
    )
  evaluation = {
    schemaVersion: 2,
    metadata: {
      browser: metadata.browser,
      device: metadata.device,
      deviceProfile: metadata.deviceProfile,
      noise: metadata.noise,
      audioOutput: metadata.audioOutput,
      startup: metadata.startup,
    },
    startedAt: new Date().toISOString(),
    finishedAt: null,
    limit: EVALUATION_LIMIT,
    droppedEntries: 0,
    entries: [],
  }
}

function appendEvaluation(entry: VoiceEvaluationEntry): void {
  if (!evaluation || evaluation.finishedAt !== null) return
  if (evaluation.entries.length === EVALUATION_LIMIT) {
    evaluation.droppedEntries += 1
    return
  }
  evaluation.entries.push(entry)
}

export function recordVoiceCaptureEvent(event: VoiceCaptureEvent): void {
  if (!evaluation || evaluation.finishedAt !== null) return
  appendEvaluation({
    kind: 'capture',
    at: performance.now(),
    event: { ...event },
  })
}

export function getVoiceEvaluation(): VoiceEvaluation | null {
  if (!evaluation) return null
  return {
    ...evaluation,
    metadata: { ...evaluation.metadata },
    entries: evaluation.entries.map((entry) =>
      entry.kind === 'capture'
        ? { ...entry, event: { ...entry.event } }
        : { ...entry, sample: { ...entry.sample } },
    ),
  }
}

export function finishVoiceEvaluation(): VoiceEvaluation | null {
  if (evaluation && evaluation.finishedAt === null)
    evaluation.finishedAt = new Date().toISOString()
  return getVoiceEvaluation()
}

export function clearVoiceEvaluation(): void {
  evaluation = null
}

export function getVoiceEvaluationSummary(): VoiceEvaluationSummary[] {
  const groups = new Map<string, VoiceLatencySample[]>()
  for (const entry of evaluation?.entries ?? []) {
    if (entry.kind !== 'latency') continue
    const { sample } = entry
    if (
      sample.phase === 'recognition' &&
      (!sample.recognitionBasis || sample.recognitionBasis === 'unavailable')
    )
      continue
    const key = `${sample.command}:${sample.phase}:${sample.recognitionBasis ?? ''}:${sample.audioStopBasis ?? ''}:${sample.outcome}`
    const group = groups.get(key) ?? []
    group.push(sample)
    groups.set(key, group)
  }
  return [...groups.values()].map((group) => {
    const first = group[0]!
    const durations = group
      .map((sample) => sample.durationMs)
      .sort((a, b) => a - b)
    return {
      command: first.command,
      phase: first.phase,
      ...(first.recognitionBasis
        ? { recognitionBasis: first.recognitionBasis }
        : {}),
      ...(first.audioStopBasis ? { audioStopBasis: first.audioStopBasis } : {}),
      outcome: first.outcome,
      count: durations.length,
      p50Ms: durations[Math.ceil(durations.length * 0.5) - 1]!,
      p95Ms: durations[Math.ceil(durations.length * 0.95) - 1]!,
    }
  })
}

export function exportVoiceEvaluation(): string {
  return JSON.stringify(
    { evaluation: getVoiceEvaluation(), summary: getVoiceEvaluationSummary() },
    null,
    2,
  )
}

export function recordVoiceRecognitionLatency(
  command: VoiceCommand,
  timing: VoiceRecognitionTiming,
): void {
  const speechEndAvailable =
    timing.speechEndedAt !== undefined &&
    timing.speechEndedAt <= timing.receivedAt
  const recognitionBasis = speechEndAvailable
    ? 'speech-end-event'
    : timing.firstResultAt < timing.receivedAt
      ? 'first-result'
      : 'unavailable'
  recordVoiceLatency(
    command,
    'recognition',
    speechEndAvailable ? timing.speechEndedAt! : timing.firstResultAt,
    'success',
    timing.receivedAt,
    {
      recognitionBasis,
      ...(timing.captureId !== undefined
        ? { captureId: timing.captureId }
        : {}),
      ...(timing.resultIndex !== undefined
        ? { resultIndex: timing.resultIndex }
        : {}),
    },
  )
}

// Bounded, local diagnostics: no recordings, transcripts or network reporting.
export function recordVoiceLatency(
  command: VoiceCommand,
  phase: VoiceLatencySample['phase'],
  start: number,
  outcome: VoiceLatencySample['outcome'] = 'success',
  end = performance.now(),
  details: Pick<
    VoiceLatencySample,
    | 'captureId'
    | 'resultIndex'
    | 'recognitionBasis'
    | 'audioStopBasis'
    | 'requestId'
    | 'httpStatus'
  > = {},
) {
  const sample = {
    command,
    phase,
    durationMs: Math.max(0, end - start),
    outcome,
    ...details,
  }
  samples.push(sample)
  if (samples.length > 20) samples.shift()
  appendEvaluation({ kind: 'latency', at: end, sample: { ...sample } })
  const name = `taichi.voz.${phase}`
  try {
    performance.clearMeasures?.(name)
    performance.measure?.(name, {
      start,
      end: Math.max(start, end),
      detail: sample,
    })
  } catch {
    // Optional browser diagnostics must never interrupt a voice command.
  }
}

export function getVoiceLatencySamples(): readonly VoiceLatencySample[] {
  return samples.map((sample) => ({ ...sample }))
}

const voiceDiagnostics = {
  start: startVoiceEvaluation,
  finish: finishVoiceEvaluation,
  summary: getVoiceEvaluationSummary,
  export: exportVoiceEvaluation,
  clear: clearVoiceEvaluation,
}

declare global {
  interface Window {
    taichiVoiceDiagnostics?: typeof voiceDiagnostics
  }
}

// Use the application's live module instance, including after a Vite hot update.
if (import.meta.env.DEV && typeof window !== 'undefined')
  window.taichiVoiceDiagnostics = voiceDiagnostics
