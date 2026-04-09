import { describe, expect, it } from 'vitest'

import {
  mapBackendProgress,
  mapBackendReport,
  mapBackendSession,
  toBackendIntakeContext,
  toBackendAnswers,
  type BackendSession,
} from '@/lib/api/adapters/genius-backend'

function buildBackendSession(overrides: Partial<BackendSession> = {}): BackendSession {
  return {
    session_id: 'sess-backend-1',
    owner_client_id: 'client-1',
    mode: 'single_decision',
    problem_statement: 'Should I join the overseas exchange program?',
    intake_context: {
      investment_amount: 10000,
      base_currency: 'USDT',
      preferred_asset_ids: ['hsk-usdc'],
      holding_period_days: 30,
      risk_tolerance: 'balanced',
      liquidity_need: 't_plus_3',
      minimum_kyc_level: 0,
      wallet_address: '',
      wants_onchain_attestation: true,
      additional_constraints: '',
    },
    status: 'COMPLETED',
    analysis_rounds_completed: 1,
    follow_up_round_limit: 10,
    follow_up_rounds_used: 2,
    follow_up_extensions_used: 0,
    follow_up_budget_exhausted: false,
    deferred_follow_up_question_count: 0,
    activity_status: 'completed',
    current_focus: 'Final recommendation and delivery are complete.',
    last_stop_reason: 'The analysis finished successfully and the final report was generated.',
    clarification_questions: [
      {
        question_id: 'q-1',
        question_text: 'What is your main goal?',
        purpose: 'Clarify the decision objective.',
        options: ['Save money', 'Broaden exposure'],
        allow_custom_input: true,
        allow_skip: true,
        priority: 1,
        answered: true,
      },
    ],
    answers: [
      {
        question_id: 'q-1',
        value: 'Broaden exposure',
        source: 'frontend',
        answered_at: '2026-03-28T12:00:00.000Z',
      },
    ],
    search_tasks: [
      {
        task_id: 'task-1',
        search_topic: 'exchange program cost',
        search_goal: 'Validate tuition and living cost signals.',
        search_scope: 'Last 12 months',
        suggested_queries: ['exchange program cost'],
        required_fields: ['title', 'date'],
        freshness_requirement: 'high',
        status: 'completed',
      },
    ],
    calculation_tasks: [
      {
        task_id: 'calc-1',
        objective: 'Run affordability check',
        formula_hint: 'tuition + rent + travel',
        input_params: {
          tuition: 12000,
        },
        unit: 'USD',
        result_value: 23000,
        result_text: '23000',
        result_payload: {},
        error_margin: 'Exact deterministic evaluation over the provided parameters.',
        notes: 'Calculated locally by the backend calculation adapter.',
        status: 'completed',
      },
    ],
    chart_tasks: [],
    evidence_items: [
      {
        evidence_id: 'ev-1',
        title: 'University fee schedule',
        source_url: 'https://example.com/fees',
        source_name: 'Example University',
        fetched_at: '2026-03-28T12:01:00.000Z',
        summary: 'Official tuition information for exchange students.',
        extracted_facts: ['Fee range available'],
        confidence: 0.82,
      },
    ],
    chart_artifacts: [
      {
        chart_id: 'chart-1',
        chart_type: 'bar',
        title: 'Program cost comparison',
        spec: {
          categories: ['Tuition', 'Housing', 'Travel'],
          series: [
            {
              name: 'Cost',
              data: [12, 8, 3],
            },
          ],
          unit: 'k USD',
        },
        notes: 'Backend preview artifact',
      },
    ],
    major_conclusions: [
      {
        conclusion_id: 'conclusion-1',
        content: 'The exchange program is viable if the scholarship lands.',
        conclusion_type: 'inference',
        basis_refs: ['ev-1'],
        confidence: 0.74,
      },
    ],
    report: {
      summary: 'The exchange option is attractive but sensitive to scholarship outcome.',
      assumptions: ['Scholarship outcome is still pending.'],
      recommendations: ['Confirm scholarship timeline before committing.'],
      open_questions: ['What is the visa processing lead time?'],
      chart_refs: ['chart-1'],
      markdown: '# Report\n\nExchange remains attractive under the right funding conditions.',
    },
    events: [
      {
        timestamp: '2026-03-28T11:50:00.000Z',
        kind: 'session_completed',
        payload: {},
      },
    ],
    created_at: '2026-03-28T11:00:00.000Z',
    updated_at: '2026-03-28T12:10:00.000Z',
    ...overrides,
  }
}

describe('genius backend contract mapping', () => {
  it('maps backend sessions into the frontend domain shape', () => {
    const session = mapBackendSession(buildBackendSession())

    expect(session.id).toBe('sess-backend-1')
    expect(session.mode).toBe('single-option')
    expect(session.questions[0]?.fieldType).toBe('single-choice')
    expect(session.calculations[0]?.formulaExpression).toBe('tuition + rent + travel')
    expect(session.calculations[0]?.result).toBe('23000')
    expect(session.calculations[0]?.units).toBe('USD')
    expect(session.lastInsight).toContain('Final')
  })

  it('builds a frontend report bundle from the backend payload', () => {
    const report = mapBackendReport(buildBackendSession())

    expect(report.summaryTitle).toContain('exchange')
    expect(report.highlights.length).toBeGreaterThan(0)
    expect(report.charts[0]?.kind).toBe('bar')
    expect(report.calculations[0]?.result).toBe('23000')
    expect(report.disclaimers[1]).toContain('图表')
  })

  it('translates progress and outgoing answers for the backend step route', () => {
    const backendSession = buildBackendSession({ status: 'ANALYZING', report: null })
    const progress = mapBackendProgress(backendSession)
    const answers = toBackendAnswers([
      {
        id: 'answer-1',
        questionId: 'q-1',
        answerStatus: 'skipped',
        selectedOptions: undefined,
        customInput: '',
        numericValue: undefined,
      },
    ])

    expect(progress.status).toBe('ANALYZING')
    expect(progress.overallProgress).toBeGreaterThan(0)
    expect(answers[0]?.question_id).toBe('q-1')
    expect(answers[0]?.value).toBe('skipped')
  })

  it('serializes wallet-derived KYC intake fields for the backend session create route', () => {
    const payload = toBackendIntakeContext({
      investmentAmount: 10000,
      baseCurrency: 'USDT',
      preferredAssetIds: ['hsk-usdc', 'cpic-estable-mmf'],
      holdingPeriodDays: 30,
      riskTolerance: 'balanced',
      liquidityNeed: 't_plus_3',
      minimumKycLevel: 2,
      walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
      walletNetwork: 'testnet',
      walletKycLevelOnchain: 2,
      walletKycVerified: true,
      wantsOnchainAttestation: true,
      additionalConstraints: 'Prefer assets with onchain proof.',
    })

    expect(payload.wallet_address).toBe('0x1234567890abcdef1234567890abcdef12345678')
    expect(payload.wallet_network).toBe('testnet')
    expect(payload.wallet_kyc_level_onchain).toBe(2)
    expect(payload.wallet_kyc_verified).toBe(true)
  })

  it('maps chain proof metadata and attestation receipts into the report view model', () => {
    const backendSession = buildBackendSession()
    backendSession.report = {
      summary: 'HashKey report',
      assumptions: ['Assume live oracle access on testnet.'],
      recommendations: ['Write attestation after reviewing the tx draft.'],
      open_questions: [],
      chart_refs: [],
      markdown: '# HashKey Report',
      chain_config: {
        ecosystem_name: 'HashKey Chain',
        native_token_symbol: 'HSK',
        default_execution_network: 'testnet',
        testnet_chain_id: 133,
        testnet_rpc_url: 'https://testnet.hsk.xyz',
        testnet_explorer_url: 'https://testnet-explorer.hsk.xyz',
        mainnet_chain_id: 177,
        mainnet_rpc_url: 'https://mainnet.hsk.xyz',
        mainnet_explorer_url: 'https://hashkey.blockscout.com',
        plan_registry_address: '0x0000000000000000000000000000000000000133',
        kyc_sbt_address: '0x0000000000000000000000000000000000000888',
        testnet_plan_registry_address: '0x0000000000000000000000000000000000000133',
        mainnet_plan_registry_address: '0x0000000000000000000000000000000000000177',
        testnet_kyc_sbt_address: '0x0000000000000000000000000000000000000888',
        mainnet_kyc_sbt_address: '0x0000000000000000000000000000000000000999',
        docs_urls: ['https://docs.hashkeychain.net/docs/Build-on-HashKey-Chain/Tools/KYC'],
        oracle_feeds: [
          {
            feed_id: 'usdc-usd',
            pair: 'USDC/USD',
            source_name: 'APRO Oracle',
            docs_url: 'https://docs.hashkeychain.net/docs/Build-on-HashKey-Chain/Tools/Oracle',
            testnet_address: '0xfeed000000000000000000000000000000000133',
            mainnet_address: '0xfeed000000000000000000000000000000000177',
            decimals: 8,
          },
        ],
      },
      market_snapshots: [
        {
          feed_id: 'usdc-usd',
          pair: 'USDC/USD',
          network: 'testnet',
          source_name: 'APRO Oracle',
          feed_address: '0xfeed000000000000000000000000000000000133',
          price: 1.0001,
          decimals: 8,
          round_id: 120,
          updated_at: '2026-04-10T12:00:00.000Z',
          fetched_at: '2026-04-10T12:00:05.000Z',
          status: 'live',
          source_url: 'https://docs.hashkeychain.net/docs/Build-on-HashKey-Chain/Tools/Oracle',
          explorer_url: 'https://testnet-explorer.hsk.xyz/address/0xfeed000000000000000000000000000000000133',
          note: 'Fetched from APRO oracle feed.',
        },
      ],
      attestation_draft: {
        chain_id: 133,
        report_hash: '0x1111111111111111111111111111111111111111111111111111111111111111',
        portfolio_hash: '0x2222222222222222222222222222222222222222222222222222222222222222',
        attestation_hash: '0x3333333333333333333333333333333333333333333333333333333333333333',
        created_at: '2026-04-10T12:00:06.000Z',
        network: 'testnet',
        contract_address: '0x0000000000000000000000000000000000000133',
        explorer_url: 'https://testnet-explorer.hsk.xyz/address/0x0000000000000000000000000000000000000133',
        event_name: 'PlanRegistered',
        ready: true,
        transaction_hash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        transaction_url: 'https://testnet-explorer.hsk.xyz/tx/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        submitted_by: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        submitted_at: '2026-04-10T12:00:10.000Z',
        block_number: 456789,
      },
    }

    const report = mapBackendReport(backendSession)

    expect(report.chainConfig?.testnetPlanRegistryAddress).toBe(
      '0x0000000000000000000000000000000000000133',
    )
    expect(report.chainConfig?.oracleFeeds[0]?.pair).toBe('USDC/USD')
    expect(report.marketSnapshots?.[0]?.status).toBe('live')
    expect(report.attestationDraft?.transactionUrl).toContain('/tx/0xaaaaaaaa')
  })
})
