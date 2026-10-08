import { useQuery } from '@tanstack/react-query'
import { api } from '../../infrastructure/api/client'
import { RoutineCard } from '../components/RoutineCard'
import { CatalogWelcome } from '../components/CatalogWelcome'

export function RoutinesPage() {
  const routinesQuery = useQuery({
    queryKey: ['routines'],
    queryFn: api.listRoutines,
  })

  if (routinesQuery.isLoading) {
    return (
      <div className="container empty-state" role="status">
        <h1>Cargando rutinas…</h1>
      </div>
    )
  }

  if (routinesQuery.isError) {
    return (
      <div className="container empty-state">
        <h1>No pudimos cargar las rutinas.</h1>
        <p>Revisa tu conexión e inténtalo de nuevo.</p>
        <button
          className="button button--primary"
          onClick={() => void routinesQuery.refetch()}
        >
          Intentar de nuevo
        </button>
      </div>
    )
  }

  const routines = routinesQuery.data ?? []
  return (
    <div className="container page-spacing catalog-page">
      <CatalogWelcome />
      <h1 className="catalog-title">Elige una rutina</h1>
      <div className="routine-grid">
        {routines.map((routine, index) => (
          <RoutineCard key={routine.id} routine={routine} index={index} />
        ))}
      </div>
      <p className="catalog-note">No necesitas experiencia previa.</p>
    </div>
  )
}
