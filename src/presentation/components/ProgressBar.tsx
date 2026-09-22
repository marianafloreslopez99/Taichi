export function ProgressBar({
  current,
  total,
}: {
  current: number
  total: number
}) {
  const percent = Math.round(((current + 1) / total) * 100)
  return (
    <div className="progress-wrap">
      <div className="progress-label">
        <span>Tu recorrido</span>
        <span>
          {current + 1} de {total} movimientos
        </span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={current + 1}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label="Progreso de la rutina"
      >
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
