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
    <header className="panel-card mb-4 p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" size="sm" onClick={toggleSidebar} className="hidden lg:inline-flex">
              <MoreHorizontal className="size-4" />
            </Button>
            <p className="text-gold-primary text-xs font-medium tracking-[0.22em] uppercase">
              {isZh ? '分析工作台' : 'Workspace'}
            </p>
            <Badge tone="neutral" className="rounded-full px-3 py-1 text-[11px]">
              {sidebarOpen ? (isZh ? '侧栏展开' : 'Sidebar Open') : (isZh ? '侧栏收纳' : 'Sidebar Compact')}
            </Badge>
          </div>
          <h2 className="text-text-primary text-xl font-semibold">
            {isZh ? 'RWA 配置决策引擎' : 'RWA Allocation Decision Engine'}
          </h2>
          <p className="text-text-secondary max-w-[52rem] text-sm leading-6">
            {isZh
              ? '发起新分析、继续追问，并查看历史报告。主内容区默认优先占屏。'
              : 'Start new analyses, continue follow-ups, and revisit historical reports with a content-first layout.'}
          </p>
          {shouldShowMockHint ? (
            <div className="border-border-strong mt-1 flex max-w-[52rem] items-start gap-3 rounded-[18px] border bg-[rgba(212,175,55,0.08)] px-4 py-3 text-sm leading-6 text-text-secondary">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-gold-primary" />
              <span>{mockHint}</span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="border-border-subtle bg-app-bg-elevated text-text-secondary flex min-h-12 items-center gap-2 rounded-full border px-2 py-2 text-sm">
            <Languages className="ml-1 size-4 shrink-0" />
            <div className="flex items-center gap-1">
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
                    className={`interactive-lift min-w-[72px] rounded-full px-4 py-2 text-sm font-medium transition ${active ? 'text-text-primary bg-[rgba(212,175,55,0.16)]' : 'text-text-secondary hover:text-text-primary hover:bg-white/5'}`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          <Button
            variant="secondary"
            size="sm"
            className="min-h-12 min-w-[144px] justify-center whitespace-nowrap"
            onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : themeMode === 'light' ? 'system' : 'dark')}
          >
            {themeMode === 'dark' ? <MoonStar className="size-4" /> : <SunMedium className="size-4" />}
            <span>{themeMode === 'dark' ? t('common.dark') : themeMode === 'light' ? t('common.light') : t('common.system')}</span>
          </Button>

          {currentUser ? (
            <div className="border-border-subtle bg-app-bg-elevated flex min-h-12 min-w-[220px] items-center gap-3 rounded-full border px-4 py-3">
              <div className="size-10 shrink-0 rounded-full bg-cover bg-center bg-no-repeat" style={{ backgroundColor: 'var(--gold-primary)', backgroundImage: 'var(--gradient-gold)' }} />
              <div className="min-w-0 flex-1">
                <p className="text-text-primary truncate text-sm font-medium">{currentUser.name}</p>
                <p className="text-text-muted truncate text-xs">{currentUser.title}</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
