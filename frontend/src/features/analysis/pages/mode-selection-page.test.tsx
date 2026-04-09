import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ModeSelectionPage } from '@/features/analysis/pages/mode-selection-page'
import { renderWithAppState, renderWithProviders } from '@/tests/test-utils'

describe('ModeSelectionPage', () => {
  it('renders both rebuilt analysis modes from the adapter', async () => {
    renderWithProviders(<ModeSelectionPage />, '/analysis/modes')

    expect(
      await screen.findByRole('heading', { name: '单资产尽调' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: '多资产配置' }),
    ).toBeInTheDocument()
  })

  it('renders the intake mode titles in English when locale is en', async () => {
    renderWithAppState(<ModeSelectionPage />, {
      route: '/analysis/modes',
      locale: 'en',
    })

    expect(
      await screen.findAllByRole('heading', { name: 'Single-asset diligence' }),
    ).not.toHaveLength(0)
    expect(
      await screen.findAllByRole('heading', { name: 'Multi-asset allocation' }),
    ).not.toHaveLength(0)
  })
})
