import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Radio,
  RefreshCw,
  ShieldCheck,
  Wallet,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { PageHeader } from '@/components/layout/page-header'
import { TransactionStatus } from '@/components/web3/TransactionStatus'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  KycSnapshotSection,
  TxReceiptSection,
} from '@/features/analysis/components/result-sections'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import { useAppStore } from '@/lib/store/app-store'
import { resolveWalletNetwork, shortAddress } from '@/lib/web3/hashkey'
import {
  classifyTransactionError,
  errorMessage,
  type TransactionFailureInfo,
} from '@/lib/web3/transaction-errors'
import { useAttestationWriter, useHashKeyWallet } from '@/lib/web3/use-hashkey-wallet'
import type {
  EligibilityStatus,
  ExecutionPlan,
  PositionSnapshot,
  TransactionReceiptRecord,
  TxReceipt,
  WalletNetworkKey,
} from '@/types'

type ExecutionPhase =
  | 'pre_check'
  | 'signing'
  | 'submitted'
  | 'pending'
  | 'success'
  | 'failure'

function formatUsd(value?: number) {
  if (value == null || Number.isNaN(value)) {
    return 'N/A'
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value)
}

function formatNumber(value?: number, digits = 2) {
  if (value == null || Number.isNaN(value)) {
    return 'N/A'
  }
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
  }).format(value)
}

function statusTone(phase: ExecutionPhase) {
  switch (phase) {
    case 'success':
      return 'success' as const
    case 'failure':
      return 'danger' as const
    default:
      return 'gold' as const
  }
}

function eligibilityTone(status?: EligibilityStatus) {
  if (status === 'eligible') return 'success' as const
  if (status === 'conditional') return 'gold' as const
  return 'warning' as const
}

function uniqueByKey<T>(items: T[], keyFn: (item: T) => string) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = keyFn(item)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function toTxReceipt(
  record: TransactionReceiptRecord | null | undefined,
  fallbackNetwork: WalletNetworkKey,
): TxReceipt | null {
  if (!record?.txHash) {
    return null
  }

  return {
    transactionHash: record.txHash,
    transactionUrl: record.explorerUrl || '',
    blockNumber: record.blockNumber,
    submittedBy: record.walletAddress,
    submittedAt: record.executedAt,
    network: fallbackNetwork,
  }
}

function phaseFromReceipt(record: TransactionReceiptRecord): ExecutionPhase {
  if (record.txStatus === 'confirmed') {
    return 'success'
  }
  if (record.txStatus === 'failed') {
    return 'failure'
  }
  if (record.txStatus === 'submitted') {
    return 'pending'
  }
  return 'submitted'
}

function StatBlock({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
        {label}
      </p>
      <p className="mt-2 text-base font-semibold text-text-primary">{value}</p>
      {detail ? <p className="mt-2 text-sm leading-6 text-text-secondary">{detail}</p> : null}
    </div>
  )
}

export function ExecutionPage() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const adapter = useApiAdapter()
  const locale = useAppStore((state) => state.locale)
  const isZh = locale === 'zh'
  const submitTimeoutRef = useRef<number | null>(null)
  const initialPlanRequestedRef = useRef(false)

  const sessionQuery = useQuery({
    queryKey: ['analysis', sessionId],
    queryFn: () => adapter.analysis.getById(sessionId),
  })

  const reportQuery = useQuery({
    queryKey: ['analysis', sessionId, 'report'],
    queryFn: () => adapter.analysis.getReport(sessionId),
  })

  const session = sessionQuery.data
  const report = reportQuery.data

  const wallet = useHashKeyWallet(report?.chainConfig)
  const attestationWriter = useAttestationWriter(report?.chainConfig)

  const targetNetwork: WalletNetworkKey =
    report?.attestationDraft?.network === 'mainnet' ? 'mainnet' : 'testnet'

  const trackedWalletAddress =
    wallet.walletAddress ||
    session?.walletAddress ||
    session?.intakeContext.walletAddress ||
    session?.safeAddress ||
    session?.intakeContext.safeAddress ||
    ''

  const walletSummaryQuery = useQuery({
    queryKey: ['analysis', sessionId, 'wallet-summary', trackedWalletAddress, targetNetwork],
    queryFn: () => adapter.rwa.getWalletSummary(trackedWalletAddress, targetNetwork),
    enabled: Boolean(trackedWalletAddress),
  })

  const walletPositionsQuery = useQuery({
    queryKey: ['analysis', sessionId, 'wallet-positions', trackedWalletAddress, targetNetwork],
    queryFn: () => adapter.rwa.getWalletPositions(trackedWalletAddress, targetNetwork),
    enabled: Boolean(trackedWalletAddress),
  })

  const eligibleCatalogQuery = useQuery({
    queryKey: ['analysis', sessionId, 'eligible-catalog', trackedWalletAddress, targetNetwork],
    queryFn: () =>
      adapter.rwa.getEligibleCatalog({
        address: trackedWalletAddress,
        sessionId,
        network: targetNetwork,
      }),
    enabled: Boolean(trackedWalletAddress),
  })

  const monitorQuery = useQuery({
    queryKey: ['analysis', sessionId, 'monitor'],
    queryFn: () => adapter.rwa.monitor(sessionId),
    enabled: Boolean(session && report),
    refetchInterval:
      session?.status === 'MONITORING' || session?.status === 'EXECUTING' ? 30_000 : false,
  })

  const [phase, setPhase] = useState<ExecutionPhase>('pre_check')
  const [transactionReceipt, setTransactionReceipt] = useState<TxReceipt | null>(null)
  const [executionError, setExecutionError] = useState<TransactionFailureInfo | null>(null)
  const [uiError, setUiError] = useState('')
  const [recordWarning, setRecordWarning] = useState('')

  useEffect(() => {
    return () => {
      if (submitTimeoutRef.current != null) {
        window.clearTimeout(submitTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!session) {
      return
    }

    if (session.status === 'CLARIFYING') {
      void navigate(`/sessions/${sessionId}/clarify`, { replace: true })
      return
    }

    if (session.status === 'ANALYZING') {
      void navigate(`/sessions/${sessionId}/analyzing`, { replace: true })
    }
  }, [navigate, session, sessionId])

  const storedPlan = useMemo(
    () => report?.executionPlan ?? session?.executionPlan,
    [report?.executionPlan, session?.executionPlan],
  )

  const targetAsset =
    storedPlan?.targetAsset ||
    report?.recommendedAllocations[0]?.assetId ||
    report?.assetCards[0]?.assetId ||
    ''
  const sourceAsset =
    storedPlan?.sourceAsset ||
    session?.sourceAsset ||
    session?.intakeContext.sourceAsset ||
    report?.assetCards.find((item) => item.assetId === targetAsset)?.settlementAsset ||
    walletSummaryQuery.data?.balances[0]?.symbol ||
    'USDT'
  const ticketSize =
    storedPlan?.ticketSize ||
    session?.ticketSize ||
    session?.intakeContext.ticketSize ||
    session?.intakeContext.investmentAmount ||
    report?.recommendedAllocations[0]?.suggestedAmount ||
    0
  const sourceChain =
    storedPlan?.sourceChain ||
    session?.sourceChain ||
    session?.intakeContext.sourceChain ||
    'hashkey'
  const safeAddress = session?.safeAddress || session?.intakeContext.safeAddress || ''

  const executeMutation = useMutation({
    mutationFn: () =>
      adapter.rwa.execute({
        sessionId,
        sourceAsset,
        targetAsset,
        amount: ticketSize,
        walletAddress: trackedWalletAddress,
        safeAddress,
        sourceChain,
        includeAttestation: true,
        generateOnly: true,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['analysis', sessionId] })
      await queryClient.invalidateQueries({ queryKey: ['analysis', sessionId, 'report'] })
    },
  })

  const simulateMutation = useMutation({
    mutationFn: () =>
      adapter.rwa.simulate({
        sessionId,
        sourceAsset,
        targetAsset,
        amount: ticketSize,
        walletAddress: trackedWalletAddress,
        safeAddress,
        sourceChain,
        includeAttestation: true,
      }),
  })

  const recordAttestationMutation = useMutation({
    mutationFn: (payload: {
      network: WalletNetworkKey
      transactionHash: string
      submittedBy?: string
      blockNumber?: number
    }) => adapter.analysis.recordAttestation(sessionId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['analysis', sessionId] })
      await queryClient.invalidateQueries({ queryKey: ['analysis', sessionId, 'report'] })
      await queryClient.invalidateQueries({ queryKey: ['analysis', sessionId, 'monitor'] })
    },
  })

  useEffect(() => {
    if (initialPlanRequestedRef.current || !session || !report) {
      return
    }
    if (storedPlan || !targetAsset || !ticketSize) {
      return
    }

    initialPlanRequestedRef.current = true
    void executeMutation.mutateAsync().catch(() => {})
  }, [executeMutation, report, session, storedPlan, targetAsset, ticketSize])

  const currentPlan: ExecutionPlan | undefined = executeMutation.data?.executionPlan ?? storedPlan

  const mergedReceipts = useMemo(
    () =>
      uniqueByKey(
        [
          ...(session?.transactionReceipts ?? []),
          ...(report?.transactionReceipts ?? []),
          ...(executeMutation.data?.txReceipts ?? []),
        ],
        (item) => `${item.id}:${item.txHash}`,
      ),
    [
      executeMutation.data?.txReceipts,
      report?.transactionReceipts,
      session?.transactionReceipts,
    ],
  )

  const mergedAnchors = useMemo(
    () =>
      uniqueByKey(
        [
          ...(session?.reportAnchorRecords ?? []),
          ...(report?.reportAnchorRecords ?? []),
          ...(executeMutation.data?.reportAnchorRecords ?? []),
        ],
        (item) => `${item.id}:${item.attestationHash}`,
      ),
    [
      executeMutation.data?.reportAnchorRecords,
      report?.reportAnchorRecords,
      session?.reportAnchorRecords,
    ],
  )

  const latestReceiptRecord = mergedReceipts.at(-1)
  const storedReceipt =
    transactionReceipt ??
    toTxReceipt(latestReceiptRecord, targetNetwork) ??
    (report?.attestationDraft?.transactionHash
      ? {
          transactionHash: report.attestationDraft.transactionHash,
          transactionUrl:
            report.attestationDraft.transactionUrl ||
            report.attestationDraft.explorerUrl ||
            '',
          blockNumber: report.attestationDraft.blockNumber,
          submittedBy: report.attestationDraft.submittedBy,
          submittedAt: report.attestationDraft.submittedAt,
          network: targetNetwork,
        }
      : null)

  useEffect(() => {
    if (!latestReceiptRecord) {
      return
    }

    setPhase(phaseFromReceipt(latestReceiptRecord))
    setTransactionReceipt((current) => current ?? toTxReceipt(latestReceiptRecord, targetNetwork))
  }, [latestReceiptRecord, targetNetwork])

  const primaryAsset =
    report?.assetCards.find((item) => item.assetId === currentPlan?.targetAsset) ||
    report?.assetCards.find((item) => item.assetId === targetAsset) ||
    report?.assetCards[0]

  const primaryEligibility =
    currentPlan?.eligibility[0] ||
    report?.eligibilitySummary?.find((item) => item.assetId === currentPlan?.targetAsset) ||
    report?.eligibilitySummary?.find((item) => item.assetId === targetAsset)

  const liveWalletNetwork =
    report?.chainConfig != null
      ? resolveWalletNetwork(report.chainConfig, useAppStore.getState().walletChainId)
      : null
  const correctNetwork = wallet.walletNetwork === targetNetwork

  const attestationReady = Boolean(
    report?.attestationDraft?.ready && report.attestationDraft.contractAddress,
  )
  const complianceBlockers =
    simulateMutation.data?.complianceBlockers ?? currentPlan?.complianceBlockers ?? []
  const simulationWarnings =
    simulateMutation.data?.warnings ?? currentPlan?.simulationWarnings ?? currentPlan?.warnings ?? []
  const possibleFailureReasons =
    simulateMutation.data?.possibleFailureReasons ??
    currentPlan?.possibleFailureReasons ??
    []
  const requiredApprovals = currentPlan?.requiredApprovals ?? []
  const quote = simulateMutation.data?.quote ?? currentPlan?.quote
  const hasSuccessfulReceipt =
    Boolean(report?.attestationDraft?.transactionHash) ||
    mergedReceipts.some((item) => item.txStatus === 'confirmed')
  const executionBusy =
    wallet.isWalletBusy ||
    attestationWriter.isPending ||
    recordAttestationMutation.isPending ||
    executeMutation.isPending ||
    simulateMutation.isPending ||
    phase === 'signing' ||
    phase === 'submitted' ||
    phase === 'pending'

  const canWriteAttestation =
    attestationReady &&
    wallet.hasProvider &&
    !executionBusy &&
    !hasSuccessfulReceipt &&
    complianceBlockers.length === 0

  const checks = [
    {
      label: isZh ? '已检测到钱包 Provider' : 'Injected wallet provider detected',
      passed: wallet.hasProvider,
      icon: Wallet,
    },
    {
      label: isZh ? '钱包已连接' : 'Wallet connected',
      passed: wallet.isConnected,
      icon: Wallet,
    },
    {
      label: isZh ? '钱包处于 HashKey 网络' : 'Wallet is on a HashKey network',
      passed: Boolean(wallet.walletNetwork),
      icon: Radio,
    },
    {
      label: isZh ? `目标网络匹配 ${targetNetwork}` : `Target network matched: ${targetNetwork}`,
      passed: correctNetwork,
      icon: Radio,
    },
    {
      label: isZh ? 'Plan Registry 可写' : 'Plan Registry attestation is configured',
      passed: attestationReady,
      icon: ShieldCheck,
    },
  ]

  const monitoringSnapshots =
    monitorQuery.data?.positionSnapshots.length
      ? monitorQuery.data.positionSnapshots
      : report?.positionSnapshots?.length
        ? report.positionSnapshots
        : session?.positionSnapshots?.length
          ? session.positionSnapshots
          : walletPositionsQuery.data ?? []

  const handleBuildPlan = async () => {
    if (!targetAsset || !ticketSize) {
      setUiError('Execution plan requires a target asset and ticket size.')
      return
    }

    setUiError('')
    await executeMutation.mutateAsync().catch((error) => {
      setUiError(errorMessage(error))
    })
  }

  const handleSimulate = async () => {
    if (!targetAsset || !ticketSize) {
      setUiError('Simulation requires a target asset and ticket size.')
      return
    }

    setUiError('')
    await simulateMutation.mutateAsync().catch((error) => {
      setUiError(errorMessage(error))
    })
  }

  const handleConnect = async () => {
    setUiError('')
    try {
      await wallet.connectWallet()
    } catch (error) {
      setUiError(errorMessage(error))
    }
  }

  const handleSwitchNetwork = async () => {
    setUiError('')
    try {
      await wallet.switchNetwork(targetNetwork)
    } catch (error) {
      setUiError(errorMessage(error))
    }
  }

  const handleExecute = async () => {
    if (!report?.attestationDraft || !report.chainConfig) {
      setUiError('Attestation configuration is not available for this report yet.')
      return
    }

    setUiError('')
    setRecordWarning('')
    setExecutionError(null)
    setPhase('signing')

    try {
      if (!wallet.isConnected) {
        await wallet.connectWallet()
      }

      const resolvedNetwork = resolveWalletNetwork(
        report.chainConfig,
        useAppStore.getState().walletChainId,
      )

      if (resolvedNetwork !== targetNetwork) {
        await wallet.switchNetwork(targetNetwork)
      }

      const receipt = await attestationWriter.mutateAsync({
        network: targetNetwork,
        reportHash: report.attestationDraft.reportHash,
        portfolioHash: report.attestationDraft.portfolioHash,
        attestationHash: report.attestationDraft.attestationHash,
        sessionId,
        summaryUri:
          typeof window !== 'undefined'
            ? window.location.href
            : `session:${sessionId}`,
        onTransactionSubmitted: (submitted) => {
          setTransactionReceipt({
            transactionHash: submitted.transactionHash,
            transactionUrl: submitted.transactionUrl,
            submittedBy: submitted.account,
            network: targetNetwork,
          })
          setPhase('submitted')

          if (submitTimeoutRef.current != null) {
            window.clearTimeout(submitTimeoutRef.current)
          }

          submitTimeoutRef.current = window.setTimeout(() => {
            setPhase((current) => (current === 'submitted' ? 'pending' : current))
          }, 600)
        },
      })

      const confirmedReceipt: TxReceipt = {
        transactionHash: receipt.transactionHash,
        transactionUrl: receipt.transactionUrl,
        blockNumber: receipt.blockNumber,
        submittedBy: receipt.account,
        submittedAt: new Date().toISOString(),
        network: targetNetwork,
      }

      setTransactionReceipt(confirmedReceipt)
      setPhase('success')

      try {
        await recordAttestationMutation.mutateAsync({
          network: targetNetwork,
          transactionHash: receipt.transactionHash,
          submittedBy: receipt.account,
          blockNumber: receipt.blockNumber,
        })
      } catch (recordError) {
        setRecordWarning(errorMessage(recordError))
      }
    } catch (error) {
      setExecutionError(classifyTransactionError(error))
      setUiError(errorMessage(error))
      setPhase('failure')
    }
  }

  if (!session || !report) {
    return (
      <Card className="p-6 text-sm text-text-secondary">
        {isZh ? '正在加载执行工作台...' : 'Loading execution workbench...'}
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isZh ? '执行工作台' : 'Execution Workbench'}
        title={isZh ? 'HashKey Chain 执行控制台' : 'HashKey Chain Execution Console'}
        description={
          isZh
            ? '围绕 wallet -> eligibility -> execution plan -> simulation -> attestation -> monitoring 的闭环执行。'
            : 'Run the wallet -> eligibility -> execution plan -> simulation -> attestation -> monitoring loop from one page.'
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => void navigate(`/reports/${sessionId}`)}>
              <ArrowLeft className="size-4" />
              {isZh ? '返回报告' : 'Back to report'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void handleBuildPlan()}
              disabled={executeMutation.isPending}
            >
              {executeMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {currentPlan ? (isZh ? '刷新执行计划' : 'Refresh execution plan') : isZh ? '生成执行计划' : 'Generate execution plan'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void handleSimulate()}
              disabled={simulateMutation.isPending || !targetAsset || !ticketSize}
            >
              {simulateMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Radio className="size-4" />
              )}
              {isZh ? '运行模拟' : 'Run simulation'}
            </Button>
            <Button onClick={() => void handleExecute()} disabled={!canWriteAttestation}>
              {executionBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShieldCheck className="size-4" />
              )}
              {isZh ? '写入链上存证并回写' : 'Write attestation and sync back'}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="space-y-5 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {isZh ? '钱包与资格快照' : 'Wallet and eligibility snapshot'}
              </p>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                {isZh
                  ? '以连接钱包或 Safe 为主入口，直接读取 KYC / SBT、持仓与可投资产。'
                  : 'Use the connected wallet or Safe as the primary entry for live KYC / SBT, positions, and eligible catalog access.'}
              </p>
            </div>
            <Badge tone={statusTone(phase)}>{phase.replace('_', ' ')}</Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <StatBlock
              label={isZh ? '当前地址' : 'Tracked address'}
              value={trackedWalletAddress ? shortAddress(trackedWalletAddress) : 'Not connected'}
              detail={trackedWalletAddress || 'Connect a wallet or use the saved session address.'}
            />
            <StatBlock
              label={isZh ? 'KYC / SBT' : 'KYC / SBT'}
              value={
                walletSummaryQuery.data
                  ? `L${walletSummaryQuery.data.kyc.level} / ${walletSummaryQuery.data.kyc.status}`
                  : report.kycSnapshot
                    ? `L${report.kycSnapshot.level} / ${report.kycSnapshot.status}`
                    : 'Not loaded'
              }
              detail={
                walletSummaryQuery.data?.safeDetected
                  ? isZh
                    ? '检测到合约钱包 / Safe。'
                    : 'Contract wallet / Safe detected.'
                  : safeAddress
                    ? safeAddress
                    : isZh
                      ? '未检测到 Safe。'
                      : 'No Safe detected.'
              }
            />
            <StatBlock
              label={isZh ? '识别持仓' : 'Detected positions'}
              value={String(monitoringSnapshots.length)}
              detail={isZh ? '包含已识别 RWA 与相关资产。' : 'Recognized RWA and related asset positions.'}
            />
            <StatBlock
              label={isZh ? '资格分类' : 'Eligibility buckets'}
              value={`${eligibleCatalogQuery.data?.eligible.length ?? 0} / ${eligibleCatalogQuery.data?.conditional.length ?? 0} / ${eligibleCatalogQuery.data?.blocked.length ?? 0}`}
              detail={isZh ? 'Eligible / Conditional / Blocked' : 'Eligible / Conditional / Blocked'}
            />
          </div>

          <div className="space-y-3">
            {checks.map((check) => {
              const Icon = check.icon
              return (
                <div
                  key={check.label}
                  className="flex items-center gap-3 rounded-xl border border-border-subtle bg-app-bg-elevated p-4"
                >
                  {check.passed ? (
                    <CheckCircle2 className="size-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="size-4 text-amber-300" />
                  )}
                  <Icon className="size-4 text-text-muted" />
                  <span className={check.passed ? 'text-text-primary' : 'text-text-secondary'}>
                    {check.label}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            {!wallet.isConnected ? (
              <Button onClick={() => void handleConnect()} disabled={!wallet.hasProvider || executionBusy}>
                <Wallet className="size-4" />
                {isZh ? '连接钱包' : 'Connect wallet'}
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => wallet.disconnectWallet()}
                disabled={executionBusy}
              >
                {isZh ? '断开本地连接' : 'Disconnect local wallet'}
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => void handleSwitchNetwork()}
              disabled={!wallet.hasProvider || correctNetwork || executionBusy}
            >
              <Radio className="size-4" />
              {isZh ? '切换网络' : 'Switch network'}
            </Button>
          </div>

          {walletSummaryQuery.data?.balances.length ? (
            <div className="rounded-[20px] border border-border-subtle bg-bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                {isZh ? '钱包余额' : 'Wallet balances'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {walletSummaryQuery.data.balances.slice(0, 6).map((balance) => (
                  <Badge key={`${balance.symbol}-${balance.contractAddress ?? balance.chainId}`} tone="neutral">
                    {balance.symbol}: {formatNumber(balance.amount, 4)}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {isZh ? '资产事实与执行上下文' : 'Asset facts and execution context'}
              </p>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                {isZh
                  ? '将资格、合约地址、赎回窗口和风险提示保留在执行页。'
                  : 'Keep eligibility, contract facts, redemption terms, and risk flags visible at execution time.'}
              </p>
            </div>
            {primaryEligibility ? (
              <Badge tone={eligibilityTone(primaryEligibility.status)}>
                {primaryEligibility.status}
              </Badge>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <StatBlock
              label={isZh ? '目标资产' : 'Target asset'}
              value={primaryAsset?.symbol || currentPlan?.targetAsset || 'N/A'}
              detail={primaryAsset?.name || currentPlan?.targetAsset || 'No asset selected.'}
            />
            <StatBlock
              label={isZh ? '票面规模' : 'Ticket size'}
              value={formatUsd(ticketSize)}
              detail={`${sourceAsset} · ${sourceChain}`}
            />
            <StatBlock
              label={isZh ? '协议 / 路由' : 'Protocol / route'}
              value={primaryAsset?.protocolName || quote?.routeType || 'N/A'}
              detail={primaryAsset?.permissioningStandard || 'Execution style inferred from asset metadata.'}
            />
            <StatBlock
              label={isZh ? '最小认购 / 赎回' : 'Min subscription / redemption'}
              value={
                primaryAsset?.minSubscriptionAmount
                  ? formatUsd(primaryAsset.minSubscriptionAmount)
                  : 'N/A'
              }
              detail={primaryAsset?.redemptionWindow || 'No redemption window published.'}
            />
          </div>

          <div className="space-y-3 rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
              {isZh ? '关键事实' : 'Execution-critical facts'}
            </p>
            <div className="grid gap-2 text-sm text-text-secondary">
              <p>
                {isZh ? '合约地址' : 'Contract'}:{' '}
                <span className="break-all text-text-primary">
                  {primaryAsset?.contractAddress || report.attestationDraft?.contractAddress || 'N/A'}
                </span>
              </p>
              <p>
                {isZh ? 'Oracle / Proof' : 'Oracle / Proof'}:{' '}
                <span className="text-text-primary">
                  {primaryAsset?.oracleProvider || 'N/A'}
                </span>
              </p>
              <p>
                {isZh ? '托管摘要' : 'Custody'}:{' '}
                <span className="text-text-primary">{primaryAsset?.custodySummary || 'N/A'}</span>
              </p>
              <p>
                {isZh ? '桥支持' : 'Bridge support'}:{' '}
                <span className="text-text-primary">
                  {primaryAsset?.bridgeSupport?.join(' · ') || 'HashKey native only'}
                </span>
              </p>
            </div>
            {primaryAsset?.riskFlags?.length ? (
              <div className="flex flex-wrap gap-2">
                {primaryAsset.riskFlags.map((flag) => (
                  <Badge key={flag} tone="warning">
                    {flag}
                  </Badge>
                ))}
              </div>
            ) : null}
            {primaryEligibility?.missingRequirements.length ? (
              <div className="rounded-xl border border-[rgba(245,158,11,0.24)] bg-[rgba(245,158,11,0.12)] p-3 text-sm text-warning">
                {isZh ? '缺失要求' : 'Missing requirements'}:{' '}
                {primaryEligibility.missingRequirements.join(' · ')}
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      {uiError && phase !== 'failure' ? (
        <Card className="border-[rgba(244,63,94,0.3)] bg-[rgba(244,63,94,0.08)] p-4 text-sm text-red-200">
          {uiError}
        </Card>
      ) : null}

      <Card className="space-y-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-text-primary">
              {isZh ? '执行计划' : 'Execution plan'}
            </p>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              {isZh
                ? '计划由后端 orchestrator 生成，并回写到 session / report。'
                : 'The backend orchestrator generates the plan and writes it back into the session and report.'}
            </p>
          </div>
          {currentPlan ? (
            <div className="flex flex-wrap gap-2">
              <Badge tone="neutral">{currentPlan.status}</Badge>
              {currentPlan.planHash ? <Badge tone="info">{currentPlan.planHash.slice(0, 14)}...</Badge> : null}
            </div>
          ) : null}
        </div>

        {quote ? (
          <div className="grid gap-3 md:grid-cols-4">
            <StatBlock
              label={isZh ? '预期到账' : 'Expected amount'}
              value={formatNumber(quote.expectedAmountOut, 4)}
              detail={quote.targetAsset}
            />
            <StatBlock
              label={isZh ? '费用' : 'Fee'}
              value={formatUsd(quote.feeAmount)}
              detail={`${formatNumber(quote.feeBps, 0)} bps`}
            />
            <StatBlock
              label={isZh ? 'Gas 估算' : 'Gas estimate'}
              value={formatUsd(quote.gasEstimateUsd)}
              detail={`${formatNumber(quote.gasEstimate, 0)} gas`}
            />
            <StatBlock
              label={isZh ? '预计耗时' : 'ETA'}
              value={`${formatNumber(quote.etaSeconds, 0)}s`}
              detail={quote.routeType}
            />
          </div>
        ) : null}

        {currentPlan ? (
          <div className="space-y-3">
            {currentPlan.steps.map((step) => (
              <Card key={step.id} className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-text-primary">
                      {step.stepIndex}. {step.title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-text-secondary">
                      {step.description}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="neutral">{step.stepType}</Badge>
                    <Badge tone={step.requiresSignature ? 'primary' : 'neutral'}>
                      {step.requiresSignature ? 'Signature' : 'No signature'}
                    </Badge>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <StatBlock
                    label={isZh ? '预计费用' : 'Estimated fee'}
                    value={formatUsd(step.estimatedFeeUsd)}
                    detail={step.routeKind}
                  />
                  <StatBlock
                    label={isZh ? '目标合约' : 'Target contract'}
                    value={step.targetContract ? shortAddress(step.targetContract) : 'N/A'}
                    detail={step.targetContract || 'No target contract for this step.'}
                  />
                  <StatBlock
                    label={isZh ? '预期数量' : 'Expected amount'}
                    value={step.expectedAmount != null ? formatNumber(step.expectedAmount, 4) : 'N/A'}
                    detail={`Chain ${step.chainId ?? 'N/A'}`}
                  />
                </div>
                {step.offchainActions.length ? (
                  <div className="rounded-xl border border-border-subtle bg-app-bg-elevated p-4 text-sm text-text-secondary">
                    <p className="font-semibold text-text-primary">
                      {isZh ? '链下动作' : 'Off-chain actions'}
                    </p>
                    <ul className="mt-2 space-y-2">
                      {step.offchainActions.map((action) => (
                        <li key={action}>{action}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {step.explorerUrl ? (
                  <a
                    href={step.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-accent-cyan"
                  >
                    <ExternalLink className="size-4" />
                    {isZh ? '查看合约' : 'Open contract'}
                  </a>
                ) : null}
              </Card>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border-subtle bg-app-bg-elevated p-4 text-sm text-text-secondary">
            {isZh
              ? '还没有执行计划。点击上方按钮从真实后端生成。'
              : 'No execution plan has been generated yet. Use the action above to build one from the real backend.'}
          </div>
        )}

        {currentPlan?.txBundle.length ? (
          <div className="space-y-3 rounded-[20px] border border-border-subtle bg-bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                {isZh ? '可签名交易 Bundle' : 'Signable tx bundle'}
              </p>
              <Badge tone="primary">{currentPlan.txBundle.length} tx</Badge>
            </div>
            <pre className="overflow-x-auto rounded-xl bg-[#09101c] p-4 text-xs text-[#c8d3e4]">
              {JSON.stringify(currentPlan.txBundle, null, 2)}
            </pre>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
        <Card className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-text-primary">
              {isZh ? '模拟与警告' : 'Simulation and warnings'}
            </p>
            <Badge tone={simulateMutation.data ? 'success' : 'neutral'}>
              {simulateMutation.data ? (isZh ? '已模拟' : 'Simulated') : 'Pending'}
            </Badge>
          </div>

          {simulationWarnings.length ? (
            <div className="space-y-2 rounded-xl border border-[rgba(245,158,11,0.24)] bg-[rgba(245,158,11,0.12)] p-4 text-sm text-warning">
              {simulationWarnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border-subtle bg-app-bg-elevated p-4 text-sm text-text-secondary">
              {isZh ? '暂无额外模拟警告。' : 'No additional simulation warnings yet.'}
            </div>
          )}

          {requiredApprovals.length ? (
            <div className="space-y-3 rounded-xl border border-border-subtle bg-app-bg-elevated p-4">
              <p className="text-sm font-semibold text-text-primary">
                {isZh ? '所需授权' : 'Required approvals'}
              </p>
              {requiredApprovals.map((approval) => (
                <div
                  key={`${approval.approvalType}-${approval.spender ?? approval.tokenSymbol ?? 'approval'}`}
                  className="rounded-xl border border-border-subtle bg-bg-surface p-3 text-sm text-text-secondary"
                >
                  <p className="font-semibold text-text-primary">{approval.approvalType}</p>
                  <p className="mt-1">
                    {(approval.tokenSymbol || 'Asset')}{' '}
                    {approval.amount != null ? formatNumber(approval.amount, 4) : ''}
                  </p>
                  <p className="mt-1 break-all">{approval.spender || approval.note || 'No spender provided.'}</p>
                </div>
              ))}
            </div>
          ) : null}

          {possibleFailureReasons.length ? (
            <div className="space-y-2 rounded-xl border border-[rgba(244,63,94,0.22)] bg-[rgba(244,63,94,0.08)] p-4 text-sm text-red-200">
              <p className="font-semibold">{isZh ? '可能失败原因' : 'Possible failure reasons'}</p>
              {possibleFailureReasons.map((reason) => (
                <p key={reason}>{reason}</p>
              ))}
            </div>
          ) : null}

          {complianceBlockers.length ? (
            <div className="space-y-2 rounded-xl border border-[rgba(244,63,94,0.22)] bg-[rgba(244,63,94,0.08)] p-4 text-sm text-red-200">
              <p className="font-semibold">{isZh ? '合规阻塞' : 'Compliance blockers'}</p>
              {complianceBlockers.map((blocker) => (
                <p key={blocker}>{blocker}</p>
              ))}
            </div>
          ) : null}
        </Card>

        <Card className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-text-primary">
              {isZh ? '交易状态与回写' : 'Transaction status and writeback'}
            </p>
            {safeAddress ? (
              <Badge tone="info">
                <Building2 className="size-3.5" />
                {shortAddress(safeAddress)}
              </Badge>
            ) : null}
          </div>

          <TransactionStatus
            status={
              phase === 'pre_check'
                ? 'idle'
                : phase === 'signing'
                  ? 'signing'
                  : phase === 'submitted'
                    ? 'submitted'
                    : phase === 'pending'
                      ? 'pending'
                      : phase === 'success'
                        ? 'confirmed'
                        : 'failed'
            }
            txHash={storedReceipt?.transactionHash}
            explorerUrl={storedReceipt?.transactionUrl}
            blockNumber={storedReceipt?.blockNumber}
            errorMessage={executionError?.message}
          />

          {phase === 'success' ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-[#ccebd7]">
              {isZh
                ? '链上存证成功。交易哈希、区块号和状态已经回写到 report / session。'
                : 'Attestation succeeded. Tx hash, block number, and status have been written back to the report and session.'}
            </div>
          ) : null}

          {phase === 'failure' && executionError ? (
            <div className="rounded-xl border border-[rgba(244,63,94,0.22)] bg-[rgba(244,63,94,0.08)] p-4 text-sm text-red-200">
              <p className="font-semibold">
                {isZh ? '执行失败' : 'Execution failed'}
              </p>
              <p className="mt-2">
                {isZh ? '失败类别' : 'Reason'}: {executionError.reason}
              </p>
              <p className="mt-2">{executionError.message}</p>
            </div>
          ) : null}

          {recordWarning ? (
            <div className="rounded-xl border border-[rgba(245,158,11,0.24)] bg-[rgba(245,158,11,0.12)] p-4 text-sm text-warning">
              {recordWarning}
            </div>
          ) : null}

          {mergedAnchors.length ? (
            <div className="space-y-3 rounded-xl border border-border-subtle bg-app-bg-elevated p-4">
              <p className="text-sm font-semibold text-text-primary">
                {isZh ? 'Anchor 记录' : 'Anchor records'}
              </p>
              {mergedAnchors.map((anchor) => (
                <div
                  key={anchor.id}
                  className="rounded-xl border border-border-subtle bg-bg-surface p-3 text-sm text-text-secondary"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-text-primary">{anchor.status}</span>
                    {anchor.transactionHash ? <Badge tone="success">{shortAddress(anchor.transactionHash)}</Badge> : null}
                  </div>
                  <p className="mt-2 break-all">{anchor.note || anchor.attestationHash}</p>
                  {anchor.explorerUrl ? (
                    <a
                      href={anchor.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-2 text-accent-cyan"
                    >
                      <ExternalLink className="size-4" />
                      {isZh ? '查看 Anchor' : 'Open anchor'}
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {walletSummaryQuery.data?.kyc ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-text-primary">
              {isZh ? '实时钱包 KYC' : 'Live wallet KYC'}
            </p>
            <KycSnapshotSection kyc={walletSummaryQuery.data.kyc} locale={locale} />
          </div>
        ) : wallet.kycSnapshot ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-text-primary">
              {isZh ? '实时钱包 KYC' : 'Live wallet KYC'}
            </p>
            <KycSnapshotSection kyc={wallet.kycSnapshot} locale={locale} />
          </div>
        ) : (
          <Card className="p-5">
            <p className="text-sm font-semibold text-text-primary">
              {isZh ? '实时钱包 KYC' : 'Live wallet KYC'}
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {walletSummaryQuery.isLoading
                ? isZh
                  ? '正在读取 KYC...'
                  : 'Loading wallet KYC...'
                : isZh
                  ? '钱包未连接或当前地址还没有可读取的 KYC 状态。'
                  : 'The wallet is not connected or the tracked address does not expose a readable KYC state yet.'}
            </p>
          </Card>
        )}

        {report.kycSnapshot ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-text-primary">
              {isZh ? '报告 KYC 快照' : 'Report KYC snapshot'}
            </p>
            <KycSnapshotSection kyc={report.kycSnapshot} locale={locale} />
          </div>
        ) : null}
      </div>

      {storedReceipt?.transactionUrl ? (
        <TxReceiptSection receipt={storedReceipt} locale={locale} />
      ) : null}

      <Card className="space-y-5 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-text-primary">
              {isZh ? '基础持仓监控' : 'Baseline position monitoring'}
            </p>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              {isZh
                ? '使用 execution records + 钱包余额 + oracle 快照计算基础监控。'
                : 'Monitoring is derived from stored execution records, wallet balances, and live oracle snapshots.'}
            </p>
          </div>
          <Badge tone={monitorQuery.isSuccess ? 'success' : 'neutral'}>
            {session.status}
          </Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <StatBlock
            label={isZh ? '当前余额' : 'Current balance'}
            value={formatNumber(monitorQuery.data?.currentBalance, 4)}
            detail={isZh ? '聚合基础持仓。' : 'Aggregate current position balance.'}
          />
          <StatBlock
            label={isZh ? '最新净值 / 价格' : 'Latest NAV / price'}
            value={formatUsd(monitorQuery.data?.latestNavOrPrice)}
            detail={isZh ? '来自 oracle 快照。' : 'From the latest oracle snapshot.'}
          />
          <StatBlock
            label={isZh ? '未实现 PnL' : 'Unrealized PnL'}
            value={formatUsd(monitorQuery.data?.unrealizedPnl)}
            detail={`${isZh ? '成本基准' : 'Cost basis'}: ${formatUsd(monitorQuery.data?.costBasis)}`}
          />
          <StatBlock
            label={isZh ? '累计收益' : 'Accrued yield'}
            value={formatUsd(monitorQuery.data?.accruedYield)}
            detail={
              monitorQuery.data?.nextRedemptionWindow
                ? `${isZh ? '下次赎回窗口' : 'Next redemption'}: ${monitorQuery.data.nextRedemptionWindow}`
                : isZh
                  ? '暂无赎回窗口。'
                  : 'No redemption window available.'
            }
          />
        </div>

        {(monitorQuery.data?.alertFlags.length ||
          monitorQuery.data?.oracleStalenessFlag ||
          monitorQuery.data?.kycChangeFlag) ? (
          <div className="flex flex-wrap gap-2">
            {monitorQuery.data?.oracleStalenessFlag ? (
              <Badge tone="warning">{isZh ? 'Oracle 可能过期' : 'Oracle may be stale'}</Badge>
            ) : null}
            {monitorQuery.data?.kycChangeFlag ? (
              <Badge tone="warning">{isZh ? 'KYC 状态变化' : 'KYC status changed'}</Badge>
            ) : null}
            {(monitorQuery.data?.alertFlags ?? []).map((flag) => (
              <Badge key={flag} tone="warning">
                {flag}
              </Badge>
            ))}
          </div>
        ) : null}

        {monitoringSnapshots.length ? (
          <div className="space-y-3">
            {monitoringSnapshots.map((snapshot: PositionSnapshot) => (
              <Card key={snapshot.id} className="grid gap-3 p-4 md:grid-cols-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                    {isZh ? '资产' : 'Asset'}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-text-primary">
                    {snapshot.assetName}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                    {isZh ? '余额' : 'Balance'}
                  </p>
                  <p className="mt-2 text-sm text-text-primary">
                    {formatNumber(snapshot.currentBalance, 4)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                    {isZh ? '当前价值' : 'Current value'}
                  </p>
                  <p className="mt-2 text-sm text-text-primary">
                    {formatUsd(snapshot.currentValue)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                    {isZh ? '未实现 PnL' : 'Unrealized PnL'}
                  </p>
                  <p className="mt-2 text-sm text-text-primary">
                    {formatUsd(snapshot.unrealizedPnl)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                    {isZh ? '监控标志' : 'Flags'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {snapshot.oracleStalenessFlag ? (
                      <Badge tone="warning">oracle</Badge>
                    ) : null}
                    {snapshot.kycChangeFlag ? <Badge tone="warning">kyc</Badge> : null}
                    {!snapshot.oracleStalenessFlag && !snapshot.kycChangeFlag ? (
                      <Badge tone="success">{isZh ? '正常' : 'Normal'}</Badge>
                    ) : null}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border-subtle bg-app-bg-elevated p-4 text-sm text-text-secondary">
            {isZh
              ? '当前没有可展示的监控持仓。'
              : 'No monitoring positions are available yet.'}
          </div>
        )}
      </Card>

      {session.status === 'FAILED' ? (
        <Card className="border-[rgba(197,109,99,0.35)] bg-[rgba(197,109,99,0.08)] p-5">
          <div className="flex items-center gap-2 text-[#f7d4cf]">
            <XCircle className="size-5" />
            <p className="font-semibold">
              {isZh ? '原始会话被标记为失败' : 'The underlying analysis session is marked as failed'}
            </p>
          </div>
          <p className="mt-2 text-sm leading-6 text-[#f1cbc6]">
            {session.errorMessage}
          </p>
        </Card>
      ) : null}

      <Card className="p-5">
        <div className="flex items-center gap-2">
          <Wallet className="size-5 text-gold-primary" />
          <p className="text-sm font-semibold text-text-primary">
            {isZh ? '执行上下文' : 'Execution context'}
          </p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-border-subtle bg-app-bg-elevated p-4">
            <p className="text-xs text-text-muted">{isZh ? '钱包' : 'Wallet'}</p>
            <p className="mt-2 break-all text-sm text-text-primary">
              {trackedWalletAddress || 'N/A'}
            </p>
          </div>
          <div className="rounded-xl border border-border-subtle bg-app-bg-elevated p-4">
            <p className="text-xs text-text-muted">{isZh ? 'Safe' : 'Safe'}</p>
            <p className="mt-2 break-all text-sm text-text-primary">
              {safeAddress || 'N/A'}
            </p>
          </div>
          <div className="rounded-xl border border-border-subtle bg-app-bg-elevated p-4">
            <p className="text-xs text-text-muted">{isZh ? '当前链' : 'Current chain'}</p>
            <p className="mt-2 text-sm text-text-primary">
              {wallet.walletNetwork || liveWalletNetwork || targetNetwork}
            </p>
          </div>
          <div className="rounded-xl border border-border-subtle bg-app-bg-elevated p-4">
            <p className="text-xs text-text-muted">{isZh ? '回写状态' : 'Writeback state'}</p>
            <p className="mt-2 text-sm text-text-primary">
              {hasSuccessfulReceipt
                ? isZh
                  ? '已回写到 report / session'
                  : 'Synced to report and session'
                : isZh
                  ? '等待交易确认'
                  : 'Waiting for transaction confirmation'}
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
