import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ExternalLink, ShieldCheck, Wallet } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import { useAppStore } from '@/lib/store/app-store'

const FOCUSED_ASSET_IDS = [
  'hsk-usdt',
  'hsk-usdc',
  'cpic-estable-mmf',
  'hk-regulated-silver',
] as const

function readinessTone(readiness?: string) {
  if (readiness === 'ready') return 'success' as const
  if (readiness === 'partial') return 'gold' as const
  return 'warning' as const
}

export function AssetsHubPage() {
  const adapter = useApiAdapter()
  const navigate = useNavigate()
  const locale = useAppStore((state) => state.locale)
  const isZh = locale === 'zh'
  const walletAddress = useAppStore((state) => state.walletAddress)

  const bootstrapQuery = useQuery({
    queryKey: ['rwa', 'bootstrap', 'assets-hub'],
    queryFn: () => adapter.rwa.getBootstrap(),
  })

  const focusedAssets = useMemo(() => {
    const library = bootstrapQuery.data?.assetLibrary ?? []
    return FOCUSED_ASSET_IDS.map((id) => library.find((asset) => asset.id === id)).filter(Boolean)
  }, [bootstrapQuery.data?.assetLibrary]) as NonNullable<typeof bootstrapQuery.data>['assetLibrary']

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isZh ? 'Verifiable RWA Hub' : 'Verifiable RWA Hub'}
        title={isZh ? 'HashKey RWA 资产中心' : 'HashKey RWA Asset Hub'}
        description={
          isZh
            ? '先看资产真实性、准入资格、执行方式和赎回窗口，再决定是否进入分析或执行流。'
            : 'Review authenticity, eligibility, execution route, and redemption terms before treating any asset as executable.'
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => void navigate('/new-analysis')}>
              {isZh ? '新建分析' : 'New analysis'}
            </Button>
            <Button onClick={() => void navigate(walletAddress ? `/portfolio/${walletAddress}` : '/portfolio')}>
              <Wallet className="size-4" />
              {isZh ? '打开组合监控' : 'Open portfolio'}
            </Button>
          </>
        }
      />

      <Card className="grid gap-4 p-5 lg:grid-cols-3">
        <div className="rounded-[22px] bg-app-bg-elevated p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
            {isZh ? 'v1 证明范围' : 'v1 proof scope'}
          </p>
          <p className="mt-3 text-sm leading-6 text-text-secondary">
            {isZh
              ? '当前只把 4 个 HashKey 单链锚定资产拉进可验证证明中心，避免 demo 资产和 benchmark 误导用户。'
              : 'Only four HashKey single-chain anchor assets are treated as proof-first live targets in this release.'}
          </p>
        </div>
        <div className="rounded-[22px] bg-app-bg-elevated p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
            {isZh ? '执行分层' : 'Execution layering'}
          </p>
          <p className="mt-3 text-sm leading-6 text-text-secondary">
            {isZh
              ? '页面会明确区分 direct contract、issuer portal 和 view only，不再把展示型资产伪装成可执行。'
              : 'Each asset is explicitly categorized as direct contract, issuer portal, or view only.'}
          </p>
        </div>
        <div className="rounded-[22px] bg-app-bg-elevated p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
            {isZh ? '产品主线' : 'Product spine'}
          </p>
          <p className="mt-3 text-sm leading-6 text-text-secondary">
            {isZh
              ? '分析报告现在是入口，不是终点。真正的主路径是 资产证明 -> 执行 -> 监控。'
              : 'Analysis is now the entry point, not the final destination: proof -> execution -> monitoring.'}
          </p>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {focusedAssets.map((asset) => (
          <Card key={asset.id} className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info">{asset.symbol}</Badge>
                  <Badge tone={readinessTone(asset.liveReadiness)}>{asset.liveReadiness}</Badge>
                  {asset.truthLevel ? <Badge tone="neutral">{asset.truthLevel}</Badge> : null}
                </div>
                <p className="mt-3 text-lg font-semibold text-text-primary">{asset.name}</p>
                <p className="mt-2 text-sm leading-6 text-text-secondary">{asset.description}</p>
              </div>
              <ShieldCheck className="size-5 text-accent-cyan" />
            </div>

            <div className="grid gap-3 text-sm text-text-secondary md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? '结算资产' : 'Settlement'}
                </p>
                <p className="mt-2 text-text-primary">{asset.settlementAsset}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? 'KYC 要求' : 'KYC'}
                </p>
                <p className="mt-2 text-text-primary">
                  {asset.requiresKycLevel != null ? `L${asset.requiresKycLevel}` : 'Open'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? '赎回窗口' : 'Redemption'}
                </p>
                <p className="mt-2 text-text-primary">
                  {asset.redemptionWindow || (asset.redemptionDays ? `T+${asset.redemptionDays}` : 'T+0')}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? '执行方式' : 'Execution style'}
                </p>
                <p className="mt-2 text-text-primary">{asset.executionStyle}</p>
              </div>
            </div>

            <p className="text-sm leading-6 text-text-secondary">
              {asset.statusExplanation || asset.fitSummary}
            </p>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void navigate(`/assets/${asset.id}/proof`)}>
                <ArrowRight className="size-4" />
                {isZh ? '查看证明' : 'View proof'}
              </Button>
              {asset.primarySourceUrl ? (
                <Button
                  variant="secondary"
                  onClick={() => window.open(asset.primarySourceUrl, '_blank', 'noopener,noreferrer')}
                >
                  <ExternalLink className="size-4" />
                  {isZh ? '官方来源' : 'Primary source'}
                </Button>
              ) : null}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
