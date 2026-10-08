import { cleanup, render } from '@testing-library/react'
import { fireEvent, screen } from '@testing-library/dom'
import { afterEach, describe, expect, it } from 'vitest'
import { MovementVisual } from './MovementVisual'

afterEach(cleanup)

describe('MovementVisual', () => {
  it('loads the image from the selected routine even when filenames repeat', () => {
    const { rerender } = render(
      <MovementVisual
        image="opening"
        cueImage="j1/1.jpg"
        alt="Primera frase"
      />,
    )
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      '/img/routines/j1/1.jpg',
    )
    rerender(
      <MovementVisual image="opening" cueImage="j2/1.jpg" alt="Otra frase" />,
    )
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      '/img/routines/j2/1.jpg',
    )
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Otra frase')
  })

  it('falls back on an image error and shows the next cue normally', () => {
    const { rerender } = render(
      <MovementVisual image="legs" cueImage="j4/absent.png" alt="Paso" />,
    )
    fireEvent.error(screen.getByRole('img'))
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      '/img/movimientos/legs.png',
    )
    rerender(
      <MovementVisual
        image="legs"
        cueImage="j4/lateral-step.png"
        alt="Paso lateral"
      />,
    )
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      '/img/routines/j4/lateral-step.png',
    )
  })
})
