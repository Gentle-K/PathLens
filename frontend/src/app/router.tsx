/* eslint-disable react-refresh/only-export-components */
import { Suspense, lazy, type ReactNode } from 'react'
import { createBrowserRouter, Navigate, useParams } from 'react-router-dom'

import { Skeleton } from '@/components/feedback/skeleton'
import { RouteErrorBoundary } from '@/app/route-error-boundary'
import { AppShell } from '@/components/layout/app-shell'
import { DebugShell } from '@/components/layout/debug-shell'
import { RequireAuth } from '@/features/auth/require-auth'
import { RequireDebugAuth } from '@/features/logs/require-debug-auth'

const LoginPage = lazy(() =>
  import('@/features/auth/login-page').then((module) => ({
    default: module.LoginPage,
  })),
)
const ModeSelectionPage = lazy(() =>
  import('@/features/analysis/pages/mode-selection-page').then((module) => ({
    default: module.ModeSelectionPage,
  })),
)
const AnalysisSessionPage = lazy(() =>
  import('@/features/analysis/pages/analysis-session-page').then((module) => ({
    default: module.AnalysisSessionPage,
  })),
)
const ReportPage = lazy(() =>
  import('@/features/analysis/pages/report-page').then((module) => ({
    default: module.ReportPage,
  })),
)
const ExecutionPage = lazy(() =>
  import('@/features/analysis/pages/execution-page').then((module) => ({
    default: module.ExecutionPage,
  })),
)
const SettingsPage = lazy(() =>
  import('@/features/settings/settings-page').then((module) => ({
    default: module.SettingsPage,
  })),
)
const ProfilePage = lazy(() =>
  import('@/features/user-profile/profile-page').then((module) => ({
    default: module.ProfilePage,
  })),
)
const RolesPage = lazy(() =>
  import('@/features/admin/roles-page').then((module) => ({
    default: module.RolesPage,
  })),
)
const AuditLogPage = lazy(() =>
  import('@/features/logs/audit-log-page').then((module) => ({
    default: module.AuditLogPage,
  })),
)
const DebugLoginPage = lazy(() =>
  import('@/features/logs/debug-login-page').then((module) => ({
    default: module.DebugLoginPage,
  })),
)
const SessionDebugPage = lazy(() =>
  import('@/features/logs/session-debug-page').then((module) => ({
    default: module.SessionDebugPage,
  })),
)
const ResourceListPage = lazy(() =>
  import('@/features/resources/resource-list-page').then((module) => ({
    default: module.ResourceListPage,
  })),
)
const ResourceFormPage = lazy(() =>
  import('@/features/resources/resource-form-page').then((module) => ({
    default: module.ResourceFormPage,
  })),
)
const ResourceDetailPage = lazy(() =>
  import('@/features/resources/resource-detail-page').then((module) => ({
    default: module.ResourceDetailPage,
  })),
)

function RouteFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20 w-full" />
      <div className="grid gap-4 xl:grid-cols-3">
        <Skeleton className="h-52 w-full" />
        <Skeleton className="h-52 w-full" />
        <Skeleton className="h-52 w-full" />
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  )
}

function withRouteSuspense(element: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>
}

function LegacyAnalysisSessionRedirect({
  target,
}: {
  target: 'session' | 'result'
}) {
  const { sessionId = '' } = useParams()
  const path =
    target === 'result'
      ? `/analysis/session/${sessionId}/result`
      : `/analysis/session/${sessionId}`

  return <Navigate to={path} replace />
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: withRouteSuspense(<LoginPage />),
    errorElement: <RouteErrorBoundary />,
  },
  {
    element: <RequireAuth />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        element: <AppShell />,
        errorElement: <RouteErrorBoundary />,
        children: [
          { index: true, element: <Navigate to="/analysis/modes" replace /> },
          {
            path: '/dashboard',
            element: <Navigate to="/analysis/modes" replace />,
          },
          {
            path: '/analysis/modes',
            element: withRouteSuspense(<ModeSelectionPage />),
          },
          {
            path: '/analysis/intake',
            element: <Navigate to="/analysis/modes" replace />,
          },
          {
            path: '/analysis/session/:sessionId',
            element: withRouteSuspense(<AnalysisSessionPage />),
          },
          {
            path: '/analysis/session/:sessionId/clarify',
            element: <LegacyAnalysisSessionRedirect target="session" />,
          },
          {
            path: '/analysis/session/:sessionId/progress',
            element: <LegacyAnalysisSessionRedirect target="session" />,
          },
          {
            path: '/analysis/session/:sessionId/report',
            element: <LegacyAnalysisSessionRedirect target="result" />,
          },
          {
            path: '/analysis/session/:sessionId/result',
            element: withRouteSuspense(<ReportPage />),
          },
          {
            path: '/analysis/session/:sessionId/execute',
            element: withRouteSuspense(<ExecutionPage />),
          },
          { path: '/settings', element: withRouteSuspense(<SettingsPage />) },
          { path: '/profile', element: withRouteSuspense(<ProfilePage />) },
          {
            path: '/notifications',
            element: <Navigate to="/analysis/modes" replace />,
          },
          {
            path: '/files',
            element: <Navigate to="/analysis/modes" replace />,
          },
          {
            path: '/dataviz',
            element: <Navigate to="/analysis/modes" replace />,
          },
          {
            path: '/resources/:resourceKey',
            element: withRouteSuspense(<ResourceListPage />),
          },
          {
            path: '/resources/:resourceKey/new',
            element: withRouteSuspense(<ResourceFormPage />),
          },
          {
            path: '/resources/:resourceKey/:recordId',
            element: withRouteSuspense(<ResourceDetailPage />),
          },
          {
            path: '/resources/:resourceKey/:recordId/edit',
            element: withRouteSuspense(<ResourceFormPage />),
          },
        ],
      },
    ],
  },
  {
    path: '/debug/login',
    element: withRouteSuspense(<DebugLoginPage />),
    errorElement: <RouteErrorBoundary />,
  },
  {
    element: <RequireDebugAuth />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        element: <DebugShell />,
        errorElement: <RouteErrorBoundary />,
        children: [
          { path: '/debug', element: <Navigate to="/debug/logs" replace /> },
          { path: '/debug/logs', element: withRouteSuspense(<AuditLogPage />) },
          {
            path: '/debug/sessions',
            element: withRouteSuspense(<SessionDebugPage />),
          },
          {
            path: '/debug/admin/roles',
            element: withRouteSuspense(<RolesPage />),
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/analysis/modes" replace />,
    errorElement: <RouteErrorBoundary />,
  },
])
