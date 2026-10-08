export interface VoiceTalkControl {
  available: boolean
  capturing: boolean
  onTalk: () => void
}

export function VoiceTalkButton({
  available,
  capturing,
  onTalk,
}: VoiceTalkControl) {
  return (
    <button
      className="voice-console-toggle voice-talk-button"
      onClick={onTalk}
      disabled={!available}
      aria-pressed={capturing}
    >
      {capturing ? 'Terminar escucha' : 'Pulsar para hablar'}
    </button>
  )
}
