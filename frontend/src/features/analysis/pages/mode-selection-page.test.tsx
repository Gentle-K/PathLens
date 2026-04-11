import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { ModeSelectionPage } from '@/features/analysis/pages/mode-selection-page'
import { renderWithAppState, renderWithProviders } from '@/tests/test-utils'

describe('ModeSelectionPage', () => {
  afterEach(() => {
    cleanup()
  })

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

  it('applies an official demo scenario to the intake form', async () => {
    const user = userEvent.setup()

    renderWithAppState(<ModeSelectionPage />, {
      route: '/analysis/modes',
      locale: 'en',
    })

    expect(
      await screen.findAllByRole('heading', { name: 'Official demo scenarios' }),
    ).not.toHaveLength(0)

    await user.click(
      await screen.findByRole('button', {
        name: /Liquidity First: MMF vs Real Estate/i,
      }),
    )

    expect(screen.getByLabelText('Your question')).toHaveValue(
      'Show why liquidity-first users should compare MMF-like carry against real-estate-style lockups.',
    )
    expect(
      screen.getByText('Demo: liquidity-first-mmf-vs-real-estate'),
    ).toBeInTheDocument()
    expect(screen.getByText('2 assets selected')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Including non-production assets/i }),
    ).toBeInTheDocument()
  })
})
