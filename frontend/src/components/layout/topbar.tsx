import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Languages, MoreHorizontal, MoonStar, SunMedium } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { BackendBootstrapResponse } from '@/lib/api/adapters/genius-backend'
import { apiClient } from '@/lib/api/client'
import { endpoints } from '@/lib/api/endpoints'
import { resolveRuntimeApiMode } from '@/lib/api/runtime-mode'
import { useAppStore } from '@/lib/store/app-store'

function resolveBackendAnalysisAdapter(notes: string[]) {
  const adapterNote = notes.find((note) => note.startsWith('Adapters:'))
  if (!adapterNote) return ''
  const match = adapterNote.match(/analysis=([^,]+)/i)
  return match?.[1]?.trim().toLowerCase() ?? ''
}

export function Topbar() {
  const { i18n, t } = useTranslation()
  const currentUser = useAppStore((state) => state.currentUser)
  const sidebarOpen = useAppStore((state) => state.sidebarOpen)
  const toggleSidebar = useAppStore((state) => state.toggleSidebar)
  const themeMode = useAppStore((state) => state.themeMode)
  const setThemeMode = useAppStore((state) => state.setThemeMode)
  const locale = useAppStore((state) => state.locale)
  const setLocale = useAppStore((state) => state.setLocale)
  const apiMode = useAppStore((state) => state.apiMode)
  const isZh = i18n.language.startsWith('zh')
  const runtimeApiMode = resolveRuntimeApiMode(apiMode)

  const bootstrapQuery = useQuery({
    queryKey: ['backend', 'bootstrap', 'runtime-indicator'],
    queryFn: () => apiClient.request<BackendBootstrapResponse>(endpoints.backend.bootstrap),
    enabled: runtimeApiMode === 'rest',
    staleTime: 60_000,
    retry: false,
  })

  const backendAnalysisAdapter = resolveBackendAnalysisAdapter(bootstrapQuery.data?.notes ?? [])
  const shouldShowMockHint = runtimeApiMode === 'mock' || backendAnalysisAdapter.startsWith('mock')
  const mockHint = runtimeApiMode === 'mock'
    ? isZh
      ? '当前前端正在使用 Mock 适配器，页面内容不是真实后端 LLM 结果。'
      : 'The frontend is currently using the mock adapter instead of the live backend LLM.'
    : isZh
      ? '当前后端分析适配器为 Mock，页面内容不会走真实 LLM。'
      : 'The backend analysis adapter is currently mock, so this is not a live LLM run.'

  const languageOptions = [
    { value: 'zh' as const, label: '中文' },
    { value: 'en' as const, label: 'EN' },
  ]

  return (
    <header className="apple-section-dark apple-nav-glass sticky top-3 z-30 mb-6 px-4 py-4 md:px-6 md:py-5">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={toggleSidebar}
              className="hidden border-white/10 bg-white/6 text-white hover:border-white/15 hover:bg-white/10 lg:inline-flex"
            >
              <MoreHorizontal className="size-4" />
            </Button>
            <p className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-white/72">
              {isZh ? '分析工作台' : 'Workspace'}
            </p>
            <Badge tone="neutral" className="border-white/10 bg-white/6 text-white/72">
              {sidebarOpen ? (isZh ? '侧栏展开' : 'Sidebar Open') : (isZh ? '侧栏收纳' : 'Sidebar Compact')}
            </Badge>
            {shouldShowMockHint ? (
              <Badge
                tone="warning"
                className="border-[rgba(255,159,10,0.18)] bg-[rgba(255,159,10,0.14)] text-[#ffd39a]"
              >
                {isZh ? 'Mock 模式' : 'Mock mode'}
              </Badge>
            ) : null}
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl font-semibold tracking-[-0.06em] text-white md:text-[3.25rem] md:leading-[0.95]">
              {isZh ? 'RWA 配置决策引擎' : 'RWA Allocation Decision Engine'}
            </h2>
            <p className="max-w-3xl text-[15px] leading-7 text-white/72 md:text-[17px]">
              {isZh
                ? '把自然语言问题、资产范围、KYC 与链上执行约束放进同一条分析流水线。'
                : 'Compose the question, asset universe, KYC access, and execution constraints inside one continuous analysis flow.'}
            </p>
          </div>

          {shouldShowMockHint ? (
            <div className="flex max-w-3xl items-start gap-3 rounded-[22px] border border-[rgba(255,159,10,0.18)] bg-[rgba(255,159,10,0.12)] px-4 py-3 text-sm leading-6 text-[#ffe5be]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{mockHint}</span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-start gap-3 xl:justify-end">
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/6 p-1">
            <Languages className="ml-2 size-4 shrink-0 text-white/54" />
            {languageOptions.map((option) => {
              const active = locale === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setLocale(option.value)
                    void i18n.changeLanguage(option.value)
                  }}
                  className={`interactive-lift min-w-[68px] rounded-full px-3.5 py-2 text-sm font-medium transition ${
                    active
                      ? 'bg-white text-[#1d1d1f]'
                      : 'text-white/72 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>

          <Button
            variant="secondary"
            size="sm"
            className="min-h-12 min-w-[144px] justify-center whitespace-nowrap border-white/10 bg-white/6 text-white hover:border-white/15 hover:bg-white/10"
            onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : themeMode === 'light' ? 'system' : 'dark')}
          >
            {themeMode === 'dark' ? <MoonStar className="size-4" /> : <SunMedium className="size-4" />}
            <span>{themeMode === 'dark' ? t('common.dark') : themeMode === 'light' ? t('common.light') : t('common.system')}</span>
          </Button>

          {currentUser ? (
            <div className="flex min-h-12 min-w-[220px] items-center gap-3 rounded-full border border-white/10 bg-white/6 px-3 py-2.5">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold tracking-[-0.03em] text-[#1d1d1f]">
                {currentUser.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{currentUser.name}</p>
                <p className="truncate text-xs text-white/54">{currentUser.title}</p>
              </div>
            </div>
          ) : (
            <div className="rounded-full border border-white/10 bg-white/6 px-4 py-3 text-sm text-white/54">
              {isZh ? '未登录会话' : 'No active session'}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
