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
        'panel-card hidden h-[calc(100vh-2rem)] flex-col overflow-hidden p-3 lg:flex',
        collapsed ? 'w-[84px]' : 'w-[196px]',
      )}
    >
      <div className="space-y-6">
        <div className="gold-hairline px-3 pb-4">
          <p className="text-gold-primary text-xs font-semibold tracking-[0.22em] uppercase">
            Genius Actuary RWA
          </p>
        </div>

        <nav className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'text-text-secondary flex items-center gap-3 rounded-2xl border border-transparent px-3 py-3 text-sm transition',
                    isActive
                      ? 'border-border-strong text-text-primary bg-[rgba(212,175,55,0.12)]'
                      : 'hover:border-border-subtle hover:bg-app-bg-elevated hover:text-text-primary',
                  )
                }
              >
                <Icon className="size-5 shrink-0" />
                {!collapsed ? <span className="truncate">{getNavLabel(item.key)}</span> : null}
              </NavLink>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}
