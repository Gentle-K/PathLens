import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProblemInputPage } from '@/features/analysis/pages/problem-input-page'
import { renderWithAppState } from '@/tests/test-utils'

const createSession = vi.fn()

vi.mock('@/lib/api/use-api-adapter', () => ({
  useApiAdapter: () => ({
    analysis: {
      create: createSession,
    },
  }),
}))

describe('ProblemInputPage', () => {
  beforeEach(() => {
    createSession.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('prevents invalid short input from being submitted', async () => {
    const user = userEvent.setup()

    renderWithAppState(
      <Routes>
        <Route path="/analysis/intake" element={<ProblemInputPage />} />
      </Routes>,
      { route: '/analysis/intake?mode=multi-option', locale: 'en', apiMode: 'rest' },
    )

    const input = (await screen.findAllByTestId('problem-statement-input'))[0]
    await user.clear(input)
    await user.type(input, 'too short')
    await user.click(screen.getByTestId('problem-input-submit'))

    await waitFor(() => {
      expect(createSession).not.toHaveBeenCalled()
    })
  })

  it('submits the selected mode and navigates to clarification on success', async () => {
    const user = userEvent.setup()
    createSession.mockResolvedValue({
      id: 'sess-problem-1',
      status: 'CLARIFYING',
    })

    renderWithAppState(
      <Routes>
        <Route path="/analysis/intake" element={<ProblemInputPage />} />
        <Route path="/analysis/session/:sessionId/clarify" element={<div>clarification target</div>} />
      </Routes>,
      { route: '/analysis/intake?mode=multi-option', locale: 'en', apiMode: 'rest' },
    )

    const input = (await screen.findAllByTestId('problem-statement-input'))[0]
    await user.clear(input)
    await user.type(
      input,
      'Should I buy a car or continue using public transport if I want to preserve optionality?',
    )
    await user.click(screen.getByTestId('problem-input-submit'))

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledTimes(1)
    })
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'multi-option',
        locale: 'en',
        problemStatement:
          'Should I buy a car or continue using public transport if I want to preserve optionality?',
      }),
      expect.anything(),
    )
    expect(await screen.findByText('clarification target')).toBeInTheDocument()
  })
})
