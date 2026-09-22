import { useNavigate } from 'react-router'
import { useSession } from '../../app/SessionProvider'
import type { Routine } from '../../domain/models'
import { Icon } from './Icon'
import { MovementVisual } from './MovementVisual'

export function RoutineCard({
  routine,
  index = 0,
}: {
  routine: Routine
  index?: number
}) {
  const navigate = useNavigate()
  const { start } = useSession()
  const chooseRoutine = async () => {
    const session = await start(routine)
    navigate(`/practica/${session.routineId}`)
  }

  return (
    <article
      className="routine-card"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="routine-card-art">
        <MovementVisual
          visual={routine.movements[0]?.visual ?? 'opening'}
          compact
        />
        <span className="card-index">0{index + 1}</span>
      </div>
      <div className="routine-card-body">
        <span className="eyebrow">{routine.category}</span>
        <h3>{routine.name}</h3>
        <p>{routine.description}</p>
        <div className="routine-meta">
          <span>{routine.estimatedMinutes} min</span>
          <span>{routine.difficulty}</span>
          <span>{routine.movements.length} movimientos</span>
        </div>
        <button
          className="button button--primary routine-card-action"
          onClick={chooseRoutine}
        >
          Elegir esta rutina <Icon name="arrowRight" />
        </button>
      </div>
    </article>
  )
}
