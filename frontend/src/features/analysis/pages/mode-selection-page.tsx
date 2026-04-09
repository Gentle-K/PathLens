import { useMutation, useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  CheckCircle2,
  Coins,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/field'
import { AnalysisPendingView } from '@/features/analysis/components/analysis-pending-view'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import type { AnalysisMode, LiquidityNeed, RiskTolerance, RwaIntakeContext } from '@/types'

const defaultIntakeContext: RwaIntakeContext = {
  investmentAmount: 10000,
  baseCurrency: 'USDT',
  preferredAssetIds: ['hsk-usdc', 'cpic-estable-mmf', 'hk-regulated-silver'],
  holdingPeriodDays: 30,
  riskTolerance: 'balanced',
  liquidityNeed: 't_plus_3',
  minimumKycLevel: 0,
  walletAddress: '',
  wantsOnchainAttestation: true,
  additionalConstraints: '',
}

const modeCopy: Record<
  AnalysisMode,
  {
    title: string
    subtitle: string
    examples: string[]
    outputs: string[]
  }
> = {
  'single-option': {
    title: '单资产尽调',
    subtitle: '适合深挖某个稳定币、MMF 或 RWA 资产的风险、条款和执行路径。',
    examples: [
      '我有 10,000 USDT，是否应该把其中一部分放进白银 RWA？',
      'HashKey Chain 上的 MMF 风格 RWA 是否适合我做 30 天配置？',
      '我适不适合把稳定币从纯活期切换到更高收益的 RWA 产品？',
    ],
    outputs: ['RiskVector', '持有期模拟', '证据面板', '执行草案'],
  },
  'multi-option': {
    title: '多资产配置',
    subtitle: '适合同时比较稳定币收益、MMF、贵金属和其他 RWA，给出组合建议。',
    examples: [
      '我有 10,000 USDT，应该放稳定币收益、MMF、白银 RWA，还是保留更多现金？',
      '风险偏好中等、要高流动性的情况下，我在 HashKey Chain 上怎么配 RWA？',
      '如果我只能接受 T+3 退出，USDC、MMF 和白银 RWA 应该怎么组合？',
    ],
    outputs: ['对比矩阵', '收益分布', '建议权重', '链上存证草案'],
  },
}

const riskOptions: Array<{ value: RiskTolerance; label: string; detail: string }> = [
  { value: 'conservative', label: '保守', detail: '优先保流动性和低回撤' },
  { value: 'balanced', label: '均衡', detail: '兼顾收益、流动性和分散' },
  { value: 'aggressive', label: '进取', detail: '接受更高波动以换更高弹性' },
]

const liquidityOptions: Array<{ value: LiquidityNeed; label: string; detail: string }> = [
  { value: 'instant', label: 'T+0', detail: '几乎随时可以退出' },
  { value: 't_plus_3', label: 'T+3', detail: '接受少量赎回摩擦' },
  { value: 'locked', label: '可锁定', detail: '能接受更长持有期' },
]

const kycOptions = [
  { value: 0, label: '暂无 KYC', detail: '仅考虑无门槛或低门槛资产' },
  { value: 1, label: '基础 KYC', detail: '可进入一部分受限产品' },
  { value: 2, label: '更高等级', detail: '可评估专业投资者类产品' },
]

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

export function ModeSelectionPage() {
  const navigate = useNavigate()
  const adapter = useApiAdapter()
  const [selectedMode, setSelectedMode] = useState<AnalysisMode>('multi-option')
  const [problemStatement, setProblemStatement] = useState(
    modeCopy['multi-option'].examples[0],
  )
  const [intakeContext, setIntakeContext] =
    useState<RwaIntakeContext>(defaultIntakeContext)
  const [assetQuery, setAssetQuery] = useState('')

  const modesQuery = useQuery({
    queryKey: ['analysis', 'modes'],
    queryFn: adapter.modes.list,
  })

  const bootstrapQuery = useQuery({
    queryKey: ['rwa', 'bootstrap'],
    queryFn: adapter.rwa.getBootstrap,
  })

  const createMutation = useMutation({
    mutationFn: adapter.analysis.create,
    onSuccess: (session) => {
      void navigate(`/analysis/session/${session.id}`)
    },
  })

  const selectedPreset = modeCopy[selectedMode]
  const availableModes = useMemo(
    () => (modesQuery.data?.length ? modesQuery.data : undefined),
    [modesQuery.data],
  )
  const assetLibrary = useMemo(
    () => bootstrapQuery.data?.assetLibrary ?? [],
    [bootstrapQuery.data?.assetLibrary],
  )
  const filteredAssets = useMemo(() => {
    const normalized = assetQuery.trim().toLowerCase()
    if (!normalized) {
      return assetLibrary
    }

    return assetLibrary.filter((asset) =>
      `${asset.name} ${asset.symbol} ${asset.description} ${asset.tags.join(' ')}`.toLowerCase().includes(normalized),
    )
  }, [assetLibrary, assetQuery])

  const toggleAsset = (assetId: string) => {
    setIntakeContext((current) => {
      const selected = current.preferredAssetIds.includes(assetId)
        ? current.preferredAssetIds.filter((candidate) => candidate !== assetId)
        : [...current.preferredAssetIds, assetId]

      return {
        ...current,
        preferredAssetIds: selected,
      }
    })
  }

  if (createMutation.isPending) {
    return (
      <AnalysisPendingView
        eyebrow="HashKey Chain / RWA"
        title="正在创建 RWA 分析会话"
        description="系统会先固定你的资金约束、资产范围和持有期，再进入统一的分析界面，推进证据、计算和报告。"
        loaderLabel="正在初始化 RWA 决策工作台，请稍候。"
        stageLabel="初始化"
        stageTitle="准备 RWA 分析上下文"
        stageDescription="正在整理 HashKey Chain 资产模板、用户偏好和编排状态。"
        tips={[
          '先锁定资产集合与持有期，再讨论收益和结论。',
          'KYC 和流动性会直接影响可配资产范围。',
        ]}
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="HashKey Chain / RWA"
        title="RWA 配置决策引擎"
        description="把自然语言问题和结构化约束一起交给后端，系统会输出 RiskVector、持有期模拟、证据面板、交易草案和链上存证草案。"
      />

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-3 text-sm text-text-secondary">
          <Badge tone="gold">第 1 页 / Intake</Badge>
          <span>先锁定资产、持有期、流动性和 KYC。</span>
          <span>第 2 页会推进证据、计算和图表。</span>
          <span>第 3 页输出配置建议、执行草案和报告哈希。</span>
        </div>

        {bootstrapQuery.data ? (
          <div className="mt-4 grid gap-3 xl:grid-cols-4">
            <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
              <p className="text-xs text-text-muted">Mainnet</p>
              <p className="mt-2 font-medium text-text-primary">
                {bootstrapQuery.data.chainConfig.mainnetChainId}
              </p>
            </div>
            <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
              <p className="text-xs text-text-muted">Testnet</p>
              <p className="mt-2 font-medium text-text-primary">
                {bootstrapQuery.data.chainConfig.testnetChainId}
              </p>
            </div>
            <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
              <p className="text-xs text-text-muted">默认执行网络</p>
              <p className="mt-2 font-medium text-text-primary">
                {bootstrapQuery.data.chainConfig.defaultExecutionNetwork}
              </p>
            </div>
            <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
              <p className="text-xs text-text-muted">Plan Registry</p>
              <p className="mt-2 break-all text-sm text-text-primary">
                {bootstrapQuery.data.chainConfig.planRegistryAddress || '未配置'}
              </p>
            </div>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {(availableModes ?? []).map((mode) => {
          const isSelected = selectedMode === mode.id

          return (
            <Card
              key={mode.id}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              onClick={() => {
                setSelectedMode(mode.id)
                setProblemStatement(modeCopy[mode.id].examples[0])
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setSelectedMode(mode.id)
                  setProblemStatement(modeCopy[mode.id].examples[0])
                }
              }}
              className={`interactive-lift relative overflow-hidden p-6 ${
                isSelected
                  ? 'border-border-strong bg-[linear-gradient(180deg,rgba(249,228,159,0.08),transparent_100%),var(--panel)] shadow-[0_0_0_1px_rgba(249,228,159,0.18),0_24px_72px_rgba(212,175,55,0.16)]'
                  : ''
              }`}
            >
              {isSelected ? (
                <div className="absolute inset-y-6 left-0 w-1 rounded-full bg-[var(--gold-primary)]" />
              ) : null}

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <div className="inline-flex rounded-full border border-border-subtle bg-app-bg-elevated p-3 text-gold-primary">
                    {mode.id === 'single-option' ? (
                      <ShieldCheck className="size-5" />
                    ) : (
                      <Coins className="size-5" />
                    )}
                  </div>
                  <div>
                    <h2 className="text-2xl font-semibold tracking-[-0.03em] text-text-primary">
                      {modeCopy[mode.id].title}
                    </h2>
                    <p className="mt-2 text-sm leading-7 text-text-secondary">
                      {modeCopy[mode.id].subtitle}
                    </p>
                  </div>
                </div>
                {isSelected ? (
                  <Badge tone="gold" className="gap-1 px-3 py-1.5">
                    <CheckCircle2 className="size-3.5" />
                    当前已选
                  </Badge>
                ) : null}
              </div>

              <div className="mt-6 grid gap-2">
                {modeCopy[mode.id].outputs.map((item) => (
                  <div
                    key={item}
                    className={`rounded-[18px] border px-4 py-3 text-sm ${
                      isSelected
                        ? 'border-border-strong bg-[rgba(212,175,55,0.12)] text-text-primary'
                        : 'border-border-subtle bg-app-bg-elevated text-text-secondary'
                    }`}
                  >
                    {item}
                  </div>
                ))}
              </div>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <Card className="space-y-5 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="gold">{selectedPreset.title}</Badge>
            <Badge tone="neutral">{intakeContext.preferredAssetIds.length} 个资产已选</Badge>
          </div>

          <div className="space-y-2">
            <label htmlFor="problemStatement" className="text-sm text-text-secondary">
              你的问题
            </label>
            <Textarea
              id="problemStatement"
              value={problemStatement}
              onChange={(event) => setProblemStatement(event.target.value)}
              placeholder="例如：我有 10,000 USDT，风险偏好中等，希望保持高流动性，应该怎么配？"
              className="min-h-32 text-base"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs text-text-muted">问题示例</p>
            <div className="flex flex-wrap gap-2">
              {selectedPreset.examples.map((example) => {
                const isActive = problemStatement === example
                return (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setProblemStatement(example)}
                    className={`interactive-lift rounded-full border px-4 py-2 text-sm transition ${
                      isActive
                        ? 'border-border-strong bg-[rgba(212,175,55,0.14)] text-text-primary'
                        : 'border-border-subtle bg-app-bg-elevated text-text-secondary hover:border-border-strong hover:text-text-primary'
                    }`}
                  >
                    {example}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm text-text-secondary">本金</label>
              <Input
                type="number"
                min={100}
                value={String(intakeContext.investmentAmount)}
                onChange={(event) =>
                  setIntakeContext((current) => ({
                    ...current,
                    investmentAmount: Number(event.target.value || 0),
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-text-secondary">结算币种</label>
              <Input
                value={intakeContext.baseCurrency}
                onChange={(event) =>
                  setIntakeContext((current) => ({
                    ...current,
                    baseCurrency: event.target.value.toUpperCase(),
                  }))
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-text-secondary">持有期</p>
            <div className="flex flex-wrap gap-2">
              {(bootstrapQuery.data?.holdingPeriodPresets ?? [7, 30, 90, 180]).map((days) => {
                const isActive = intakeContext.holdingPeriodDays === days
                return (
                  <button
                    key={days}
                    type="button"
                    onClick={() =>
                      setIntakeContext((current) => ({
                        ...current,
                        holdingPeriodDays: days,
                      }))
                    }
                    className={`rounded-full border px-4 py-2 text-sm ${
                      isActive
                        ? 'border-border-strong bg-[rgba(212,175,55,0.14)] text-text-primary'
                        : 'border-border-subtle bg-app-bg-elevated text-text-secondary'
                    }`}
                  >
                    {days} 天
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-text-secondary">风险偏好</p>
            <div className="grid gap-2 md:grid-cols-3">
              {riskOptions.map((option) => {
                const isActive = intakeContext.riskTolerance === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setIntakeContext((current) => ({
                        ...current,
                        riskTolerance: option.value,
                      }))
                    }
                    className={`rounded-[18px] border px-4 py-4 text-left ${
                      isActive
                        ? 'border-border-strong bg-[rgba(212,175,55,0.14)] text-text-primary'
                        : 'border-border-subtle bg-app-bg-elevated text-text-secondary'
                    }`}
                  >
                    <p className="font-medium">{option.label}</p>
                    <p className="mt-2 text-xs leading-6 text-text-muted">{option.detail}</p>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-text-secondary">流动性约束</p>
            <div className="grid gap-2 md:grid-cols-3">
              {liquidityOptions.map((option) => {
                const isActive = intakeContext.liquidityNeed === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setIntakeContext((current) => ({
                        ...current,
                        liquidityNeed: option.value,
                      }))
                    }
                    className={`rounded-[18px] border px-4 py-4 text-left ${
                      isActive
                        ? 'border-border-strong bg-[rgba(212,175,55,0.14)] text-text-primary'
                        : 'border-border-subtle bg-app-bg-elevated text-text-secondary'
                    }`}
                  >
                    <p className="font-medium">{option.label}</p>
                    <p className="mt-2 text-xs leading-6 text-text-muted">{option.detail}</p>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-text-secondary">KYC / 准入能力</p>
            <div className="grid gap-2 md:grid-cols-3">
              {kycOptions.map((option) => {
                const isActive = intakeContext.minimumKycLevel === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setIntakeContext((current) => ({
                        ...current,
                        minimumKycLevel: option.value,
                      }))
                    }
                    className={`rounded-[18px] border px-4 py-4 text-left ${
                      isActive
                        ? 'border-border-strong bg-[rgba(212,175,55,0.14)] text-text-primary'
                        : 'border-border-subtle bg-app-bg-elevated text-text-secondary'
                    }`}
                  >
                    <p className="font-medium">{option.label}</p>
                    <p className="mt-2 text-xs leading-6 text-text-muted">{option.detail}</p>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm text-text-secondary">钱包地址（可选）</label>
              <Input
                value={intakeContext.walletAddress ?? ''}
                onChange={(event) =>
                  setIntakeContext((current) => ({
                    ...current,
                    walletAddress: event.target.value.trim(),
                  }))
                }
                placeholder="0x..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-text-secondary">报告存证</label>
              <button
                type="button"
                onClick={() =>
                  setIntakeContext((current) => ({
                    ...current,
                    wantsOnchainAttestation: !current.wantsOnchainAttestation,
                  }))
                }
                className={`rounded-[18px] border px-4 py-3 text-left ${
                  intakeContext.wantsOnchainAttestation
                    ? 'border-border-strong bg-[rgba(212,175,55,0.14)] text-text-primary'
                    : 'border-border-subtle bg-app-bg-elevated text-text-secondary'
                }`}
              >
                <p className="font-medium">
                  {intakeContext.wantsOnchainAttestation ? '启用链上存证草案' : '仅生成离线草案'}
                </p>
                <p className="mt-2 text-xs leading-6 text-text-muted">
                  控制结果页是否生成 Plan Registry attestation 草案。
                </p>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-text-secondary">补充约束（可选）</label>
            <Textarea
              value={intakeContext.additionalConstraints ?? ''}
              onChange={(event) =>
                setIntakeContext((current) => ({
                  ...current,
                  additionalConstraints: event.target.value,
                }))
              }
              placeholder="例如：最多只拿 40% 做高摩擦资产；必须保留 T+0 备用金；更偏向有官方披露的产品。"
              className="min-h-24"
            />
          </div>

          <Button
            onClick={() =>
              void createMutation.mutateAsync({
                mode: selectedMode,
                problemStatement,
                intakeContext,
              })
            }
            disabled={
              !problemStatement.trim() ||
              intakeContext.preferredAssetIds.length === 0 ||
              createMutation.isPending
            }
          >
            <Sparkles className="size-4" />
            开始 RWA 分析
            <ArrowRight className="size-4" />
          </Button>

          {createMutation.isError ? (
            <div className="rounded-2xl border border-[rgba(197,109,99,0.35)] bg-[rgba(197,109,99,0.12)] px-4 py-3 text-sm text-[#f7d4cf]">
              创建会话失败，请检查后端是否正常运行。
            </div>
          ) : null}
        </Card>

        <div className="space-y-4">
          <Card className="space-y-4 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Asset Library</h2>
                <p className="text-sm leading-7 text-text-secondary">
                  选择希望纳入分析的资产模板。资产越少，单资产尽调越深；资产越多，组合建议越明显。
                </p>
              </div>
              <Badge tone="gold">{filteredAssets.length}</Badge>
            </div>

            <Input
              value={assetQuery}
              onChange={(event) => setAssetQuery(event.target.value)}
              placeholder="搜索 USDC / MMF / Silver / Real Estate"
            />

            <div className="space-y-3">
              {filteredAssets.map((asset) => {
                const isSelected = intakeContext.preferredAssetIds.includes(asset.id)
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => toggleAsset(asset.id)}
                    className={`w-full rounded-[22px] border p-4 text-left ${
                      isSelected
                        ? 'border-border-strong bg-[rgba(212,175,55,0.12)]'
                        : 'border-border-subtle bg-app-bg-elevated hover:border-border-strong'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-text-primary">{asset.name}</p>
                          <Badge tone="neutral">{asset.symbol}</Badge>
                          <Badge tone={asset.featured ? 'gold' : 'neutral'}>{asset.assetType}</Badge>
                        </div>
                        <p className="mt-2 text-sm leading-7 text-text-secondary">{asset.description}</p>
                      </div>
                      {isSelected ? (
                        <CheckCircle2 className="mt-1 size-5 text-gold-primary" />
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-2 md:grid-cols-3">
                      <div className="rounded-[16px] border border-border-subtle bg-app-bg px-3 py-2">
                        <p className="text-xs text-text-muted">基准年化</p>
                        <p className="mt-1 font-medium text-text-primary">
                          {formatPercent(asset.expectedReturnBase)}
                        </p>
                      </div>
                      <div className="rounded-[16px] border border-border-subtle bg-app-bg px-3 py-2">
                        <p className="text-xs text-text-muted">最短退出</p>
                        <p className="mt-1 font-medium text-text-primary">
                          {asset.redemptionDays === 0 ? 'T+0' : `T+${asset.redemptionDays}`}
                        </p>
                      </div>
                      <div className="rounded-[16px] border border-border-subtle bg-app-bg px-3 py-2">
                        <p className="text-xs text-text-muted">KYC</p>
                        <p className="mt-1 font-medium text-text-primary">
                          {asset.requiresKycLevel ?? 0}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {asset.tags.map((tag) => (
                        <span
                          key={`${asset.id}-${tag}`}
                          className="rounded-full border border-border-subtle px-3 py-1 text-xs text-text-muted"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          </Card>

          <Card className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <WalletCards className="size-5 text-gold-primary" />
              <h2 className="text-lg font-semibold text-text-primary">这轮会输出什么</h2>
            </div>

            <div className="space-y-3">
              <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
                <p className="font-medium text-text-primary">RiskVector</p>
                <p className="mt-2 text-sm leading-7 text-text-secondary">
                  把 Market、Liquidity、Peg/Redemption、Issuer/Custody、Smart Contract、Oracle、Compliance 统一量化。
                </p>
              </div>
              <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
                <p className="font-medium text-text-primary">Holding Simulation</p>
                <p className="mt-2 text-sm leading-7 text-text-secondary">
                  输出 {intakeContext.holdingPeriodDays} 天持有期下的 P10 / P50 / P90 收益分布、VaR/CVaR 和最大回撤区间。
                </p>
              </div>
              <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
                <p className="font-medium text-text-primary">Evidence + Tx Draft</p>
                <p className="mt-2 text-sm leading-7 text-text-secondary">
                  每个关键判断都挂证据链接，并根据 HashKey Chain 配置生成执行步骤和报告哈希草案。
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
