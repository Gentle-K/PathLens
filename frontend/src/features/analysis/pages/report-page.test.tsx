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

vi.mock('@/lib/web3/use-hashkey-wallet', () => ({
  useHashKeyWallet: () => ({
    hasProvider: false,
    walletAddress: '',
    walletChainId: null,
    walletNetwork: '',
    walletLabel: '',
    networkLabel: 'Not connected',
    isConnected: false,
    isWalletBusy: false,
    connectWallet: vi.fn(),
    switchNetwork: vi.fn(),
    disconnectWallet: vi.fn(),
    kycSnapshot: undefined,
    kycError: null,
    kycLoading: false,
  }),
  useLiveMarketSnapshots: () => ({
    data: [],
    error: null,
  }),
}))

function buildSession(): AnalysisSession {
  return {
    id: 'session-rwa-demo',
    mode: 'multi-option',
    locale: 'en',
    problemStatement: 'Build a liquidity-aware RWA portfolio.',
    status: 'COMPLETED',
    createdAt: '2026-04-11T09:00:00Z',
    updatedAt: '2026-04-11T09:15:00Z',
    lastInsight: 'USDC remains the default liquidity sleeve.',
    intakeContext: {
      investmentAmount: 10000,
      baseCurrency: 'USDT',
      preferredAssetIds: ['hsk-usdc', 'cpic-estable-mmf'],
      holdingPeriodDays: 30,
      riskTolerance: 'balanced',
      liquidityNeed: 't_plus_3',
      minimumKycLevel: 1,
      wantsOnchainAttestation: true,
      includeNonProductionAssets: false,
      demoMode: true,
      demoScenarioId: 'conservative-10000-usdt',
      analysisSeed: 20260401,
    },
    questions: [],
    answers: [],
    searchTasks: [],
    evidence: [],
    conclusions: [],
    calculations: [],
    chartTasks: [],
    chartArtifacts: [],
  }
}

function buildReport(): AnalysisReport {
  return {
    id: 'report-rwa-demo',
    sessionId: 'session-rwa-demo',
    mode: 'multi-option',
    summaryTitle: 'Liquidity-aware RWA allocation',
    markdown: '# Summary\n\nUSDC remains the first sleeve.',
    highlights: [
      {
        id: 'return',
        label: 'Expected net return',
        value: '5.1%',
        detail: 'Net of recurring fees.',
      },
    ],
    calculations: [],
    charts: [],
    evidence: [
      {
        id: 'evidence-usdc',
        sessionId: 'session-rwa-demo',
        assetId: 'hsk-usdc',
        sourceType: 'web',
        sourceUrl: 'https://docs.hashkeychain.net/example',
        sourceName: 'HashKey Docs',
        title: 'USDC contract metadata',
        summary: 'Onchain contract details and settlement path.',
        extractedFacts: ['Earliest exit: T+0', 'KYC threshold: L0'],
        fetchedAt: '2026-04-11T08:00:00Z',
        confidence: 0.91,
        sourceTag: 'onchain_verified',
        factType: 'onchain_verified_fact',
        freshness: {
          bucket: 'fresh',
          label: 'Fresh',
          ageHours: 2,
        },
        conflictKeys: [],
      },
    ],
    assumptions: ['This is not financial advice.'],
    unknowns: ['Issuer-side redemption queue length is not directly observable.'],
    warnings: ['Evidence coverage for MMF remains partial.'],
    disclaimers: ['KYC and eligibility remain indicative unless verified onchain.'],
    tables: [],
    chainConfig: {
      ecosystemName: 'HashKey Chain',
      nativeTokenSymbol: 'HSK',
      defaultExecutionNetwork: 'testnet',
      testnetChainId: 133,
      testnetRpcUrl: 'https://testnet.hsk.xyz',
      testnetExplorerUrl: 'https://testnet-explorer.hsk.xyz',
      mainnetChainId: 177,
      mainnetRpcUrl: 'https://mainnet.hsk.xyz',
      mainnetExplorerUrl: 'https://hashkey.blockscout.com',
      planRegistryAddress: '0x0000000000000000000000000000000000000133',
      kycSbtAddress: '0x0000000000000000000000000000000000000134',
      testnetPlanRegistryAddress: '0x0000000000000000000000000000000000000133',
      mainnetPlanRegistryAddress: '0x0000000000000000000000000000000000000177',
      testnetKycSbtAddress: '0x0000000000000000000000000000000000000134',
      mainnetKycSbtAddress: '0x0000000000000000000000000000000000000178',
      docsUrls: [],
      oracleFeeds: [],
    },
    marketSnapshots: [],
    assetCards: [
      {
        assetId: 'hsk-usdc',
        symbol: 'USDC',
        name: 'HashKey USDC',
        assetType: 'stablecoin',
        issuer: 'Circle / bridged deployment',
        custody: 'Bridged USDC',
        chainId: 177,
        contractAddress: '0x054ed45810DbBAb8B27668922D110669c9D88D0a',
        expectedReturnLow: 0.03,
        expectedReturnBase: 0.049,
        expectedReturnHigh: 0.064,
        exitDays: 0,
        totalCostBps: 33,
        kycRequiredLevel: 0,
        thesis: 'Acts as the reserve sleeve.',
        fitSummary: 'Best liquidity fit for the current profile.',
        tags: ['stablecoin', 'liquidity'],
        primarySourceUrl: 'https://docs.hashkeychain.net/example',
        onchainVerified: true,
        issuerDisclosed: true,
        statuses: ['production', 'verified'],
        truthLevel: 'onchain_verified',
        liveReadiness: 'ready',
        defaultRankEligible: true,
        statusExplanation: 'Production-like stablecoin route with live contract visibility.',
        truthLevelExplanation: 'Core facts are anchored by onchain reads.',
        riskVector: {
          assetId: 'hsk-usdc',
          assetName: 'HashKey USDC',
          market: 15,
          liquidity: 10,
          pegRedemption: 12,
          issuerCustody: 18,
          smartContract: 8,
          oracleDependency: 6,
          complianceAccess: 5,
          overall: 12,
        },
        riskBreakdown: [
          {
            dimension: 'liquidity',
            normalizedScore: 10,
            weight: 0.2,
            evidenceRefs: ['evidence-usdc'],
            note: 'T+0 exit',
          },
        ],
        riskDataQuality: 0.88,
        metadata: {},
        evidenceRefs: ['evidence-usdc'],
      },
    ],
    simulations: [],
    recommendedAllocations: [
      {
        assetId: 'hsk-usdc',
        assetName: 'HashKey USDC',
        targetWeightPct: 65,
        suggestedAmount: 6500,
        rationale: 'Highest liquidity fit under current constraints.',
      },
      {
        assetId: 'cpic-estable-mmf',
        assetName: 'CPIC Estable MMF',
        targetWeightPct: 35,
        suggestedAmount: 3500,
        rationale: 'Adds carry once liquidity reserve is covered.',
      },
    ],
    comparisonMatrix: {
      title: 'Comparison matrix',
      metrics: [
        {
          key: 'expected_return',
          label: 'Expected return',
          description: 'Annualized base-case return before fees.',
        },
        {
          key: 'liquidity',
          label: 'Liquidity',
          description: 'Exit speed and redemption friction.',
        },
      ],
      rows: [
        {
          assetId: 'hsk-usdc',
          assetName: 'HashKey USDC',
          assetSymbol: 'USDC',
          statuses: ['production', 'verified'],
          truthLevel: 'onchain_verified',
          liveReadiness: 'ready',
          defaultRankEligible: true,
          cells: [
            {
              metricKey: 'expected_return',
              label: 'Expected return',
              displayValue: '4.9%',
              rawValue: 0.049,
              tone: 'success',
              badges: ['Top pick'],
              rationale: 'Highest certainty-adjusted carry among liquid assets.',
              tooltip: 'Base expected return before execution slippage.',
              isBlocked: false,
            },
            {
              metricKey: 'liquidity',
              label: 'Liquidity',
              displayValue: 'T+0',
              rawValue: 't0',
              tone: 'success',
              badges: ['Liquid'],
              rationale: 'Immediate redemption path.',
              tooltip: 'No lockup and low redemption friction.',
              isBlocked: false,
            },
          ],
        },
      ],
      notes: ['Demo mode uses a fixed seed and fixed asset universe.'],
    },
    recommendationReason: {
      summary: 'USDC wins because it clears the liquidity constraint without sacrificing too much carry.',
      topDrivers: [
        {
          title: 'Liquidity reserve',
          detail: 'USDC keeps a T+0 sleeve while preserving stable carry.',
          impact: 'high',
          assetId: 'hsk-usdc',
        },
      ],
      excludedReasons: [
        {
          assetId: 'tokenized-real-estate-demo',
          assetName: 'Tokenized Real Estate Demo',
          reason: 'Excluded by default because demo assets are not production-eligible.',
        },
      ],
      constraintImpacts: [
        {
          constraintKey: 'liquidity_need',
          label: 'Liquidity need',
          impactLevel: 'high',
          detail: 'T+3 maximum exit eliminated longer-lockup sleeves.',
        },
      ],
      sensitivitySummary: [
        {
          scenarioKey: 'longer_horizon',
          label: 'Longer horizon',
          impactSummary: 'A longer holding period would shift more weight to MMF carry.',
          changedAssets: ['CPIC Estable MMF'],
          recommendedShift: 'Increase MMF weight.',
        },
      ],
    },
    actionIntents: [
      {
        assetId: 'hsk-usdc',
        assetName: 'HashKey USDC',
        actionType: 'hold',
        actionReadiness: 'ready',
        summary: 'Keep USDC as the execution-ready reserve sleeve.',
        actionBlockers: [],
        actionLinks: [
          {
            kind: 'docs',
            label: 'Token docs',
            url: 'https://docs.hashkeychain.net/example',
          },
        ],
        executionNotes: ['Validate settlement wallet.'],
        checklist: ['Confirm wallet network', 'Keep minimum T+0 reserve'],
      },
    ],
    evidenceGovernance: {
      overallScore: 0.74,
      weakEvidenceWarning: 'MMF evidence remains partially issuer-disclosed.',
      conflicts: [],
      coverage: [
        {
          assetId: 'hsk-usdc',
          assetName: 'HashKey USDC',
          coverageScore: 0.82,
          completenessScore: 0.8,
          strengths: ['Onchain contract read'],
          gaps: ['Issuer-side ops'],
          missingFields: ['redemption queue'],
        },
      ],
    },
    reanalysisDiff: {
      previousSnapshotAt: '2026-04-10T09:00:00Z',
      currentGeneratedAt: '2026-04-11T09:15:00Z',
      summary: 'Liquidity constraint tightened',
      changedConstraints: [
        {
          label: 'Liquidity',
          before: 'Lockup OK',
          after: 'T+3',
          detail: 'The user now requires a faster exit window.',
        },
      ],
      changedWeights: [
        {
          assetId: 'hsk-usdc',
          assetName: 'HashKey USDC',
          beforeWeightPct: 40,
          afterWeightPct: 65,
          deltaWeightPct: 25,
          reason: 'Liquidity reserve expanded.',
        },
      ],
      changedRisk: [
        {
          assetId: 'hsk-usdc',
          assetName: 'HashKey USDC',
          beforeOverall: 14,
          afterOverall: 12,
          deltaOverall: -2,
        },
      ],
      changedEvidence: [
        {
          assetId: 'cpic-estable-mmf',
          assetName: 'CPIC Estable MMF',
          beforeCoverageScore: 0.52,
          afterCoverageScore: 0.64,
          beforeConflictCount: 1,
          afterConflictCount: 0,
          summary: 'Issuer docs clarified redemption timing.',
        },
      ],
      previousRecommendation: ['40% USDC', '60% MMF'],
      currentRecommendation: ['65% USDC', '35% MMF'],
      whyChanged: ['The tighter liquidity target increased the cash-like reserve weight.'],
    },
    methodologyReferences: [],
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

  it('renders the new RWA result sections without breaking the page', async () => {
    renderWithAppState(
      <Routes>
        <Route path="/analysis/session/:sessionId/report" element={<ReportPage />} />
      </Routes>,
      {
        route: '/analysis/session/session-rwa-demo/report',
        apiMode: 'rest',
        locale: 'en',
      },
    )

    await screen.findByTestId('comparison-matrix', {}, { timeout: 5000 })
    await screen.findByTestId('recommendation-drivers', {}, { timeout: 5000 })
    await screen.findByTestId('next-step-panel', {}, { timeout: 5000 })
    await screen.findByTestId('reanalysis-diff-card', {}, { timeout: 5000 })

    expect(
      screen.getByRole('heading', { name: 'Comparison matrix' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Why this recommendation?' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Next steps' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', {
        name: 'Assumptions, unknowns, and warnings',
      }, { timeout: 5000 }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Re-analysis diff' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Risk changes')).toBeInTheDocument()
    expect(screen.getByText('Evidence changes')).toBeInTheDocument()
    expect(screen.getByText('Previous recommendation')).toBeInTheDocument()
    expect(screen.getByText('Current recommendation')).toBeInTheDocument()
    expect(screen.getByText('74%')).toBeInTheDocument()
    expect(screen.getByText('Fresh')).toBeInTheDocument()
  })

  it('shows a recoverable error surface when the report payload fails', async () => {
    getReport.mockRejectedValueOnce(new Error('backend exploded'))

    renderWithAppState(
      <Routes>
        <Route path="/analysis/session/:sessionId/report" element={<ReportPage />} />
      </Routes>,
      {
        route: '/analysis/session/session-rwa-demo/report',
        apiMode: 'rest',
        locale: 'en',
      },
    )

    expect(
      await screen.findByText('The result page is temporarily unavailable'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry report' })).toBeInTheDocument()
  })
})
