import { expect, test } from '@playwright/test'

import { installMockWalletProvider, primeRestAppState } from '../utils/mock-app'

const TX_HASH =
  '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

test('rest-backed RWA workbench flow reaches execute, simulate, receipt, and monitoring state', async ({
  page,
}) => {
  await installMockWalletProvider(page)
  await primeRestAppState(page)

  await page.goto('/login')

  await expect(
    page.getByRole('heading', { name: 'Continue to your workspace' }),
  ).toBeVisible()
  await page.getByRole('button', { name: /(connect wallet|continue as)/i }).click()

  await expect(page).toHaveURL(/\/new-analysis$/)
  await expect(
    page.getByRole('heading', { name: 'Start a new analysis' }),
  ).toBeVisible()

  await page
    .getByLabel('What decision are you trying to make?')
    .fill('Allocate idle USDT from the wallet into one eligible HashKey Chain RWA sleeve.')
  await page.getByRole('button', { name: 'Start analysis' }).click()

  await expect(page).toHaveURL(/\/sessions\/[^/]+\/clarify/)
  const markUncertainButtons = page.getByRole('button', { name: 'Mark uncertain' })
  const unansweredCount = await markUncertainButtons.count()

  for (let index = 0; index < unansweredCount; index += 1) {
    await markUncertainButtons.nth(index).click()
  }

  await page.getByRole('button', { name: 'Continue analysis' }).first().click()
  await page.waitForURL(/\/reports\/[^/]+$/, { timeout: 20_000 })

  await expect(
    page.getByRole('button', { name: 'Review execution plan' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Execute on HashKey Chain' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Review execution plan' }).click()

  await expect(page).toHaveURL(/\/sessions\/[^/]+\/execute$/)
  await expect(
    page.getByRole('heading', { name: 'HashKey Chain Execution Console' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Run simulation' }).click()
  await expect(page.getByText('Simulation and warnings')).toBeVisible()
  await expect(page.getByText('Baseline position monitoring')).toBeVisible()

  const sessionId = page.url().match(/\/sessions\/([^/]+)\/execute$/)?.[1]
  expect(sessionId).toBeTruthy()

  await page.evaluate(
    async ({ sessionId, txHash }) => {
      const response = await fetch(`/api/reports/${sessionId}/anchor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          network: 'testnet',
          transaction_hash: txHash,
          submitted_by: '0x1234567890abcdef1234567890abcdef12345678',
          block_number: 88,
        }),
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }
      return response.json()
    },
    { sessionId, txHash: TX_HASH },
  )

  await page.reload()
  await expect(page.getByText('On-chain Attestation Confirmed')).toBeVisible()
  await expect(page.getByText(/Synced to report and session/i)).toBeVisible()
  await expect(page.getByText('Baseline position monitoring')).toBeVisible()
})
