import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LoginPage } from '@/features/auth/login-page'
import { renderWithAppState } from '@/tests/test-utils'

const login = vi.fn()
const getBootstrap = vi.fn()

vi.mock('@/lib/api/use-api-adapter', () => ({
  useApiAdapter: () => ({
    auth: {
      login,
    },
    rwa: {
      getBootstrap,
    },
  }),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    login.mockReset()
    getBootstrap.mockReset()
    login.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: {
        id: 'user-1',
        name: 'Ada Shen',
        email: 'ada@example.com',
        title: 'Lead decision analyst',
        locale: 'en',
        roles: ['analyst'],
        lastActiveAt: '2026-04-12T00:00:00Z',
      },
    })
    getBootstrap.mockResolvedValue({ chainConfig: undefined })
  })

  afterEach(() => {
    cleanup()
  })

  it('shows wallet and Safe as primary entry, with email as secondary', async () => {
    renderWithAppState(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>,
      { route: '/login', locale: 'en', apiMode: 'rest' },
    )

    expect(await screen.findByRole('heading', { name: /continue to your workspace/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /connect wallet/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Safe address')).toBeInTheDocument()
    expect(screen.getByLabelText('Secondary entry: work email')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue with email' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try demo workspace' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /google/i })).not.toBeInTheDocument()
  })

  it('submits the email-first access flow and navigates into the workspace', async () => {
    const user = userEvent.setup()

    renderWithAppState(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/new-analysis" element={<div>new analysis target</div>} />
      </Routes>,
      { route: '/login', locale: 'en', apiMode: 'rest' },
    )

    await user.type(await screen.findByLabelText('Secondary entry: work email'), 'ada@example.com')
    await user.click(screen.getByRole('button', { name: 'Continue with email' }))

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'ada@example.com',
          password: 'email-access',
          mfaCode: '',
        }),
        expect.any(Object),
      )
    })
    expect(await screen.findByText('new analysis target')).toBeInTheDocument()
  })

  it('opens the curated demo flow without exposing a password field', async () => {
    const user = userEvent.setup()

    renderWithAppState(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/new-analysis" element={<div>demo workspace target</div>} />
      </Routes>,
      { route: '/login', locale: 'en', apiMode: 'rest' },
    )

    await user.click(await screen.findByRole('button', { name: 'Try demo workspace' }))

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'demo@geniusactuary.ai',
          password: 'demo-access',
          mfaCode: '',
        }),
        expect.any(Object),
      )
    })
    expect(await screen.findByText('demo workspace target')).toBeInTheDocument()
  })
})
