import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProgressPage } from '@/features/analysis/pages/progress-page'
import { renderWithAppState } from '@/tests/test-utils'

const getProgress = vi.fn()

vi.mock('@/lib/api/use-api-adapter', () => ({
  useApiAdapter: () => ({
    analysis: {
      getProgress,
    },
  }),
}))

describe('ProgressPage', () => {
  beforeEach(() => {
    getProgress.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the current phase, focus, pause reason, and progress percentage', async () => {
    getProgress.mockResolvedValue({
      sessionId: 'sess-progress-1',
      status: 'ANALYZING',
      overallProgress: 60,
      currentStepLabel: 'Gather evidence',
      activityStatus: 'searching_web_for_evidence',
      currentFocus: 'Compare budget, flexibility, and downside risk across the options.',
      lastStopReason: 'Waiting for the evidence batch to finish.',
      stages: [
        { id: 'clarify', title: 'Clarify', description: 'Clarify inputs', status: 'completed' },
        { id: 'plan', title: 'Plan', description: 'Plan the next round', status: 'active' },
        { id: 'report', title: 'Report', description: 'Write the report', status: 'pending' },
      ],
    })

    renderWithAppState(
      <Routes>
        <Route path="/analysis/session/:sessionId/progress" element={<ProgressPage />} />
      </Routes>,
      { route: '/analysis/session/sess-progress-1/progress', locale: 'en', apiMode: 'rest' },
    )

    expect(await screen.findByText('60%')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Current status summary' })).toBeInTheDocument()
    expect(screen.getByText('ANALYZING')).toBeInTheDocument()
    expect(
      screen.getByText('Compare budget, flexibility, and downside risk across the options.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Waiting for the evidence batch to finish.')).toBeInTheDocument()
  })

  it('shows a retryable error state when the progress API fails', async () => {
    const user = userEvent.setup()
    getProgress.mockRejectedValueOnce(new Error('timeout'))
    getProgress.mockResolvedValueOnce({
      sessionId: 'sess-progress-1',
      status: 'FAILED',
      overallProgress: 35,
      currentStepLabel: 'Report failed',
      errorMessage: 'The backend timed out.',
      stages: [],
    })

    renderWithAppState(
      <Routes>
        <Route path="/analysis/session/:sessionId/progress" element={<ProgressPage />} />
      </Routes>,
      { route: '/analysis/session/sess-progress-1/progress', locale: 'en', apiMode: 'rest' },
    )

    expect(
      await screen.findByRole('heading', { name: 'Failed to load analysis progress' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => {
      expect(getProgress).toHaveBeenCalledTimes(2)
    })
    expect((await screen.findAllByText('The backend timed out.')).length).toBeGreaterThan(0)
  })
})
