import { useQuery } from '@tanstack/react-query'
import {
  FileSearch,
  FileText,
  Home,
  Menu,
  PlusSquare,
  Settings,
  Sigma,
  X,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import { useAppStore } from '@/lib/store/app-store'
import { cn } from '@/lib/utils/cn'
import { formatRelativeTime } from '@/features/analysis/lib/view-models'

const navItems = [
  { to: '/new-analysis', label: 'New Analysis', icon: PlusSquare },
  { to: '/sessions', label: 'Sessions', icon: Home },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/evidence', label: 'Evidence', icon: FileSearch },
  { to: '/calculations', label: 'Calculations', icon: Sigma },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const

interface SidebarProps {
  collapsed: boolean
}

export function Sidebar({ collapsed }: SidebarProps) {
  const adapter = useApiAdapter()
  const setSidebarOpen = useAppStore((state) => state.setSidebarOpen)
  const handleNavClick = () => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false)
    }
  }

  const sessionsQuery = useQuery({
    queryKey: ['sidebar', 'sessions'],
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
        'panel-card fixed inset-y-3 left-3 z-50 flex flex-col justify-between overflow-hidden border lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:translate-x-0',
        collapsed ? 'w-[94px] lg:w-[94px]' : 'w-[252px]',
        collapsed ? '-translate-x-[120%] lg:flex lg:-translate-x-0' : 'translate-x-0',
      )}
    >
      <div className="space-y-7 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-[18px] bg-primary text-lg font-semibold tracking-[-0.05em] text-white shadow-[0_12px_30px_rgba(44,87,190,0.32)]">
              GA
            </div>
            {!collapsed ? (
              <div className="min-w-0">
                <p className="text-sm font-semibold tracking-[-0.03em] text-text-primary">Genius Actuary</p>
                <p className="text-xs leading-5 text-text-secondary">Decision intelligence workspace</p>
              </div>
            ) : null}
          </div>
          {!collapsed ? (
            <button
              type="button"
              className="interactive-lift inline-flex size-9 items-center justify-center rounded-full border border-border-subtle bg-app-bg-elevated text-text-secondary lg:hidden"
              aria-label="Close navigation"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        {!collapsed ? (
          <div className="rounded-[22px] border border-border-subtle bg-[linear-gradient(180deg,rgba(19,34,58,0.94),rgba(15,27,49,0.9))] px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-cyan">Release Workspace</p>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Break decisions into explicit cost, risk, evidence, calculations, and bounded recommendations.
            </p>
          </div>
        ) : null}

        <nav className="space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink key={item.to} to={item.to} onClick={handleNavClick}>
                {({ isActive }) => (
                  <div
                    className={cn(
                      'interactive-lift group flex items-center gap-3 rounded-[20px] px-3 py-3 text-sm font-medium transition',
                      isActive
                        ? 'bg-primary-soft text-text-primary shadow-[0_0_0_1px_rgba(79,124,255,0.18)]'
                        : 'text-text-secondary hover:bg-app-bg-elevated hover:text-text-primary',
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
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  </div>
                )}
              </NavLink>
            )
          })}
        </nav>
      </div>

      <div className="border-t border-border-subtle p-4">
        {!collapsed ? (
          <div className="space-y-4">
            <div className="grid gap-3">
              <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  Active sessions
                </p>
                <p className="mt-1 text-xl font-semibold text-text-primary">
                  {activeSessionsCount}
                </p>
              </div>
              <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  Reports generated
                </p>
                <p className="mt-1 text-xl font-semibold text-text-primary">
                  {reportCount}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone="info">Evidence-led</Badge>
              <p className="text-xs text-text-muted">Updated {latestSync ? formatRelativeTime(latestSync) : 'pending'}</p>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <button
              type="button"
              className="interactive-lift inline-flex size-10 items-center justify-center rounded-full border border-border-subtle bg-app-bg-elevated text-text-secondary"
              aria-label="Expand navigation"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="size-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
