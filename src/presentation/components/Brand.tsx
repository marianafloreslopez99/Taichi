import { Link } from 'react-router'

export function Brand() {
  return (
    <Link className="brand" to="/" aria-label="Taichi, elegir rutina">
      <span className="brand-mark">
        <span />
      </span>
      <span>
        taichi<span className="brand-dot">.</span>
      </span>
    </Link>
  )
}
