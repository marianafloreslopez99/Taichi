import type { VoiceCaptureKind } from './voiceLatency'

export interface VoiceIntervention {
  readonly id: number
  readonly kind: VoiceCaptureKind
}

export type VoiceCaptureState =
  | { status: 'IDLE' }
  | {
      status: 'CAPTURING' | 'FINALIZING' | 'RECONNECTING'
      intervention: VoiceIntervention
    }

// Owns the logical microphone lease. Browser callbacks must retain the lease
// returned by begin(), rather than relying on the current UI state.
export class VoiceController {
  private active: {
    intervention: VoiceIntervention
    status: 'CAPTURING' | 'FINALIZING' | 'RECONNECTING'
    cancel: () => void
  } | null = null

  begin(
    id: number,
    kind: VoiceCaptureKind,
    cancel: () => void,
  ): VoiceIntervention {
    const previous = this.active
    this.active = null
    previous?.cancel()
    if (this.active)
      throw new Error(
        'No se puede iniciar otra captura durante una cancelación.',
      )
    const intervention: VoiceIntervention = Object.freeze({ id, kind })
    this.active = { intervention, status: 'CAPTURING', cancel }
    return intervention
  }

  isCurrent(intervention: VoiceIntervention | null): boolean {
    return intervention !== null && this.active?.intervention === intervention
  }

  requestFinish(intervention: VoiceIntervention | null): boolean {
    if (!this.isCurrent(intervention) || this.active!.status !== 'CAPTURING')
      return false
    this.active!.status = 'FINALIZING'
    return true
  }

  end(intervention: VoiceIntervention | null): void {
    if (this.isCurrent(intervention)) this.active = null
  }

  reconnect(intervention: VoiceIntervention | null): void {
    if (this.isCurrent(intervention)) this.active!.status = 'RECONNECTING'
  }

  getState(): VoiceCaptureState {
    return this.active
      ? { status: this.active.status, intervention: this.active.intervention }
      : { status: 'IDLE' }
  }
}
