import { Icon } from './Icon'
import type { VoiceCommand } from '../../application/voiceIntent'

interface Props {
  isPaused: boolean
  isFirst: boolean
  isLast: boolean
  activeCommand?: VoiceCommand | null
  onPrevious: () => void
  onRepeat: () => void
  onTogglePause: () => void
  onNext: () => void
}

export function PracticeControls({
  isPaused,
  isFirst,
  isLast,
  activeCommand,
  onPrevious,
  onRepeat,
  onTogglePause,
  onNext,
}: Props) {
  return (
    <div className="practice-controls" aria-label="Controles de práctica">
      <button
        className={`control-button${activeCommand === 'previous' ? ' control-button--active' : ''}`}
        onClick={onPrevious}
        disabled={isFirst}
      >
        <Icon name="arrowLeft" />
        <span>Anterior</span>
      </button>
      <button
        className={`control-button${activeCommand === 'repeat' ? ' control-button--active' : ''}`}
        onClick={onRepeat}
      >
        <Icon name="repeat" />
        <span>Repetir</span>
      </button>
      <button
        className={`control-button control-button--main${activeCommand === 'pause' || activeCommand === 'resume' ? ' control-button--active' : ''}`}
        onClick={onTogglePause}
      >
        <Icon name={isPaused ? 'play' : 'pause'} />
        <span>{isPaused ? 'Continuar' : 'Pausar'}</span>
      </button>
      <button
        className={`control-button${activeCommand === 'next' || (activeCommand === 'finish' && isLast) ? ' control-button--active' : ''}`}
        onClick={onNext}
      >
        <Icon name={isLast ? 'check' : 'arrowRight'} />
        <span>{isLast ? 'Finalizar' : 'Siguiente'}</span>
      </button>
    </div>
  )
}
