import { AlertTriangle } from 'lucide-react'
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAppStore } from '@/lib/store/app-store'

export function RouteErrorBoundary() {
  const error = useRouteError()
  const navigate = useNavigate()
  const locale = useAppStore((state) => state.locale)
  const isZh = locale === 'zh'

  const description = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : isZh
        ? '页面遇到了未知错误。'
        : 'The page hit an unknown error.'

  return (
    <Card className="mx-auto max-w-3xl space-y-4 p-8">
      <div className="flex items-center gap-3">
        <AlertTriangle className="size-5 text-gold-primary" />
        <h1 className="text-xl font-semibold text-text-primary">
          {isZh ? '页面已切换到安全模式' : 'The page switched to safe mode'}
        </h1>
      </div>
      <p className="text-sm leading-7 text-text-secondary">
        {isZh
          ? '系统拦截了这次路由级异常，避免直接展示黑底堆栈。你可以返回分析页或历史记录继续工作。'
          : 'The app intercepted a route-level error so you do not land on the default black stack page. You can safely go back to analysis or history.'}
      </p>
      <p className="rounded-xl border border-border-subtle bg-app-bg-elevated p-4 text-sm text-text-secondary">
        {description}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void navigate('/analysis/modes')}>
          {isZh ? '返回分析页' : 'Back to Analysis'}
        </Button>
        <Button onClick={() => void navigate('/resources/analyses')}>
          {isZh ? '查看历史记录' : 'Go to History'}
        </Button>
      </div>
    </Card>
  )
}
