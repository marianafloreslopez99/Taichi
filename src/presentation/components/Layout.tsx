import { Outlet } from 'react-router'
import { Brand } from './Brand'

export function Layout() {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main">
        Saltar al contenido
      </a>
      <header className="site-header container">
        <Brand />
      </header>
      <main id="main">
        <Outlet />
      </main>
      <footer className="site-footer container">
        <p>Muévete a tu propio ritmo.</p>
      </footer>
    </div>
  )
}
