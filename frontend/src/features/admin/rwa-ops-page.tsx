import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Gauge, RefreshCcw, ShieldCheck, Sparkles } from 'lucide-react'

import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import type { DebugOperationReceipt } from '@/types'

type NetworkKey = 'testnet' | 'mainnet'

function SummaryMetric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string | number
  tone?: 'neutral' | 'gold' | 'warning'
}) {
  return (
    <Card className="space-y-3 p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-text-muted">{label}</p>
      <div className="flex items-center justify-between">
        <p className="text-3xl font-semibold text-text-primary">{value}</p>
        <Badge tone={tone}>{tone === 'warning' ? 'Watch' : tone === 'gold' ? 'Live' : 'Ops'}</Badge>
      </div>
    </Card>
  )
}

export function RwaOpsPage() {
  const adapter = useApiAdapter()
  const queryClient = useQueryClient()
  const [network, setNetwork] = useState<NetworkKey>('testnet')
  const [lastReceipt, setLastReceipt] = useState<DebugOperationReceipt | null>(null)

  const summaryQuery = useQuery({
    queryKey: ['debug', 'rwa-ops', network],
    queryFn: () => adapter.debug.getRwaOpsSummary(network),
  })

  const jobsQuery = useQuery({
    queryKey: ['debug', 'rwa-jobs'],
    queryFn: () => adapter.debug.listRwaJobs(),
  })

  const operationMutation = useMutation({
    mutationFn: async (
      action:
        | { kind: 'refresh' }
        | { kind: 'retry' }
        | { kind: 'sync' }
        | { kind: 'indexer' }
        | { kind: 'publish'; snapshotId: string },
    ) => {
      switch (action.kind) {
        case 'refresh':
          return adapter.debug.refreshRwaProofs(network)
        case 'retry':
          return adapter.debug.retryRwaPublishes(network)
        case 'sync':
          return adapter.debug.syncRwaExecutionStatus()
        case 'indexer':
          return adapter.debug.runRwaIndexer()
        case 'publish':
          return adapter.debug.publishRwaSnapshot(action.snapshotId)
      }
    },
    onSuccess: async (receipt) => {
      setLastReceipt(receipt)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['debug', 'rwa-ops'] }),
        queryClient.invalidateQueries({ queryKey: ['debug', 'rwa-jobs'] }),
      ])
    },
  })

  const summary = summaryQuery.data
  const jobs = jobsQuery.data ?? summary?.jobHealth ?? []

  const confirmAndRun = (
    message: string,
    action:
      | { kind: 'refresh' }
      | { kind: 'retry' }
      | { kind: 'sync' }
      | { kind: 'indexer' }
      | { kind: 'publish'; snapshotId: string },
  ) => {
    if (!window.confirm(message)) {
      return
    }
    void operationMutation.mutateAsync(action)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Debug Ops"
        title="RWA Ops Console"
        description="Proof refresh, attester health, indexer lag, failed jobs, and contract anchors stay inside the protected debug surface."
      />

      <Card className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-3">
          {(['testnet', 'mainnet'] as NetworkKey[]).map((item) => (
            <Button
              key={item}
              variant={item === network ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setNetwork(item)}
            >
              {item}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() =>
              confirmAndRun(
                `Refresh live proof snapshots on ${network}?`,
                { kind: 'refresh' },
              )
            }
          >
            <RefreshCcw className="mr-2 size-4" />
            Refresh Proofs
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              confirmAndRun(
                `Retry pending or failed publishes on ${network}?`,
                { kind: 'retry' },
              )
            }
          >
            <Sparkles className="mr-2 size-4" />
            Retry Publish
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              confirmAndRun('Re-sync all execution receipts and settlement states?', {
                kind: 'sync',
              })
            }
          >
            <ShieldCheck className="mr-2 size-4" />
            Sync Receipts
          </Button>
          <Button
            onClick={() =>
              confirmAndRun(`Run the repo-local chain indexer for ${network}?`, {
                kind: 'indexer',
              })
            }
          >
            <Gauge className="mr-2 size-4" />
            Run Indexer
          </Button>
        </div>
      </Card>

      {lastReceipt ? (
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <Badge tone={lastReceipt.status === 'failed' ? 'warning' : 'success'}>
            {lastReceipt.status}
          </Badge>
          <p className="text-sm text-text-secondary">
            Operation `{lastReceipt.operationId}` processed {lastReceipt.itemCount} items.
          </p>
          {lastReceipt.errorMessage ? (
            <p className="text-sm text-danger">{lastReceipt.errorMessage}</p>
          ) : null}
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-5">
        <SummaryMetric label="Pending Publishes" value={summary?.pendingPublishCount ?? 0} tone="gold" />
        <SummaryMetric label="Failed Publishes" value={summary?.failedPublishCount ?? 0} tone="warning" />
        <SummaryMetric label="Stale Proofs" value={summary?.staleProofCount ?? 0} tone="warning" />
        <SummaryMetric label="Indexer Lag" value={summary?.maxIndexerLag ?? 0} tone="neutral" />
        <SummaryMetric label="Failed Jobs" value={summary?.failedJobCount ?? 0} tone="warning" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Proof Queue</h2>
              <p className="text-sm text-text-secondary">Latest live snapshots and their publish/index states.</p>
            </div>
            {summaryQuery.isLoading ? <Badge tone="neutral">Loading</Badge> : null}
          </div>
          <div className="space-y-3">
            {(summary?.proofQueue ?? []).map((proof) => (
              <div
                key={proof.snapshotId}
                className="rounded-[22px] border border-border-subtle bg-app-bg-elevated p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-text-primary">{proof.assetName}</p>
                      <Badge tone={proof.publishStatus === 'published' ? 'success' : 'warning'}>
                        {proof.publishStatus}
                      </Badge>
                      <Badge tone="neutral">{proof.anchorStatus.status}</Badge>
                    </div>
                    <p className="text-sm text-text-secondary">{proof.snapshotHash}</p>
                    <p className="text-xs text-text-muted">
                      {proof.executionReadiness} · {proof.oracleFreshness || 'oracle unknown'} ·{' '}
                      {proof.kycPolicySummary || 'kyc unknown'}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!proof.liveAsset || proof.visibilityRole !== 'live'}
                    onClick={() =>
                      confirmAndRun(
                        `Publish snapshot ${proof.snapshotId} for ${proof.assetName}?`,
                        { kind: 'publish', snapshotId: proof.snapshotId ?? '' },
                      )
                    }
                  >
                    Manual Publish
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-4 p-6">
          <h2 className="text-lg font-semibold text-text-primary">Attester Status</h2>
          <div className="space-y-3">
            {(summary?.attesterStatus ?? []).map((item) => (
              <div
                key={`${item.network}-${item.registryAddress}`}
                className="rounded-[22px] border border-border-subtle bg-app-bg-elevated p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-text-primary">{item.network}</p>
                  <Badge tone={item.publishEnabled ? 'success' : 'warning'}>
                    {item.publishEnabled ? 'publish enabled' : 'publish disabled'}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-text-muted">Registry: {item.registryAddress || 'not configured'}</p>
                <p className="mt-1 text-xs text-text-muted">Owner: {item.owner || 'unknown'}</p>
                <p className="mt-1 text-xs text-text-muted">
                  Publisher: {item.publisherAddress || 'unavailable'} {item.publisherAuthorized ? '(authorized)' : ''}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <Card className="space-y-4 p-6">
          <h2 className="text-lg font-semibold text-text-primary">Indexer Health</h2>
          <div className="space-y-3">
            {(summary?.indexerHealth ?? []).map((item) => (
              <div
                key={`${item.network}-${item.contractName}`}
                className="rounded-[22px] border border-border-subtle bg-app-bg-elevated p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-text-primary">{item.contractName}</p>
                  <Badge tone={item.status === 'synced' ? 'success' : item.status === 'disabled' ? 'neutral' : 'warning'}>
                    {item.status}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  {item.network} · indexed {item.lastIndexedBlock} / head {item.chainHead} · lag {item.lag}
                </p>
                {item.lastError ? (
                  <p className="mt-2 text-sm text-danger">{item.lastError}</p>
                ) : null}
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-4 p-6">
          <h2 className="text-lg font-semibold text-text-primary">Source Health</h2>
          <div className="space-y-3">
            {(summary?.sourceHealth ?? []).map((item) => (
              <div
                key={item.assetId}
                className="rounded-[22px] border border-border-subtle bg-app-bg-elevated p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-text-primary">{item.assetName}</p>
                  <Badge tone={item.publishStatus === 'published' ? 'success' : 'warning'}>
                    {item.publishStatus}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  proof {item.proofFreshnessLabel} · oracle {item.oracleFreshness} · confidence{' '}
                  {typeof item.sourceConfidence === 'number' ? item.sourceConfidence.toFixed(2) : 'n/a'}
                </p>
                {item.unavailableReasons.length ? (
                  <div className="mt-3 flex items-start gap-2 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 size-3.5" />
                    <p>{item.unavailableReasons.join(' ')}</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <Card className="space-y-4 p-6">
          <h2 className="text-lg font-semibold text-text-primary">Job Health</h2>
          <div className="space-y-3">
            {jobs.map((job) => (
              <div
                key={job.jobRunId}
                className="rounded-[22px] border border-border-subtle bg-app-bg-elevated p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-text-primary">{job.jobName}</p>
                  <Badge tone={job.status === 'failed' ? 'warning' : 'success'}>{job.status}</Badge>
                  <p className="text-xs text-text-muted">{job.network || 'all networks'}</p>
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  started {job.startedAt} · finished {job.finishedAt || 'running'} · items {job.itemCount}
                </p>
                {job.errorMessage ? (
                  <details className="mt-3 text-sm text-danger">
                    <summary className="cursor-pointer">View error</summary>
                    <p className="mt-2 whitespace-pre-wrap">{job.errorMessage}</p>
                  </details>
                ) : null}
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-4 p-6">
          <h2 className="text-lg font-semibold text-text-primary">Contract Anchors</h2>
          <div className="space-y-3">
            {(summary?.contractAnchors ?? []).map((item) => (
              <div
                key={`${item.assetId}-${item.network}`}
                className="rounded-[22px] border border-border-subtle bg-app-bg-elevated p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-text-primary">{item.assetName}</p>
                  <Badge tone={item.isLive ? 'success' : 'neutral'}>
                    {item.isLive ? 'live' : 'non-live'}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  proof key {item.latestProofKey || 'n/a'} · history {item.proofHistoryCount}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  plan key {item.latestPlanKey || 'n/a'} · session {item.latestPlanSessionId || 'n/a'}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
