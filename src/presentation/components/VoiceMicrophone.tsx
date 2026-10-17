import { Icon } from './Icon'

interface Props {
  speaking: boolean
  listening?: boolean
  label: string
  enabled?: boolean
  disabled?: boolean
  onClick?: () => void
}

export function VoiceMicrophone({
  speaking,
  listening = false,
  label,
  enabled,
  disabled,
  onClick,
}: Props) {
  const className = `voice-microphone${speaking ? ' voice-microphone--speaking' : ''}${listening ? ' voice-microphone--listening' : ''}`
  const icon = <Icon name="mic" />

  return onClick ? (
    <button
      type="button"
      className={className}
      aria-label={label}
      aria-pressed={enabled}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </button>
  ) : (
    <span className={className} role="img" aria-label={label}>
      {icon}
    </span>
  )
}
