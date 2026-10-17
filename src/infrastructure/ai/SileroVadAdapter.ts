import type { MicVAD, RealTimeVADOptions } from '@ricky0123/vad-web'
import {
  VOICE_VAD_CONFIG,
  type VoiceVadMode,
  type VoiceVadProfileName,
  type VoiceVadProfile,
} from '../../application/voiceConfig'

export interface VoiceActivityCallbacks {
  onReady(): void
  onSpeechStart(): void
  onSpeechEnd(): void
  onMisfire(): void
  onError(): void
}

export interface VoiceActivityDetector {
  readonly mode: VoiceVadMode
  start(
    owner: object,
    profile: VoiceVadProfileName,
    callbacks: VoiceActivityCallbacks,
  ): void
  stop(owner: object): void
  destroy(): Promise<void>
}

type VadInstance = Pick<MicVAD, 'start' | 'pause' | 'destroy' | 'setOptions'>
type VadFactory = (options: Partial<RealTimeVADOptions>) => Promise<VadInstance>

interface ActiveOwner {
  owner: object
  profile: VoiceVadProfileName
  callbacks: VoiceActivityCallbacks
}

const defaultFactory: VadFactory = async (options) => {
  const { MicVAD } = await import('@ricky0123/vad-web')
  return MicVAD.new(options)
}

// One lazy Silero instance is shared by command and question recognition.
// Ownership changes synchronously; queued async lifecycle calls can therefore
// never deliver an old capture's callbacks to a newer intervention.
export class SileroVadAdapter implements VoiceActivityDetector {
  readonly mode: VoiceVadMode
  private active: ActiveOwner | null = null
  private requested: ActiveOwner | null = null
  private instance: VadInstance | null = null
  private operations: Promise<void> = Promise.resolve()
  private generation = 0

  constructor(
    mode: VoiceVadMode = VOICE_VAD_CONFIG.mode,
    private readonly factory: VadFactory = defaultFactory,
  ) {
    this.mode = mode
  }

  start(
    owner: object,
    profile: VoiceVadProfileName,
    callbacks: VoiceActivityCallbacks,
  ): void {
    if (this.mode === 'off') return
    const active = { owner, profile, callbacks }
    this.requested = active
    this.active = null
    const generation = this.generation
    this.enqueue(async () => {
      if (!this.isRequested(active, generation)) return
      try {
        await this.instance?.pause()
      } catch {
        // A failed pause must not route old events into the new owner.
      }
      if (!this.isRequested(active, generation)) return
      const instance = await this.ensureInstance(generation)
      if (!instance || !this.isRequested(active, generation)) return
      instance.setOptions(this.profileOptions(profile))
      try {
        await instance.start()
        if (!this.isRequested(active, generation)) return
        this.active = active
        callbacks.onReady()
      } catch {
        if (this.instance === instance) this.instance = null
        await instance.destroy().catch(() => undefined)
        if (this.isRequested(active, generation)) callbacks.onError()
      }
    })
  }

  stop(owner: object): void {
    if (
      this.mode === 'off' ||
      (this.active?.owner !== owner && this.requested?.owner !== owner)
    )
      return
    this.active = null
    this.requested = null
    this.enqueue(async () => {
      try {
        await this.instance?.pause()
      } catch {
        // VAD is optional; native STT remains available after a pause failure.
      }
    })
  }

  async destroy(): Promise<void> {
    this.active = null
    this.requested = null
    this.generation += 1
    await this.enqueue(async () => {
      const instance = this.instance
      this.instance = null
      try {
        await instance?.destroy()
      } catch {
        // Teardown must not keep the practice route mounted.
      }
    })
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    this.operations = this.operations.then(operation, operation)
    return this.operations
  }

  private async ensureInstance(
    generation: number,
  ): Promise<VadInstance | null> {
    if (this.instance) return this.instance
    try {
      const instance = await this.factory({
        model: VOICE_VAD_CONFIG.model,
        baseAssetPath: VOICE_VAD_CONFIG.assetBasePath,
        onnxWASMBasePath: VOICE_VAD_CONFIG.onnxWASMBasePath,
        startOnLoad: false,
        processorType: 'auto',
        ortConfig: (ort) => {
          ort.env.wasm.numThreads = 1
        },
        ...this.profileOptions('command'),
        onSpeechStart: () => this.active?.callbacks.onSpeechStart(),
        onSpeechRealStart: () => undefined,
        onSpeechEnd: () => this.active?.callbacks.onSpeechEnd(),
        onVADMisfire: () => this.active?.callbacks.onMisfire(),
      })
      if (generation !== this.generation) {
        await instance.destroy().catch(() => undefined)
        return null
      }
      this.instance = instance
      return instance
    } catch {
      this.requested?.callbacks.onError()
      return null
    }
  }

  private isRequested(active: ActiveOwner, generation: number): boolean {
    return this.requested === active && this.generation === generation
  }

  private profileOptions(profile: VoiceVadProfileName): VoiceVadProfile {
    return VOICE_VAD_CONFIG.profiles[profile]
  }
}
