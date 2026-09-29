import type { Movement } from '../../domain/models'

export function MovementVisual({
  image,
  compact = false,
}: {
  image: Movement['image']
  compact?: boolean
}) {
  return (
    <div
      className={`movement-visual movement-visual--${image}${compact ? ' movement-visual--compact' : ''}`}
      aria-hidden="true"
    >
     
      <img
        className="movement-image"
        src={`/img/movimientos/${image}.png`}
        alt=""
      />
      
    </div>
  )
}
