import { render } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '../../app/SessionProvider'
import { routines } from '../../infrastructure/routines'
import { RoutinesPage } from './RoutinesPage'

describe('RoutinesPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: routines }), { status: 200 }),
      ),
    )
  })

  it('shows all mock routines with accessible links', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <RoutinesPage />
          </SessionProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    return screen
      .findByRole('heading', { name: /elige una rutina/i })
      .then(() => {
        expect(
          screen.getAllByRole('button', { name: /elegir esta rutina/i }),
        ).toHaveLength(7)
        expect(screen.getByText('Primeros movimientos')).toBeInTheDocument()
        expect(screen.getByText('Repaso de la forma')).toBeInTheDocument()
      })
  })
})
