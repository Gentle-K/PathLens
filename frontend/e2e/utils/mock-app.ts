import type { Page } from '@playwright/test'


export async function primeMockAppState(
  page: Page,
  stateOverrides: Record<string, unknown> = {},
) {
  await page.addInitScript(({ stateOverrides }) => {
    if (window.localStorage.getItem('genius-actuary-store')) {
      return
    }

    const now = new Date().toISOString()
    const defaultState = {
      themeMode: 'dark',
      resolvedTheme: 'dark',
      locale: 'en',
      displayDensity: 'cozy',
      apiMode: 'mock',
      sidebarOpen: true,
      accessToken: 'mock_cookie_session',
      refreshToken: 'mock_cookie_session',
      currentUser: {
        id: 'browser-e2e',
        name: 'E2E User',
        email: 'e2e@browser.local',
        title: 'Browser-linked account',
        locale: 'en',
        roles: ['analyst'],
        lastActiveAt: now,
      },
      walletAddress: '',
      walletChainId: null,
    }

    window.localStorage.setItem(
      'genius-actuary-store',
      JSON.stringify({
        state: {
          ...defaultState,
          ...stateOverrides,
        },
        version: 0,
      }),
    )
  }, { stateOverrides })
}

export async function primeRestAppState(
  page: Page,
  stateOverrides: Record<string, unknown> = {},
) {
  await primeMockAppState(page, {
    apiMode: 'rest',
    accessToken: null,
    refreshToken: null,
    currentUser: null,
    walletAddress: '',
    walletChainId: null,
    ...stateOverrides,
  })
}

export async function installMockWalletProvider(
  page: Page,
  options: {
    address?: string
    chainIdHex?: string
  } = {},
) {
  await page.addInitScript(({ address, chainIdHex }) => {
    const listeners = new Map<string, Set<(value: unknown) => void>>()
    const provider = {
      _accounts: [address],
      _chainId: chainIdHex,
      async request({
        method,
        params,
      }: {
        method: string
        params?: Array<Record<string, unknown>>
      }) {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
          return provider._accounts
        }
        if (method === 'eth_chainId') {
          return provider._chainId
        }
        if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') {
          provider._chainId = (params?.[0]?.chainId as string | undefined) ?? provider._chainId
          listeners.get('chainChanged')?.forEach((listener) => listener(provider._chainId))
          return null
        }
        return null
      },
      on(event: string, listener: (value: unknown) => void) {
        if (!listeners.has(event)) {
          listeners.set(event, new Set())
        }
        listeners.get(event)?.add(listener)
      },
      removeListener(event: string, listener: (value: unknown) => void) {
        listeners.get(event)?.delete(listener)
      },
    }

    Object.defineProperty(window, 'ethereum', {
      configurable: true,
      value: provider,
    })
  }, {
    address: options.address ?? '0x1234567890abcdef1234567890abcdef12345678',
    chainIdHex: options.chainIdHex ?? '0x85',
  })
}
