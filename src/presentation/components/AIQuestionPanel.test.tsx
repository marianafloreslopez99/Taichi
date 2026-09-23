import { render } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AIQuestionPanel } from './AIQuestionPanel'

describe('AIQuestionPanel', () => {
  it('lets the user write and submit a real question', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <AIQuestionPanel
        status="IDLE"
        question=""
        answer=""
        error=""
        audioError={false}
        requiresProfessionalAdvice={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        onReplay={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    const input = screen.getByLabelText(/escribe tu duda/i)
    const submit = screen.getByRole('button', { name: /preguntar a gemini/i })
    expect(submit).toBeDisabled()
    await user.type(input, '¿Cómo debo respirar?')
    await user.click(submit)
    expect(onSubmit).toHaveBeenCalledWith('¿Cómo debo respirar?')
  })
})
