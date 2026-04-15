import { expect, test, type Page } from '@playwright/test'

test.setTimeout(90_000)

async function expectPrimaryHeading(page: Page) {
  await expect(page.locator('h1').first()).toBeVisible()
}

test('all visible routes render in demo mode and canonical redirects stay intact', async ({
  page,
}) => {
  await page.goto('/login')
  await expect(
    page.getByRole('heading', { name: 'Continue to your workspace' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Open demo workspace' }).click()

  await expect(page).toHaveURL(/\/new-analysis$/)
  await expectPrimaryHeading(page)

  await page.getByLabel('Decision brief').fill(
    'Build a balanced 30 day HashKey Chain RWA demo allocation with a clear execution path.',
  )
  await page.getByRole('button', { name: 'Create session' }).click()
  await expect(page).toHaveURL(/\/sessions\/[^/]+\/clarify$/)
  const createdSessionId = page.url().match(/\/sessions\/([^/]+)\/clarify$/)?.[1] ?? ''
  expect(createdSessionId).toBeTruthy()

  await expect(page.getByText('Round progress')).toBeVisible()

  await page.goto(`/sessions/${createdSessionId}`)
  await expectPrimaryHeading(page)

  await page.goto(`/sessions/${createdSessionId}/clarify`)
  await expect(page.getByText('Round progress')).toBeVisible()

  const markUncertainButtons = page.getByRole('button', { name: 'Mark uncertain' })
  const unansweredCount = await markUncertainButtons.count()
  for (let index = 0; index < unansweredCount; index += 1) {
    await markUncertainButtons.nth(index).click()
  }
  await page.getByRole('button', { name: 'Continue analysis' }).first().click()

  await expect(page).toHaveURL(new RegExp(`/sessions/${createdSessionId}/analyzing$`))
  await expectPrimaryHeading(page)
  await expect(page).toHaveURL(new RegExp(`/reports/${createdSessionId}$`), {
    timeout: 20_000,
  })

  await page.goto('/assets')
  await expectPrimaryHeading(page)

  await page.goto('/assets/hsk-usdc/proof')
  await expectPrimaryHeading(page)

  await page.goto('/sessions')
  await expectPrimaryHeading(page)

  const reportId = createdSessionId
  await page.goto('/reports')
  await expectPrimaryHeading(page)
  await expect(page.getByRole('button', { name: 'View full report' })).toBeVisible()

  await page.goto(`/reports/${reportId}`)
  await expectPrimaryHeading(page)

  await page.goto(`/sessions/${reportId}/execute`)
  await expect(page.getByRole('button', { name: 'Generate submit receipt' })).toBeVisible()

  await page.goto('/portfolio')
  await expect(page.getByRole('button', { name: 'Connect wallet' })).toBeVisible()

  await page.goto('/portfolio/0x1234567890abcdef1234567890abcdef12345678')
  await expectPrimaryHeading(page)

  await page.goto('/evidence')
  await expectPrimaryHeading(page)

  await page.goto('/calculations')
  await expectPrimaryHeading(page)

  await page.goto('/settings')
  await expectPrimaryHeading(page)

  await page.goto('/debug/login')
  await expectPrimaryHeading(page)

  await page.goto('/debug/logs')
  await expectPrimaryHeading(page)

  await page.goto('/debug/sessions')
  await expectPrimaryHeading(page)

  await page.goto('/debug/admin/roles')
  await expectPrimaryHeading(page)

  await page.goto('/debug/rwa-ops')
  await expectPrimaryHeading(page)

  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/new-analysis$/)

  await page.goto('/notifications')
  await expect(page).toHaveURL(/\/sessions$/)

  await page.goto('/files')
  await expect(page).toHaveURL(/\/evidence$/)

  await page.goto('/dataviz')
  await expect(page).toHaveURL(/\/reports$/)

  await page.goto(`/analysis/session/${createdSessionId}`)
  await expect(page).toHaveURL(new RegExp(`/sessions/${createdSessionId}$`))

  await page.goto(`/analysis/session/${createdSessionId}/clarify`)
  await expect(page).toHaveURL(new RegExp(`/sessions/${createdSessionId}/clarify$`))

  await page.goto(`/analysis/session/${createdSessionId}/progress`)
  await expect(page).toHaveURL(new RegExp(`/sessions/${createdSessionId}/analyzing$`))

  await page.goto(`/analysis/session/${reportId}/report`)
  await expect(page).toHaveURL(new RegExp(`/reports/${reportId}$`))

  await page.goto(`/analysis/session/${reportId}/execute`)
  await expect(page).toHaveURL(new RegExp(`/sessions/${reportId}/execute$`))
})
