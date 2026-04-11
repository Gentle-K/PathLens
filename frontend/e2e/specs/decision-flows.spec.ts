import { expect, test } from '@playwright/test'

import { decisionScenarios } from '../fixtures/decision-scenarios'
import { primeMockAppState } from '../utils/mock-app'


for (const scenario of decisionScenarios) {
  test(`decision flow: ${scenario.name}`, async ({ page }) => {
    await primeMockAppState(page)
    await page.goto('/analysis/modes')

    await expect(page.getByTestId('mode-selection-page')).toBeVisible()
    await page.getByTestId(`mode-card-${scenario.mode}`).click()
    await page.getByTestId('analysis-problem-input').fill(scenario.problem)
    await page.getByTestId('start-rwa-analysis').click()

    await expect(page.getByTestId('analysis-session-page')).toBeVisible()
    await page.locator('textarea').first().fill(scenario.answer)
    await page.getByTestId('analysis-session-submit').click()

    await expect(page.getByText(/Current AI Status|AI 当前状态/)).toBeVisible()
    await page.waitForURL(/\/analysis\/session\/[^/]+\/result/, { timeout: 20_000 })

    await expect(page.getByTestId('report-page')).toBeVisible()
    await expect(page.locator('[data-testid^="chart-card-"]').first()).toBeVisible()
    await expect(page.getByText(/Full Analysis|完整分析/)).toBeVisible()
  })
}
