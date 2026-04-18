import { expect, test } from '@playwright/test'

import { clearSceneCaption, holdScene, slowScroll } from '../utils/demo-video'

test.use({
  video: 'on',
  viewport: {
    width: 1600,
    height: 900,
  },
})

test.setTimeout(180_000)

test('competition demo walkthrough records a judge-ready product clip', async ({ page }) => {
  const portfolioAddress = '0x1234567890abcdef1234567890abcdef12345678'

  await page.goto('/login')
  await expect(
    page.getByRole('heading', { name: 'Continue to your workspace' }),
  ).toBeVisible()

  await holdScene(
    page,
    {
      title: 'Genius Actuary',
      body: 'A verifiable HashKey RWA decision, execution, and monitoring workspace built for competition demos.',
    },
    3_000,
  )

  await page.getByRole('button', { name: 'Open demo workspace' }).click()
  await expect(page).toHaveURL(/\/new-analysis$/)
  await expect(page.getByRole('heading', { name: 'Start a new analysis' })).toBeVisible()

  await holdScene(
    page,
    {
      title: '1. Start with a capital brief',
      body: 'The operator turns a funding goal into a structured RWA session with one guided entry point.',
    },
    2_500,
  )

  await page.getByLabel('Decision brief').fill(
    'Build a balanced 30 day HashKey Chain RWA allocation for 10000 USDT with a clear execution path and evidence traceability.',
  )
  await page.waitForTimeout(900)
  await page.getByRole('button', { name: 'Create session' }).click()

  await expect(page).toHaveURL(/\/sessions\/[^/]+\/clarify$/)
  await expect(page.getByText('Round progress')).toBeVisible()
  const sessionId = page.url().match(/\/sessions\/([^/]+)\/clarify$/)?.[1] ?? ''
  expect(sessionId).toBeTruthy()

  await holdScene(
    page,
    {
      title: '2. Tighten the decision context',
      body: 'Clarification rounds capture liquidity needs, risk posture, and missing assumptions before analysis starts.',
    },
    2_500,
  )

  const markUncertainButtons = page.getByRole('button', { name: 'Mark uncertain' })
  const unansweredCount = await markUncertainButtons.count()
  for (let index = 0; index < unansweredCount; index += 1) {
    await markUncertainButtons.nth(index).click()
    await page.waitForTimeout(250)
  }

  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Continue analysis' }).first().click()

  await expect(page).toHaveURL(new RegExp(`/sessions/${sessionId}/analyzing$`))
  await expect(page.getByRole('heading', { name: 'Analysis in progress' })).toBeVisible()

  await holdScene(
    page,
    {
      title: '3. Assemble the report',
      body: 'The engine produces ranked recommendations, simulations, evidence, and execution-ready next steps.',
    },
    2_800,
  )

  await expect(page).toHaveURL(new RegExp(`/reports/${sessionId}$`), {
    timeout: 20_000,
  })
  await expect(page.getByRole('button', { name: 'Review execution plan' })).toBeVisible()

  await holdScene(
    page,
    {
      title: '4. Show evidence-linked recommendations',
      body: 'The report keeps rankings, rationale, and supporting signals visible in one operator-facing workspace.',
    },
    2_500,
  )
  await slowScroll(page, { distance: 1_700, steps: 5, pauseMs: 650 })

  await page.goto('/assets/hsk-usdc/proof')
  await expect(page.getByRole('heading').first()).toBeVisible()

  await holdScene(
    page,
    {
      title: '5. Open the proof layer',
      body: 'Each asset exposes proof freshness, timeline history, and anchor status for fast verification.',
    },
    2_500,
  )
  await slowScroll(page, { distance: 1_250, steps: 4, pauseMs: 600 })

  await page.goto(`/sessions/${sessionId}/execute`)
  await expect(page.getByRole('button', { name: 'Generate submit receipt' })).toBeVisible()

  await holdScene(
    page,
    {
      title: '6. Move from analysis into execution',
      body: 'The execution console prepares the route, the receipt, and the attestation handoff without leaving the product shell.',
    },
    2_500,
  )

  await page.getByRole('button', { name: 'Generate submit receipt' }).click()
  await expect(page.getByRole('heading', { name: /receipt$/i })).toBeVisible()

  await holdScene(
    page,
    {
      title: '7. Review a receipt before submission',
      body: 'Teams can inspect the receipt state first, then decide when to record live chain metadata.',
    },
    2_800,
  )
  await page.keyboard.press('Escape')

  await page.goto(`/portfolio/${portfolioAddress}`)
  await expect(page.getByText(portfolioAddress)).toBeVisible()

  await holdScene(
    page,
    {
      title: '8. Monitor the portfolio after execution',
      body: 'The monitoring view keeps positions, proof freshness, and alerting visible after the trade path is prepared.',
    },
    2_500,
  )
  await slowScroll(page, { distance: 1_050, steps: 4, pauseMs: 600 })

  await page.goto('/debug/rwa-ops')
  await expect(page.getByRole('heading').first()).toBeVisible()

  await holdScene(
    page,
    {
      title: '9. Keep operators in a dedicated control plane',
      body: 'Debug and ops surfaces separate proof refresh, indexing, and admin review from the main user journey.',
    },
    2_800,
  )

  await page.goto(`/reports/${sessionId}`)
  await expect(page.getByRole('button', { name: 'Execute on HashKey Chain' })).toBeVisible()

  await holdScene(
    page,
    {
      title: 'Competition-ready demo path',
      body: 'Mock mode keeps the judging path stable, and the repository also includes a REST-backed execution proof clip for live validation.',
    },
    3_500,
  )

  await clearSceneCaption(page)
  await page.waitForTimeout(750)
})
