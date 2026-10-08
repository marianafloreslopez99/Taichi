import { Link, Navigate, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useSession } from '../../app/SessionProvider'
import { flattenRoutineMovements } from '../../domain/routines'
import { api } from '../../infrastructure/api/client'
import { Icon } from '../components/Icon'

export function SessionSummaryPage() {
  const { session, clear, start } = useSession()
  const navigate = useNavigate()
  const routineQuery = useQuery({
    queryKey: ['routine', session?.routineId],
    queryFn: () => api.getRoutine(session!.routineId),
    enabled: Boolean(session?.routineId),
  })
  const routine = routineQuery.data
  if (routineQuery.isLoading)
    return (
      <div className="container empty-state" role="status">
        <h1>Preparando tu resumen…</h1>
      </div>
    )
  if (!session || !routine || session.status !== 'COMPLETED')
    return <Navigate to="/rutinas" replace />
  const movementCount = flattenRoutineMovements(routine).length
  const finishedEarly = session.currentMovementIndex < movementCount - 1
  const restart = () => {
    void start(routine).then((newSession) =>
      navigate(`/practica/${newSession.routineId}`),
    )
  }
  return (
    <div className="container summary-page">
      <div className="summary-art">
        <div className="summary-circle">
          <Icon name="check" />
        </div>
        <span className="eyebrow">UN MOMENTO PARA CELEBRAR</span>
      </div>
      <h1>
        Lo hiciste.
        <br />
        <em>Quédate con esa calma.</em>
      </h1>
      <p>
        Finalizaste tu práctica de <strong>{routine.name}</strong>. Cada
        movimiento fue una forma de volver a ti.
      </p>
      <div className="summary-stats">
        <div>
          <strong>
            {finishedEarly
              ? `${session.currentMovementIndex + 1}/${movementCount}`
              : routine.exercises.length}
          </strong>
          <span>{finishedEarly ? 'paso alcanzado' : 'ejercicios'}</span>
        </div>
        <div>
          <strong>
            {Math.floor(session.elapsedSeconds / 60)}:
            {String(session.elapsedSeconds % 60).padStart(2, '0')}
          </strong>
          <span>tiempo activo</span>
        </div>
        <div>
          <strong>{session.questions.length}</strong>
          <span>preguntas</span>
        </div>
      </div>
      <div className="summary-actions">
        <button
          className="button button--primary button--large"
          onClick={restart}
        >
          Repetir rutina <Icon name="repeat" />
        </button>
        <Link className="button button--quiet" to="/" onClick={clear}>
          Elegir otra rutina <Icon name="arrowRight" />
        </Link>
      </div>
      <p className="summary-end">Gracias por darte este espacio.</p>
      <span className="sr-only">
        Práctica finalizada en el paso {session.currentMovementIndex + 1} de{' '}
        {movementCount}.
      </span>
    </div>
  )
}
