import { ClipboardPenLine, Settings, UserRound, Workflow } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils/cn'

const navItems = [
  { to: '/analysis/modes', key: 'analyze', icon: ClipboardPenLine },
  { to: '/resources/analyses', key: 'resources', icon: Workflow },
  { to: '/settings', key: 'settings', icon: Settings },
  { to: '/profile', key: 'profile', icon: UserRound },
] as const

interface SidebarProps {
  collapsed: boolean
}

export function Sidebar({ collapsed }: SidebarProps) {
  const { i18n, t } = useTranslation()
  const isZh = i18n.language.startsWith('zh')

  const getNavLabel = (key: (typeof navItems)[number]['key']) => {
    if (key === 'resources') {
      return isZh ? '历史记录' : 'History'
    }
    return t(`nav.${key}`)
  }

  return (
    <aside
      className={cn(
        'apple-section-dark sticky top-4 hidden h-[calc(100vh-2rem)] flex-col justify-between border border-white/10 px-3 py-4 shadow-[0_24px_60px_rgba(0,0,0,0.32)] lg:flex',
        collapsed ? 'w-[96px]' : 'w-[228px]',
      )}
    >
      <div className="space-y-8">
        <div className="space-y-4 px-3">
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-[18px] bg-white text-lg font-semibold tracking-[-0.05em] text-[#1d1d1f]">
              G
            </div>
            {!collapsed ? (
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/48">
                  Genius Actuary
                </p>
                <p className="truncate text-sm font-medium text-white">RWA Decision Engine</p>
              </div>
            ) : null}
          </div>

          {!collapsed ? (
            <p className="text-sm leading-7 text-text-secondary">
              {isZh
                ? '把模式选择、证据核验、执行草案和链上存证放进一条工作流。'
                : 'Keep mode selection, evidence checks, execution planning, and attestation in one flow.'}
            </p>
          ) : null}
        </div>

        <nav className="space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink key={item.to} to={item.to}>
                {({ isActive }) => (
                  <div
                    className={cn(
                      'group flex items-center gap-3 rounded-[20px] px-3 py-3.5 text-sm transition',
                      isActive
                        ? 'bg-[rgba(0,113,227,0.18)] text-white shadow-[inset_0_0_0_1px_rgba(41,151,255,0.24)]'
                        : 'text-white/68 hover:bg-white/8 hover:text-white',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-10 shrink-0 items-center justify-center rounded-[16px] transition',
                        isActive
                          ? 'bg-white text-[#1d1d1f]'
                          : 'bg-white/6 text-white/68 group-hover:bg-white/10 group-hover:text-white',
                      )}
                    >
                      <Icon className="size-5" />
                    </span>
                    {!collapsed ? <span className="truncate">{getNavLabel(item.key)}</span> : null}
                  </div>
                )}
              </NavLink>
            )
          })}
        </nav>
      </div>

      {!collapsed ? (
        <div className="rounded-[24px] border border-white/10 bg-white/6 px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/48">
            Decision stack
          </p>
          <p className="mt-2 text-sm leading-6 text-white/72">
            {isZh
              ? '从问题输入到结果存证，保持分析上下文连续。'
              : 'Keep the analysis context continuous from intake to attestation.'}
          </p>
        </div>
      ) : (
        <div className="px-2 text-center text-[11px] font-medium uppercase tracking-[0.18em] text-white/40">
          RWA
        </div>
      )}
    </aside>
  )
}
