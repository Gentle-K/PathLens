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
const NewAnalysisPage = lazy(() =>
  import('@/features/analysis/pages/mode-selection-page').then((module) => ({
    default: module.ModeSelectionPage,
  })),
)
const SessionsPage = lazy(() =>
  import('@/features/analysis/pages/sessions-page').then((module) => ({
    default: module.SessionsPage,
  })),
)
const AssetsHubPage = lazy(() =>
  import('@/features/assets/assets-hub-page').then((module) => ({
    default: module.AssetsHubPage,
  })),
)
const AssetProofPage = lazy(() =>
  import('@/features/assets/asset-proof-page').then((module) => ({
    default: module.AssetProofPage,
  })),
)
const SessionDetailPage = lazy(() =>
  import('@/features/analysis/pages/session-detail-page').then((module) => ({
    default: module.SessionDetailPage,
  })),
)
const ClarifyPage = lazy(() =>
  import('@/features/analysis/pages/analysis-session-page').then((module) => ({
    default: module.AnalysisSessionPage,
  })),
)
const AnalyzingPage = lazy(() =>
  import('@/features/analysis/pages/progress-page').then((module) => ({
    default: module.ProgressPage,
  })),
)
const ReportsPage = lazy(() =>
  import('@/features/analysis/pages/reports-page').then((module) => ({
    default: module.ReportsPage,
  })),
)
const ReportDetailPage = lazy(() =>
  import('@/features/analysis/pages/report-page').then((module) => ({
    default: module.ReportPage,
  })),
)
const ExecutionPage = lazy(() =>
  import('@/features/analysis/pages/execution-page').then((module) => ({
    default: module.ExecutionPage,
  })),
)
const EvidencePage = lazy(() =>
  import('@/features/analysis/pages/evidence-page').then((module) => ({
    default: module.EvidencePage,
  })),
)
const CalculationsPage = lazy(() =>
  import('@/features/analysis/pages/calculations-page').then((module) => ({
    default: module.CalculationsPage,
  })),
)
const SettingsPage = lazy(() =>
  import('@/features/settings/settings-page').then((module) => ({
    default: module.SettingsPage,
  })),
)
const RolesPage = lazy(() =>
  import('@/features/admin/roles-page').then((module) => ({
    default: module.RolesPage,
  })),
)
const RwaOpsPage = lazy(() =>
  import('@/features/admin/rwa-ops-page').then((module) => ({
    default: module.RwaOpsPage,
  })),
)
const PortfolioPage = lazy(() =>
  import('@/features/portfolio/portfolio-page').then((module) => ({
    default: module.PortfolioPage,
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

function RouteFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20 w-full bg-brand-soft/55" />
      <div className="grid gap-4 xl:grid-cols-3">
        <Skeleton className="h-52 w-full bg-brand-soft/45" />
        <Skeleton className="h-52 w-full bg-brand-soft/45" />
        <Skeleton className="h-52 w-full bg-brand-soft/45" />
      </div>
      <Skeleton className="h-72 w-full bg-brand-soft/4" />
    </div>
  )
}

function withRouteSuspense(element: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>
}

function LegacySessionRedirect({
  mode,
}: {
  mode: 'detail' | 'clarify' | 'analyzing' | 'report' | 'execute'
}) {
  const { sessionId = '' } = useParams()

  const target =
    mode === 'clarify'
      ? `/sessions/${sessionId}/clarify`
      : mode === 'analyzing'
        ? `/sessions/${sessionId}/analyzing`
        : mode === 'execute'
          ? `/sessions/${sessionId}/execute`
        : mode === 'report'
          ? `/reports/${sessionId}`
          : `/sessions/${sessionId}`

  return <Navigate to={target} replace />
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
          { index: true, element: <Navigate to="/new-analysis" replace /> },
          { path: '/dashboard', element: <Navigate to="/new-analysis" replace /> },
          { path: '/new-analysis', element: withRouteSuspense(<NewAnalysisPage />) },
          { path: '/assets', element: withRouteSuspense(<AssetsHubPage />) },
          { path: '/assets/:assetId/proof', element: withRouteSuspense(<AssetProofPage />) },
          { path: '/sessions', element: withRouteSuspense(<SessionsPage />) },
          { path: '/sessions/:sessionId', element: withRouteSuspense(<SessionDetailPage />) },
          {
            path: '/sessions/:sessionId/clarify',
            element: withRouteSuspense(<ClarifyPage />),
          },
          {
            path: '/sessions/:sessionId/analyzing',
            element: withRouteSuspense(<AnalyzingPage />),
          },
          { path: '/reports', element: withRouteSuspense(<ReportsPage />) },
          {
            path: '/reports/:reportId',
            element: withRouteSuspense(<ReportDetailPage />),
          },
          { path: '/portfolio', element: withRouteSuspense(<PortfolioPage />) },
          { path: '/portfolio/:address', element: withRouteSuspense(<PortfolioPage />) },
          {
            path: '/sessions/:sessionId/execute',
            element: withRouteSuspense(<ExecutionPage />),
          },
          { path: '/evidence', element: withRouteSuspense(<EvidencePage />) },
          {
            path: '/calculations',
            element: withRouteSuspense(<CalculationsPage />),
          },
          { path: '/settings', element: withRouteSuspense(<SettingsPage />) },

          { path: '/analysis/modes', element: <Navigate to="/new-analysis" replace /> },
          { path: '/analysis/intake', element: <Navigate to="/new-analysis" replace /> },
          {
            path: '/analysis/session/:sessionId',
            element: <LegacySessionRedirect mode="detail" />,
          },
          {
            path: '/analysis/session/:sessionId/clarify',
            element: <LegacySessionRedirect mode="clarify" />,
          },
          {
            path: '/analysis/session/:sessionId/progress',
            element: <LegacySessionRedirect mode="analyzing" />,
          },
          {
            path: '/analysis/session/:sessionId/report',
            element: <LegacySessionRedirect mode="report" />,
          },
          {
            path: '/analysis/session/:sessionId/result',
            element: <LegacySessionRedirect mode="report" />,
          },
          {
            path: '/analysis/session/:sessionId/execute',
            element: <LegacySessionRedirect mode="execute" />,
          },
          { path: '/resources/analyses', element: <Navigate to="/sessions" replace /> },
          { path: '/profile', element: <Navigate to="/settings" replace /> },
          { path: '/notifications', element: <Navigate to="/sessions" replace /> },
          { path: '/files', element: <Navigate to="/evidence" replace /> },
          { path: '/dataviz', element: <Navigate to="/reports" replace /> },
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
          {
            path: '/debug/rwa-ops',
            element: withRouteSuspense(<RwaOpsPage />),
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/new-analysis" replace />,
    errorElement: <RouteErrorBoundary />,
  },
])
