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
      <div className="visual-orbit visual-orbit--outer" />
      <div className="visual-orbit visual-orbit--middle" />
      <div className="visual-sun" />
      <svg
        className="visual-figure"
        viewBox="0 0 240 240"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="120" cy="54" r="15" strokeWidth="3" />
        <path
          d="M120 70c-6 21-4 49 0 75m0-74c13 17 24 25 43 32m-43-32c-13 17-24 25-43 32m43 42c-17 20-24 43-27 66m27-66c17 20 24 43 27 66"
          strokeWidth="4"
        />
        <path
          d="M74 103c-7 6-12 13-14 20m106-20c7 6 12 13 14 20"
          strokeWidth="2"
          opacity=".65"
        />
      </svg>
      <span className="visual-ground" />
    </div>
  )
}
