import { useQuery } from '@tanstack/react-query'
import {
  BarChart3,
  BadgeCheck,
  Calculator,
  FileSearch,
  FolderKanban,
  Layers3,
  PlusSquare,
  ScrollText,
  Settings2,
  TrendingUp,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import { useAppStore } from '@/lib/store/app-store'
import { cn } from '@/lib/utils/cn'
import { formatRelativeTime } from '@/features/analysis/lib/view-models'

const navItems = [
  { to: '/new-analysis', labelKey: 'nav.newAnalysis', icon: PlusSquare },
  { to: '/assets', labelKey: 'nav.assets', icon: BadgeCheck },
  { to: '/portfolio', labelKey: 'nav.portfolio', icon: BarChart3 },
  { to: '/stocks', labelKey: 'nav.stocks', icon: TrendingUp },
  { to: '/sessions', labelKey: 'nav.sessions', icon: Layers3 },
  { to: '/reports', labelKey: 'nav.reports', icon: ScrollText },
  { to: '/evidence', labelKey: 'nav.evidence', icon: FileSearch },
  { to: '/calculations', labelKey: 'nav.calculations', icon: Calculator },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings2 },
] as const

interface SidebarProps {
  collapsed: boolean
}

export function Sidebar({ collapsed }: SidebarProps) {
  const { t } = useTranslation()
  const adapter = useApiAdapter()
  const locale = useAppStore((state) => state.locale)
  const setSidebarOpen = useAppStore((state) => state.setSidebarOpen)

  const sessionsQuery = useQuery({
    queryKey: ['sidebar', 'sessions', locale],
    queryFn: () => adapter.analysis.list({ page: 1, pageSize: 50 }),
    staleTime: 30_000,
  })

  const sessions = sessionsQuery.data?.items ?? []
  const activeSessionsCount = sessions.filter(
    (item) => item.status === 'CLARIFYING' || item.status === 'ANALYZING',
  ).length
  const reportCount = sessions.filter(
    (item) =>
      item.status === 'READY_FOR_EXECUTION' ||
      item.status === 'EXECUTING' ||
      item.status === 'MONITORING' ||
      item.status === 'COMPLETED',
  ).length
  const latestSync = sessions[0]?.updatedAt

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-[18rem] max-w-[88vw] flex-col border-r border-border-subtle bg-panel/96 px-3 py-4 shadow-panel backdrop-blur-2xl transition-transform duration-300',
        collapsed ? '-translate-x-full max-[1023px]' : 'translate-x-0',
        'min-[1024px]:translate-x-0 min-[1024px]:max-[1535px]:w-[5.75rem] min-[1536px]:w-[18rem]',
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <div className="flex items-center gap-3 px-2">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-[18px] bg-primary text-base font-semibold tracking-[-0.05em] text-white shadow-[0_12px_28px_rgba(49,95,221,0.35)]">
            GA
          </div>
          <div className="min-w-0 min-[1024px]:max-[1535px]:hidden">
            <p className="truncate text-sm font-semibold text-text-primary">
              {t('layout.sidebar.title')}
            </p>
            <p className="truncate text-xs text-text-secondary">
              {t('layout.sidebar.tagline')}
            </p>
          </div>
        </div>

        <div className="rounded-[22px] border border-border-subtle bg-app-bg-elevated px-4 py-4 min-[1024px]:max-[1535px]:hidden">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-cyan">
            {t('layout.sidebar.releaseTitle')}
          </p>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            {t('layout.sidebar.releaseDescription')}
          </p>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setSidebarOpen(false)}
                  title={t(item.labelKey)}
                >
                  {({ isActive }) => (
                    <div
                      className={cn(
                        'interactive-lift group flex items-center gap-3 rounded-[20px] px-3 py-3 text-sm font-medium transition',
                        isActive
                          ? 'bg-primary-soft text-text-primary shadow-[0_0_0_1px_rgba(79,124,255,0.18)]'
                          : 'text-text-secondary hover:bg-app-bg-elevated hover:text-text-primary',
                        'min-[1024px]:max-[1535px]:justify-center min-[1024px]:max-[1535px]:px-0',
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-10 shrink-0 items-center justify-center rounded-[16px] transition',
                          isActive
                            ? 'bg-primary text-white'
                            : 'bg-bg-surface text-text-secondary group-hover:bg-bg-surface-3 group-hover:text-text-primary',
                        )}
                      >
                        <Icon className="size-5" />
                      </span>
                      <span className="truncate min-[1024px]:max-[1535px]:hidden">
                        {t(item.labelKey)}
                      </span>
                    </div>
                  )}
                </NavLink>
              )
            })}
          </div>
        </nav>
      </div>

      <div className="shrink-0 border-t border-border-subtle px-2 pt-4">
        <div className="grid gap-3 min-[1024px]:max-[1535px]:gap-2">
          <div className="rounded-[20px] bg-app-bg-elevated px-4 py-3 min-[1024px]:max-[1535px]:px-2 min-[1024px]:max-[1535px]:text-center">
            <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted min-[1024px]:max-[1535px]:hidden">
              {t('layout.sidebar.pipelineSessions')}
            </p>
            <p className="mt-1 text-xl font-semibold text-text-primary">{activeSessionsCount}</p>
          </div>
          <div className="rounded-[20px] bg-app-bg-elevated px-4 py-3 min-[1024px]:max-[1535px]:px-2 min-[1024px]:max-[1535px]:text-center">
            <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted min-[1024px]:max-[1535px]:hidden">
              {t('layout.sidebar.closedLoops')}
            </p>
            <p className="mt-1 text-xl font-semibold text-text-primary">{reportCount}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 min-[1024px]:max-[1535px]:justify-center">
          <Badge tone="info">
            <FolderKanban className="size-3.5" />
            <span className="min-[1024px]:max-[1535px]:hidden">{t('layout.sidebar.evidenceLed')}</span>
          </Badge>
          <p className="text-xs text-text-muted min-[1024px]:max-[1535px]:hidden">
            {latestSync ? `${t('common.updated')} ${formatRelativeTime(latestSync)}` : t('layout.sidebar.updatePending')}
          </p>
        </div>
      </div>
    </aside>
  )
}
