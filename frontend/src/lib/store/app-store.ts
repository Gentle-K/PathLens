import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

import type {
  ApiMode,
  DisplayDensity,
  LanguageCode,
  ResolvedTheme,
  SettingsPayload,
  ThemeMode,
  User,
} from '@/types'
import { resolveRuntimeApiMode } from '@/lib/api/runtime-mode'

const defaultApiMode = resolveRuntimeApiMode(
  import.meta.env['VITE_API_MODE'] as ApiMode | undefined,
)

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

function resolveBrowserStorage(): StateStorage {
  if (typeof window === 'undefined') {
    return noopStorage
  }

  const storage = window.localStorage as Partial<Storage> | undefined
  if (
    !storage ||
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function' ||
    typeof storage.removeItem !== 'function'
  ) {
    return noopStorage
  }

  return storage as StateStorage
}

interface AppStoreState {
  themeMode: ThemeMode
  resolvedTheme: ResolvedTheme
  locale: LanguageCode
  displayDensity: DisplayDensity
  apiMode: ApiMode
  sidebarOpen: boolean
  accessToken: string | null
  refreshToken: string | null
  currentUser: User | null
  walletAddress: string
  walletChainId: number | null
  setThemeMode: (themeMode: ThemeMode) => void
  setResolvedTheme: (resolvedTheme: ResolvedTheme) => void
  setLocale: (locale: LanguageCode) => void
  setDisplayDensity: (displayDensity: DisplayDensity) => void
  setApiMode: (apiMode: ApiMode) => void
  setSidebarOpen: (isOpen: boolean) => void
  toggleSidebar: () => void
  setAuthSession: (payload: {
    accessToken: string
    refreshToken: string
    currentUser: User
  }) => void
  clearSession: () => void
  setWalletState: (payload: {
    walletAddress: string
    walletChainId: number | null
  }) => void
  clearWalletState: () => void
  syncFromSettings: (settings: SettingsPayload) => void
}

export const useAppStore = create<AppStoreState>()(
  persist(
    (set) => ({
      themeMode: 'dark',
      resolvedTheme: 'dark',
      locale: 'zh',
      displayDensity: 'cozy',
      apiMode: defaultApiMode,
      sidebarOpen: false,
      accessToken: null,
      refreshToken: null,
      currentUser: null,
      walletAddress: '',
      walletChainId: null,
      setThemeMode: (themeMode) => set({ themeMode }),
      setResolvedTheme: (resolvedTheme) => set({ resolvedTheme }),
      setLocale: (locale) => set({ locale }),
      setDisplayDensity: (displayDensity) => set({ displayDensity }),
      setApiMode: (apiMode) =>
        set({ apiMode: resolveRuntimeApiMode(apiMode) }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () =>
        set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setAuthSession: ({ accessToken, refreshToken, currentUser }) =>
        set({ accessToken, refreshToken, currentUser }),
      clearSession: () =>
        set({
          accessToken: null,
          refreshToken: null,
          currentUser: null,
        }),
      setWalletState: ({ walletAddress, walletChainId }) =>
        set({ walletAddress, walletChainId }),
      clearWalletState: () =>
        set({
          walletAddress: '',
          walletChainId: null,
        }),
      syncFromSettings: (settings) =>
        set({
          themeMode: settings.themeMode,
          locale: settings.language,
        }),
    }),
    {
      name: 'genius-actuary-store',
      storage: createJSONStorage(resolveBrowserStorage),
      merge: (persistedState, currentState) => {
        const merged = {
          ...currentState,
          ...(persistedState as Partial<AppStoreState>),
        }

        return {
          ...merged,
          apiMode: resolveRuntimeApiMode(merged.apiMode),
        }
      },
      partialize: (state) => ({
        themeMode: state.themeMode,
        resolvedTheme: state.resolvedTheme,
        locale: state.locale,
        displayDensity: state.displayDensity,
        apiMode: state.apiMode,
        sidebarOpen: state.sidebarOpen,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        currentUser: state.currentUser,
        walletAddress: state.walletAddress,
        walletChainId: state.walletChainId,
      }),
    },
  ),
)
