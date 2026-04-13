import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { ModeSelectionPage } from '@/features/analysis/pages/mode-selection-page'
import { renderWithAppState } from '@/tests/test-utils'

describe('ModeSelectionPage', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders both rebuilt analysis modes', async () => {
    renderWithAppState(<ModeSelectionPage />, {
      route: '/new-analysis',
      locale: 'en',
    })

    expect(
      await screen.findByRole('heading', { name: 'Single-asset allocation' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'Strategy compare' }),
    ).toBeInTheDocument()
  })

  it('fills the problem textarea when an example chip is clicked', async () => {
    const user = userEvent.setup()

    renderWithAppState(<ModeSelectionPage />, {
      route: '/new-analysis',
      locale: 'en',
    })

    await user.click(
      await screen.findByRole('button', {
        name: 'Allocate idle USDT from my wallet into one eligible HashKey Chain RWA sleeve.',
      }),
    )

    expect(
      screen.getByLabelText('What decision are you trying to make?'),
    ).toHaveValue(
      'Allocate idle USDT from my wallet into one eligible HashKey Chain RWA sleeve.',
    )
  })

  it('keeps the start button disabled until the user enters a question', async () => {
    renderWithAppState(<ModeSelectionPage />, {
      route: '/new-analysis',
      locale: 'en',
    })

    expect(
      await screen.findByRole('button', { name: /start analysis/i }),
    ).toBeDisabled()
  })

  it('starts a new analysis and navigates into the clarify route', async () => {
    const user = userEvent.setup()

    renderWithAppState(
      <Routes>
        <Route path="/new-analysis" element={<ModeSelectionPage />} />
        <Route path="/sessions/:sessionId/clarify" element={<div>clarify workspace</div>} />
      </Routes>,
      {
        route: '/new-analysis',
        locale: 'en',
      },
    )

    await user.type(
      await screen.findByLabelText('What decision are you trying to make?'),
      'Should I work abroad next year?',
    )
    await user.click(screen.getByRole('button', { name: /start analysis/i }))

    expect(await screen.findByText('clarify workspace')).toBeInTheDocument()
  })
})
