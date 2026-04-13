import { FileTerminal, ScrollText, ShieldCheck, ShieldEllipsis } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { clearDebugAuthHeader } from '@/lib/debug-auth'
import { cn } from '@/lib/utils/cn'

const navItems = [
  { to: '/debug/logs', label: 'Audit Logs', icon: ScrollText },
  { to: '/debug/sessions', label: 'Session Debug', icon: FileTerminal },
  { to: '/debug/rwa-ops', label: 'RWA Ops', icon: ShieldEllipsis },
  { to: '/debug/admin/roles', label: 'Role Management', icon: ShieldCheck },
]

export function DebugShell() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-app-bg p-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="panel-card flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-primary">Protected Debug</p>
            <h1 className="mt-2 text-2xl font-semibold text-text-primary">Backend logs and diagnostics</h1>
          </div>
          <div className="flex flex-wrap gap-3">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm transition',
                      isActive
                        ? 'border-border-strong bg-[rgba(212,175,55,0.12)] text-text-primary'
                        : 'border-border-subtle bg-app-bg-elevated text-text-secondary hover:border-border-strong hover:text-text-primary',
                    )
                  }
                >
                  <Icon className="size-4" />
                  {item.label}
                </NavLink>
              )
            })}
            <Button
              variant="secondary"
              onClick={() => {
                clearDebugAuthHeader()
                void navigate('/debug/login')
              }}
            >
              Sign out
            </Button>
          </div>
        </div>

        <Outlet />
      </div>
    </div>
  )
}
