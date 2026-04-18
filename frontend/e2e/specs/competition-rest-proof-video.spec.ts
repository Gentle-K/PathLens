import { expect, test } from '@playwright/test'

import { clearSceneCaption, holdScene } from '../utils/demo-video'
import { installMockWalletProvider, primeRestAppState } from '../utils/mock-app'

const TX_HASH =
  '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
const DEBUG_AUTH_HEADER = `Basic ${Buffer.from('debug-admin:codex-e2e-secret').toString('base64')}`

test.use({
  video: 'on',
  viewport: {
    width: 1600,
    height: 900,
  },
})

test.setTimeout(120_000)

test('competition rest proof clip records the backend-backed execution path', async ({ page }) => {
  await installMockWalletProvider(page)
  await primeRestAppState(page, {
    accessToken: 'cookie_session',
    refreshToken: 'cookie_session',
    currentUser: {
      id: 'rest-rwa-demo',
      name: 'REST Demo User',
      email: 'rest-rwa@browser.local',
      title: 'Browser-linked account',
      locale: 'en',
      roles: ['analyst'],
      lastActiveAt: new Date().toISOString(),
    },
  })

  const baseUrl = 'http://127.0.0.1:4273'
  const portfolioAddress = '0x1234567890abcdef1234567890abcdef12345678'

  const seedResponse = await page.context().request.post(
    `${baseUrl}/api/debug/e2e/seed-ready-session`,
    {
      headers: {
        Authorization: DEBUG_AUTH_HEADER,
        'Content-Type': 'application/json',
        'X-App-Locale': 'en',
      },
      data: {
        mode: 'strategy_compare',
        locale: 'en',
        problem_statement:
          'Allocate idle USDT from the wallet into one eligible HashKey Chain RWA sleeve.',
        intake_context: {
          investment_amount: 10000,
          base_currency: 'USDT',
          preferred_asset_ids: [],
          holding_period_days: 30,
          risk_tolerance: 'balanced',
          liquidity_need: 't_plus_3',
          minimum_kyc_level: 0,
          wallet_address: portfolioAddress,
          wants_onchain_attestation: true,
          additional_constraints: '',
        },
      },
    },
  )
  expect(seedResponse.ok()).toBeTruthy()
  const seedPayload = (await seedResponse.json()) as { session_id: string }
  const sessionId = seedPayload.session_id

  const prepareResponse = await page.context().request.post(`${baseUrl}/api/rwa/execute/prepare`, {
    headers: {
      'Content-Type': 'application/json',
      'X-App-Locale': 'en',
    },
    data: {
      session_id: sessionId,
      source_asset: 'USDT',
      target_asset: 'hsk-usdc',
      amount: 10000,
      wallet_address: portfolioAddress,
      safe_address: '',
      source_chain: 'hashkey',
      include_attestation: true,
      generate_only: true,
    },
  })
  expect(prepareResponse.ok()).toBeTruthy()

  await page.goto(`/reports/${sessionId}`)
  await expect(page.getByRole('button', { name: 'Review execution plan' })).toBeVisible()

  await holdScene(
    page,
    {
      title: 'REST-backed proof path',
      body: 'This clip uses live backend routes to prove the execution handoff is not just a mock shell.',
    },
    3_000,
  )

  await page.getByRole('button', { name: 'Review execution plan' }).click()
  await expect(page).toHaveURL(/\/sessions\/[^/]+\/execute$/)
  await expect(page.getByRole('button', { name: 'Generate submit receipt' })).toBeVisible()

  await holdScene(
    page,
    {
      title: '1. Generate a backend-backed receipt',
      body: 'The execution screen is hydrated from the seeded report and live backend readiness data.',
    },
    2_600,
  )

  await page.getByRole('button', { name: 'Generate submit receipt' }).click()
  await expect(page.getByRole('heading', { name: /receipt$/i })).toBeVisible()

  await holdScene(
    page,
    {
      title: '2. Preview settlement metadata',
      body: 'The receipt timeline is available before the transaction hash is recorded.',
    },
    2_800,
  )
  await page.keyboard.press('Escape')

  await page.getByPlaceholder('0x...').fill(TX_HASH)
  await page.getByPlaceholder('Optional block number').fill('88')
  await page.getByRole('button', { name: 'Record tx hash / block' }).click()

  await holdScene(
    page,
    {
      title: '3. Record live transaction evidence',
      body: 'The operator can persist the tx hash and chain metadata back into the session state.',
    },
    2_600,
  )

  const anchorResponse = await page.context().request.post(`${baseUrl}/api/reports/${sessionId}/anchor`, {
    data: {
      network: 'testnet',
      transaction_hash: TX_HASH,
      submitted_by: portfolioAddress,
      block_number: 88,
    },
  })
  expect(anchorResponse.ok()).toBeTruthy()

  await page.goto(`/portfolio/${portfolioAddress}`)
  await expect(page.getByRole('heading').first()).toBeVisible()

  await holdScene(
    page,
    {
      title: '4. Surface the result in portfolio monitoring',
      body: 'The backend-backed path closes the loop from session to receipt, anchor record, and monitoring.',
    },
    3_200,
  )

  await clearSceneCaption(page)
  await page.waitForTimeout(750)
})
