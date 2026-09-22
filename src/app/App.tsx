import { useEffect } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router'
import { SessionProvider } from './SessionProvider'
import { Layout } from '../presentation/components/Layout'
import { RoutinesPage } from '../presentation/pages/RoutinesPage'
import { PracticePage } from '../presentation/pages/PracticePage'
import { SessionSummaryPage } from '../presentation/pages/SessionSummaryPage'
import { queryClient } from './queryClient'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <Routes>
          <Route element={<Layout />}>
            <Route index element={<RoutinesPage />} />
            <Route path="rutinas" element={<RoutinesPage />} />
            <Route path="practica/:routineId" element={<PracticePage />} />
            <Route path="resumen" element={<SessionSummaryPage />} />
            <Route
              path="*"
              element={
              <div className="container empty-state">
                <h1>Página no encontrada</h1>
                <p>Volvamos a elegir una rutina.</p>
                <a href="/">Elegir una rutina</a>
              </div>
              }
            />
          </Route>
          </Routes>
        </SessionProvider>
      </QueryClientProvider>
    </BrowserRouter>
  )
}
