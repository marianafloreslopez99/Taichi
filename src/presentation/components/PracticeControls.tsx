import { Icon } from './Icon'

interface Props {
  isPaused: boolean
  isFirst: boolean
  isLast: boolean
  onPrevious: () => void
  onRepeat: () => void
  onTogglePause: () => void
  onNext: () => void
}

export function PracticeControls({
  isPaused,
  isFirst,
  isLast,
  onPrevious,
  onRepeat,
  onTogglePause,
  onNext,
}: Props) {
  return (
    <div className="practice-controls" aria-label="Controles de práctica">
      <button
        className="control-button"
        onClick={onPrevious}
        disabled={isFirst}
      >
        <Icon name="arrowLeft" />
        <span>Anterior</span>
      </button>
      <button className="control-button" onClick={onRepeat}>
        <Icon name="repeat" />
        <span>Repetir</span>
      </button>
      <button
        className="control-button control-button--main"
        onClick={onTogglePause}
      >
        <Icon name={isPaused ? 'play' : 'pause'} />
        <span>{isPaused ? 'Continuar' : 'Pausar'}</span>
      </button>
      <button className="control-button" onClick={onNext}>
        <Icon name={isLast ? 'check' : 'arrowRight'} />
        <span>{isLast ? 'Finalizar' : 'Siguiente'}</span>
      </button>
    </div>
  )
}
