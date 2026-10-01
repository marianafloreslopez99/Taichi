import { useState } from 'react'
import type { Movement } from '../../domain/models'

export function MovementVisual({
  image,
  cueImage,
  alt = '',
  compact = false,
}: {
  image: Movement['image']
  cueImage?: string
  alt?: string
  compact?: boolean
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const source = cueImage
    ? `${import.meta.env.BASE_URL}img/routines/${cueImage}`
    : `${import.meta.env.BASE_URL}img/movimientos/${image}.png`
  const fallback = `${import.meta.env.BASE_URL}img/movimientos/${image}.png`
  return (
    <div
      className={`movement-visual${compact ? ' movement-visual--compact' : ''}`}
      aria-hidden={!alt}
    >
      <img
        className="movement-image"
        src={failedSource === source ? fallback : source}
        alt={alt}
        onError={() => setFailedSource(source)}
      />
    </div>
  )
}
