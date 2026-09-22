import { Link, Navigate, useNavigate } from 'react-router'
import { useSession } from '../../app/SessionProvider'
import { getRoutine } from '../../infrastructure/routines'
import { Icon } from '../components/Icon'

export function SessionSummaryPage() {
  const { session, clear, start } = useSession()
  const navigate = useNavigate()
  const routine = getRoutine(session?.routineId)
  if (!session || !routine || session.status !== 'COMPLETED')
    return <Navigate to="/rutinas" replace />
  const restart = () => {
    void start(routine).then((newSession) => navigate(`/practica/${newSession.routineId}`))
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
        Completaste <strong>{routine.name}</strong>. Cada movimiento fue una
        forma de volver a ti.
      </p>
      <div className="summary-stats">
        <div>
          <strong>{routine.movements.length}</strong>
          <span>movimientos</span>
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
    </div>
  )
}
