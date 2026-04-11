import type { Page } from '@playwright/test'


export async function primeMockAppState(page: Page) {
  await page.addInitScript(() => {
    const now = new Date().toISOString()
    window.localStorage.setItem(
      'genius-actuary-store',
      JSON.stringify({
        state: {
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
        },
        version: 0,
      }),
    )
  })
}
