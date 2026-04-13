import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router-dom'

import { ReportPage } from '@/features/analysis/pages/report-page'
import { renderWithAppState } from '@/tests/test-utils'
import type { AnalysisReport, AnalysisSession } from '@/types'

const getById = vi.fn()
const getReport = vi.fn()
const requestMoreFollowUp = vi.fn()

vi.mock('@/lib/api/use-api-adapter', () => ({
  useApiAdapter: () => ({
    analysis: {
      getById,
      getReport,
      requestMoreFollowUp,
    },
  }),
}))

function buildSession(): AnalysisSession {
  return {
    id: 'session-demo',
    mode: 'multi-option',
    locale: 'en',
    problemStatement: 'Should I apply to graduate school now, work first, or defer?',
    status: 'COMPLETED',
    createdAt: '2026-04-11T09:00:00Z',
    updatedAt: '2026-04-11T09:15:00Z',
    lastInsight: 'Funding certainty materially changes the recommendation.',
    intakeContext: {
      budgetRange: 'CNY 100k - 260k',
      timeHorizonLabel: '2 years',
      riskPreferenceLabel: 'Balanced',
      investmentAmount: 10000,
      baseCurrency: 'USD',
      preferredAssetIds: [],
      holdingPeriodDays: 180,
      riskTolerance: 'balanced',
      liquidityNeed: 't_plus_3',
      minimumKycLevel: 0,
      wantsOnchainAttestation: false,
    },
    questions: [],
    answers: [],
    searchTasks: [],
    evidence: [],
    conclusions: [
      {
        id: 'c1',
        sessionId: 'session-demo',
        conclusion: 'Working first is the safer default if cash flow matters most.',
        conclusionType: 'inference',
        basisRefs: ['calc-1'],
        confidence: 0.8,
        createdAt: '2026-04-11T09:10:00Z',
      },
    ],
    calculations: [],
    chartTasks: [],
    chartArtifacts: [],
  }
}

function buildReport(): AnalysisReport {
  return {
    id: 'report-demo',
    sessionId: 'session-demo',
    mode: 'multi-option',
    summaryTitle: 'Graduate school vs work-first decision',
    markdown:
      '# Decision summary\n\nThe safer default path is work first while preserving the graduate school option.',
    highlights: [
      {
        id: 'h1',
        label: 'Default path',
        value: 'Work first',
        detail: 'Lower short-term pressure and more optionality.',
      },
    ],
    calculations: [
      {
        id: 'calc-1',
        sessionId: 'session-demo',
        taskType: 'opportunity-cost',
        formulaExpression: 'salary_foregone - scholarship_value',
        inputParams: { salary_foregone: 68000, scholarship_value: 18000 },
        units: 'CNY equivalent',
        result: '50000',
        createdAt: '2026-04-11T09:08:00Z',
      },
    ],
    charts: [],
    evidence: [
      {
        id: 'e1',
        sessionId: 'session-demo',
        sourceType: 'web',
        sourceUrl: 'https://gradschool.example.com',
        sourceName: 'Graduate office',
        title: 'Graduate funding examples',
        summary: 'Funding packages vary widely by program.',
        extractedFacts: ['Funding uncertainty should be separated from admission uncertainty.'],
        fetchedAt: '2026-04-11T09:05:00Z',
        confidence: 0.83,
        freshness: { bucket: 'fresh', label: 'Fresh' },
      },
    ],
    assumptions: ['Assumes current salary benchmarks remain stable over the next year.'],
    unknowns: ['Funding certainty is still unresolved.'],
    warnings: ['Do not treat graduate-school upside as guaranteed without funded fit.'],
    disclaimers: ['This product supports decisions and does not replace professional advice.'],
    optionProfiles: [
      {
        id: 'o1',
        name: 'Work first',
        summary: 'Better stability and more optionality.',
        pros: ['Better cash runway'],
        cons: ['Slower academic acceleration'],
        conditions: ['Role must compound relevant skills'],
        fitFor: ['Users prioritizing stability'],
        cautionFlags: ['Comfort can reduce follow-through later'],
        estimatedCostBase: 100000,
        currency: 'CNY',
        confidence: 0.81,
        basisRefs: ['calc-1'],
      },
    ],
    assetCards: [],
    simulations: [],
    recommendedAllocations: [],
  }
}

describe('ReportPage', () => {
  beforeEach(() => {
    const session = buildSession()
    const report = buildReport()

    getById.mockReset()
    getReport.mockReset()
    requestMoreFollowUp.mockReset()

    getById.mockResolvedValue(session)
    getReport.mockResolvedValue(report)
    requestMoreFollowUp.mockResolvedValue(session)
  })

  it('renders the rebuilt report sections and boundary cues', async () => {
    renderWithAppState(
      <Routes>
        <Route path="/reports/:reportId" element={<ReportPage />} />
      </Routes>,
      {
        route: '/reports/session-demo',
        apiMode: 'rest',
        locale: 'en',
      },
    )

    expect(await screen.findByRole('heading', { name: 'Graduate school vs work-first decision' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review execution plan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Execute on HashKey Chain' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Executive summary' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Option comparison' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Unknowns and unresolved uncertainties' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Boundary note' })).toBeInTheDocument()
    expect(screen.getByText('Graduate funding examples')).toBeInTheDocument()
  })

  it('shows a recoverable error surface when the report payload fails', async () => {
    getReport.mockRejectedValue(new Error('backend exploded'))

    renderWithAppState(
      <Routes>
        <Route path="/reports/:reportId" element={<ReportPage />} />
      </Routes>,
      {
        route: '/reports/session-demo',
        apiMode: 'rest',
        locale: 'en',
      },
    )

    expect(
      await screen.findByRole('heading', { name: 'Could not load the report' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
