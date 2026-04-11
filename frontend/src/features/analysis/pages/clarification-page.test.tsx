import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ClarificationPage } from '@/features/analysis/pages/clarification-page'
import { renderWithAppState } from '@/tests/test-utils'
import type { AnalysisSession } from '@/types'

const getById = vi.fn()
const submitAnswers = vi.fn()

vi.mock('@/lib/api/use-api-adapter', () => ({
  useApiAdapter: () => ({
    analysis: {
      getById,
      submitAnswers,
    },
  }),
}))

function buildSession(): AnalysisSession {
  return {
    id: 'sess-clarify-1',
    mode: 'multi-option',
    locale: 'en',
    problemStatement: 'Should I apply for graduate school now or work for two years first?',
    status: 'CLARIFYING',
    createdAt: '2026-04-11T10:00:00Z',
    updatedAt: '2026-04-11T10:00:00Z',
    lastInsight: 'Need one high-signal clarification round.',
    activityStatus: 'waiting_for_user_clarification_answers',
    currentFocus: 'Clarify the main trade-off.',
    lastStopReason: 'The system is waiting for clarification answers.',
    intakeContext: {
      investmentAmount: 10000,
      baseCurrency: 'USDT',
      preferredAssetIds: ['hsk-usdc'],
      holdingPeriodDays: 30,
      riskTolerance: 'balanced',
      liquidityNeed: 't_plus_3',
      minimumKycLevel: 0,
      walletAddress: '',
      walletNetwork: '',
      wantsOnchainAttestation: false,
      additionalConstraints: '',
      includeNonProductionAssets: false,
      demoMode: false,
      demoScenarioId: '',
      analysisSeed: undefined,
    },
    questions: [
      {
        id: 'q-1',
        sessionId: 'sess-clarify-1',
        question: 'What matters more right now?',
        purpose: 'Need the primary objective.',
        fieldType: 'single-choice',
        options: [
          { value: 'growth', label: 'Growth', description: 'Prioritize long-term upside.' },
          { value: 'stability', label: 'Stability', description: 'Prioritize downside control.' },
        ],
        allowCustomInput: true,
        allowSkip: true,
        priority: 1,
        recommended: [],
        answered: false,
      },
      {
        id: 'q-2',
        sessionId: 'sess-clarify-1',
        question: 'Add any constraint that should override the default ranking.',
        purpose: 'Capture a hard constraint.',
        fieldType: 'textarea',
        allowCustomInput: true,
        allowSkip: true,
        priority: 2,
        recommended: [],
        answered: false,
      },
    ],
    answers: [],
    searchTasks: [],
    evidence: [],
    conclusions: [],
    calculations: [],
    chartTasks: [],
    chartArtifacts: [],
  }
}

describe('ClarificationPage', () => {
  beforeEach(() => {
    getById.mockReset()
    submitAnswers.mockReset()
    getById.mockResolvedValue(buildSession())
  })

  afterEach(() => {
    cleanup()
  })

  it('submits predefined, custom, and declined answers in one batch', async () => {
    const user = userEvent.setup()
    submitAnswers.mockResolvedValue({
      ...buildSession(),
      status: 'ANALYZING',
      questions: buildSession().questions.map((question) => ({ ...question, answered: true })),
    })

    renderWithAppState(
      <Routes>
        <Route path="/analysis/session/:sessionId/clarify" element={<ClarificationPage />} />
        <Route path="/analysis/session/:sessionId/progress" element={<div>progress target</div>} />
      </Routes>,
      { route: '/analysis/session/sess-clarify-1/clarify', locale: 'en', apiMode: 'rest' },
    )

    await user.click(await screen.findByRole('button', { name: /Growth/i }))
    await user.type(
      screen.getAllByLabelText('Custom input')[0],
      'Need to preserve optionality if admissions timing slips.',
    )
    await user.click(screen.getAllByRole('button', { name: 'Prefer not to answer' })[1])
    await user.click(screen.getByTestId('clarification-submit'))

    await waitFor(() => {
      expect(submitAnswers).toHaveBeenCalledTimes(1)
    })
    expect(submitAnswers).toHaveBeenCalledWith(
      'sess-clarify-1',
      expect.objectContaining({
        answers: [
          expect.objectContaining({
            questionId: 'q-1',
            answerStatus: 'answered',
            selectedOptions: ['growth'],
            customInput: 'Need to preserve optionality if admissions timing slips.',
          }),
          expect.objectContaining({
            questionId: 'q-2',
            answerStatus: 'declined',
          }),
        ],
      }),
    )
    expect(await screen.findByText('progress target')).toBeInTheDocument()
  })

  it('shows a recoverable error state when the session load fails', async () => {
    getById.mockRejectedValue(new Error('backend unavailable'))

    renderWithAppState(
      <Routes>
        <Route path="/analysis/session/:sessionId/clarify" element={<ClarificationPage />} />
      </Routes>,
      { route: '/analysis/session/sess-clarify-1/clarify', locale: 'en', apiMode: 'rest' },
    )

    expect(
      await screen.findByRole('heading', { name: 'Failed to load the analysis session' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
