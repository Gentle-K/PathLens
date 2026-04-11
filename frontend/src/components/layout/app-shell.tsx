import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Outlet, useLocation } from 'react-router-dom'

import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { useAppStore } from '@/lib/store/app-store'

export function AppShell() {
  const location = useLocation()
  const reducedMotion = useReducedMotion()
  const sidebarOpen = useAppStore((state) => state.sidebarOpen)

  return (
    <div className="bg-app-bg text-text-primary min-h-screen p-3 md:p-4">
      <div className="flex w-full gap-4">
        <Sidebar collapsed={!sidebarOpen} />
        <div className="flex min-h-[calc(100vh-2rem)] min-w-0 flex-1 flex-col">
          <Topbar />
          <div className="relative min-w-0 flex-1 overflow-x-clip">
            <AnimatePresence initial={false} mode="sync">
              <motion.main
                key={location.pathname}
                initial={reducedMotion ? undefined : { opacity: 0, y: 18 }}
                animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                className="relative min-w-0 flex-1"
                style={
                  reducedMotion
                    ? undefined
                    : { opacity: 0, willChange: 'transform, opacity' }
                }
              >
                <Outlet />
              </motion.main>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
