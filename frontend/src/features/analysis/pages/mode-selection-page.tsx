import { useMutation, useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Cable,
  CheckCircle2,
  Coins,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/field'
import { AnalysisPendingView } from '@/features/analysis/components/analysis-pending-view'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import { useAppStore } from '@/lib/store/app-store'
import { useHashKeyWallet } from '@/lib/web3/use-hashkey-wallet'
import type {
  AnalysisMode,
  LiquidityNeed,
  RiskTolerance,
  RwaIntakeContext,
} from '@/types'

const defaultIntakeContext: RwaIntakeContext = {
  investmentAmount: 10000,
  baseCurrency: 'USDT',
  preferredAssetIds: ['hsk-usdc', 'cpic-estable-mmf', 'hk-regulated-silver'],
  holdingPeriodDays: 30,
  riskTolerance: 'balanced',
  liquidityNeed: 't_plus_3',
  minimumKycLevel: 0,
  walletAddress: '',
  walletNetwork: '',
  walletKycLevelOnchain: undefined,
  walletKycVerified: undefined,
  wantsOnchainAttestation: true,
  additionalConstraints: '',
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function buildModeCopy(
  isZh: boolean,
): Record<
  AnalysisMode,
  {
    title: string
    subtitle: string
    examples: string[]
    outputs: string[]
  }
> {
  return {
    'single-option': {
      title: isZh ? '单资产尽调' : 'Single-asset diligence',
      subtitle: isZh
        ? '适合深挖某个稳定币、MMF 或 RWA 资产的风险、条款和执行路径。'
        : 'Best for a deeper review of one stablecoin, MMF, or RWA asset, including risk, terms, and execution path.',
      examples: isZh
        ? [
            '我有 10,000 USDT，是否应该把其中一部分放进白银 RWA？',
            'HashKey Chain 上的 MMF 风格 RWA 是否适合我做 30 天配置？',
            '我适不适合把稳定币从纯活期切换到更高收益的 RWA 产品？',
          ]
        : [
            'I have 10,000 USDT. Should I move part of it into a silver-backed RWA?',
            'Is the MMF-style RWA on HashKey Chain suitable for a 30-day allocation?',
            'Should I rotate idle stablecoins into a higher-yield RWA product?',
          ],
      outputs: isZh
        ? ['RiskVector', '持有期模拟', '证据面板', '执行草案']
        : ['RiskVector', 'Holding simulation', 'Evidence panel', 'Execution draft'],
    },
    'multi-option': {
      title: isZh ? '多资产配置' : 'Multi-asset allocation',
      subtitle: isZh
        ? '适合同时比较稳定币收益、MMF、贵金属和其他 RWA，给出组合建议。'
        : 'Best for comparing stablecoin carry, MMFs, precious metals, and other RWAs side by side with a portfolio recommendation.',
      examples: isZh
        ? [
            '我有 10,000 USDT，应该放稳定币收益、MMF、白银 RWA，还是保留更多现金？',
            '风险偏好中等、要高流动性的情况下，我在 HashKey Chain 上怎么配 RWA？',
            '如果我只能接受 T+3 退出，USDC、MMF 和白银 RWA 应该怎么组合？',
          ]
        : [
            'I have 10,000 USDT. Should I allocate to stablecoin carry, an MMF, silver RWA, or keep more cash idle?',
            'How should I build an RWA mix on HashKey Chain if I want medium risk and high liquidity?',
            'If I can only accept T+3 exits, how should I combine USDC, MMF, and silver RWA?',
          ],
      outputs: isZh
        ? ['对比矩阵', '收益分布', '建议权重', '链上存证草案']
        : ['Comparison matrix', 'Return distribution', 'Suggested weights', 'Onchain attestation draft'],
    },
  }
}

function buildRiskOptions(
  isZh: boolean,
): Array<{ value: RiskTolerance; label: string; detail: string }> {
  return [
    {
      value: 'conservative',
      label: isZh ? '保守' : 'Conservative',
      detail: isZh
        ? '优先保流动性和低回撤'
        : 'Prioritize liquidity preservation and lower drawdown',
    },
    {
      value: 'balanced',
      label: isZh ? '均衡' : 'Balanced',
      detail: isZh
        ? '兼顾收益、流动性和分散'
        : 'Balance carry, liquidity, and diversification',
    },
    {
      value: 'aggressive',
      label: isZh ? '进取' : 'Aggressive',
      detail: isZh
        ? '接受更高波动以换更高弹性'
        : 'Accept more volatility in exchange for higher upside',
    },
  ]
}

function buildLiquidityOptions(
  isZh: boolean,
): Array<{ value: LiquidityNeed; label: string; detail: string }> {
  return [
    {
      value: 'instant',
      label: 'T+0',
      detail: isZh ? '几乎随时可以退出' : 'Exit is available almost immediately',
    },
    {
      value: 't_plus_3',
      label: 'T+3',
      detail: isZh ? '接受少量赎回摩擦' : 'Small redemption friction is acceptable',
    },
    {
      value: 'locked',
      label: isZh ? '可锁定' : 'Lockup OK',
      detail: isZh ? '能接受更长持有期' : 'A longer hold or lockup is acceptable',
    },
  ]
}

function buildKycOptions(
  isZh: boolean,
): Array<{ value: number; label: string; detail: string }> {
  return [
    {
      value: 0,
      label: isZh ? '暂无 KYC' : 'No KYC yet',
      detail: isZh
        ? '仅考虑无门槛或低门槛资产'
        : 'Only consider low-friction or ungated assets',
    },
    {
      value: 1,
      label: isZh ? '基础 KYC' : 'Basic KYC',
      detail: isZh
        ? '可进入一部分受限产品'
        : 'Can access part of the gated product set',
    },
    {
      value: 2,
      label: isZh ? '更高等级' : 'Higher tier',
      detail: isZh
        ? '可评估专业投资者类产品'
        : 'Can evaluate professional-investor style products',
    },
  ]
}

export function ModeSelectionPage() {
  const navigate = useNavigate()
  const adapter = useApiAdapter()
  const { i18n } = useTranslation()
  const locale = useAppStore((state) => state.locale)
  const isZh = i18n.language.startsWith('zh')

  const text = useMemo(
    () => ({
      eyebrow: 'HashKey Chain / RWA',
      title: isZh ? 'RWA 配置决策引擎' : 'RWA Allocation Decision Engine',
      description: isZh
        ? '把自然语言问题和结构化约束一起交给后端，系统会输出 RiskVector、持有期模拟、证据面板、交易草案和链上存证草案。'
        : 'Combine a natural-language question with structured constraints and let the backend return RiskVector, holding simulations, an evidence panel, a tx draft, and an onchain attestation draft.',
      intakeBadge: isZh ? '第 1 页 / Intake' : 'Page 1 / Intake',
      intakeLead: isZh
        ? '先锁定资产、持有期、流动性和 KYC。'
        : 'Lock the asset set, holding period, liquidity, and KYC first.',
      intakeAnalysis: isZh
        ? '第 2 页会推进证据、计算和图表。'
        : 'Page 2 will orchestrate evidence, calculations, and charts.',
      intakeReport: isZh
        ? '第 3 页输出配置建议、执行草案和报告哈希。'
        : 'Page 3 will output allocation guidance, execution steps, and report hashes.',
      walletPanelTitle: isZh ? 'HashKey 钱包与链上 KYC' : 'HashKey Wallet and Onchain KYC',
      walletPanelDescription: isZh
        ? '连接钱包后，系统会读取当前网络和链上 KYC/SBT 状态，并用它决定哪些资产真实可投。'
        : 'Connect a wallet to read the active network and onchain KYC/SBT state, then use it to decide which assets are truly investable.',
      connectWallet: isZh ? '连接钱包' : 'Connect wallet',
      disconnectWallet: isZh ? '清除本地连接' : 'Clear local connection',
      switchTestnet: isZh ? '切到 Testnet' : 'Switch to Testnet',
      switchMainnet: isZh ? '切到 Mainnet' : 'Switch to Mainnet',
      walletUnavailable: isZh
        ? '未检测到浏览器钱包，请安装 MetaMask 或兼容钱包。'
        : 'No injected wallet was detected. Install MetaMask or a compatible wallet.',
      connectedAddress: isZh ? '当前地址' : 'Connected address',
      connectedNetwork: isZh ? '当前网络' : 'Connected network',
      onchainKyc: isZh ? '链上 KYC' : 'Onchain KYC',
      onchainKycHint: isZh
        ? '连接钱包时，链上 KYC 会覆盖手动选择。未连接时，仍可使用手动约束做离线评估。'
        : 'When a wallet is connected, the onchain KYC snapshot overrides manual selection. If no wallet is connected, manual constraints still support offline evaluation.',
      onchainDerived: isZh ? '链上读取' : 'Onchain derived',
      manualFallback: isZh ? '手动兜底' : 'Manual fallback',
      eligible: isZh ? '可投' : 'Eligible',
      gated: isZh ? '受限' : 'Gated',
      needsKyc: (level: number) =>
        isZh ? `需要至少 L${level}` : `Requires at least L${level}`,
      onchainBadge: isZh ? '链上验证' : 'Onchain verified',
      issuerBadge: isZh ? '发行方披露' : 'Issuer disclosed',
      sourceLabel: isZh ? '来源' : 'Source',
      mainnet: 'Mainnet',
      testnet: 'Testnet',
      planRegistry: 'Plan Registry',
      defaultExecutionNetwork: isZh ? '默认执行网络' : 'Default execution network',
      notConfigured: isZh ? '未配置' : 'Not configured',
      selectedLabel: isZh ? '当前已选' : 'Selected',
      selectedAssetCount: (count: number) =>
        isZh ? `${count} 个资产已选` : `${count} assets selected`,
      yourQuestion: isZh ? '你的问题' : 'Your question',
      questionPlaceholder: isZh
        ? '例如：我有 10,000 USDT，风险偏好中等，希望保持高流动性，应该怎么配？'
        : 'Example: I have 10,000 USDT, want balanced risk and high liquidity, and need to know how to allocate it.',
      exampleLabel: isZh ? '问题示例' : 'Question examples',
      principal: isZh ? '本金' : 'Principal',
      settlementCurrency: isZh ? '结算币种' : 'Settlement currency',
      holdingPeriod: isZh ? '持有期' : 'Holding period',
      daySuffix: isZh ? '天' : 'd',
      riskTolerance: isZh ? '风险偏好' : 'Risk tolerance',
      liquidityNeed: isZh ? '流动性约束' : 'Liquidity constraint',
      kycCapability: isZh ? 'KYC / 准入能力' : 'KYC / access capability',
      walletAddress: isZh ? '钱包地址' : 'Wallet address',
      attestation: isZh ? '报告存证' : 'Report attestation',
      attestationEnabled: isZh
        ? '启用链上存证草案'
        : 'Generate an onchain attestation draft',
      attestationDisabled: isZh ? '仅生成离线草案' : 'Generate an offline-only draft',
      attestationDetail: isZh
        ? '控制结果页是否生成 Plan Registry attestation 草案。'
        : 'Controls whether the result page includes a Plan Registry attestation draft.',
      additionalConstraints: isZh ? '补充约束（可选）' : 'Additional constraints (optional)',
      additionalConstraintsPlaceholder: isZh
        ? '例如：最多只拿 40% 做高摩擦资产；必须保留 T+0 备用金；更偏向有官方披露的产品。'
        : 'Example: no more than 40% in high-friction assets; keep a T+0 reserve; prefer officially disclosed products.',
      startAnalysis: isZh ? '开始 RWA 分析' : 'Start RWA analysis',
      createError: isZh
        ? '创建会话失败，请检查后端是否正常运行。'
        : 'Failed to create the session. Check whether the backend is running correctly.',
      assetLibrary: 'Asset Library',
      assetLibraryDescription: isZh
        ? '选择希望纳入分析的资产模板。资产越少，单资产尽调越深；资产越多，组合建议越明显。'
        : 'Choose the asset templates to include. Fewer assets deepen single-asset diligence; more assets make the allocation recommendation clearer.',
      assetSearchPlaceholder: isZh
        ? '搜索 USDC / MMF / Silver / Real Estate'
        : 'Search USDC / MMF / Silver / Real Estate',
      baseReturn: isZh ? '基准年化' : 'Base annualized',
      earliestExit: isZh ? '最短退出' : 'Earliest exit',
      kycShort: 'KYC',
      createLoaderTitle: isZh ? '正在创建 RWA 分析会话' : 'Creating the RWA analysis session',
      createLoaderDescription: isZh
        ? '系统会先固定你的资金约束、资产范围和持有期，再进入统一的分析界面，推进证据、计算和报告。'
        : 'The system will lock your funding constraints, asset scope, and holding period first, then enter the unified analysis workspace for evidence, calculations, and reporting.',
      createLoaderLabel: isZh
        ? '正在初始化 RWA 决策工作台，请稍候。'
        : 'Initializing the RWA decision workspace.',
      createLoaderStageLabel: isZh ? '初始化' : 'Initialization',
      createLoaderStageTitle: isZh ? '准备 RWA 分析上下文' : 'Preparing the RWA analysis context',
      createLoaderStageDescription: isZh
        ? '正在整理 HashKey Chain 资产模板、用户偏好和编排状态。'
        : 'Collecting HashKey Chain asset templates, user preferences, and orchestration state.',
      createLoaderTips: isZh
        ? [
            '先锁定资产集合与持有期，再讨论收益和结论。',
            'KYC 和流动性会直接影响可配资产范围。',
          ] as [string, string]
        : [
            'Lock the asset set and holding period before debating yield and conclusions.',
            'KYC and liquidity constraints directly change the investable universe.',
          ] as [string, string],
    }),
    [isZh],
  )

  const modeCopy = useMemo(() => buildModeCopy(isZh), [isZh])
  const riskOptions = useMemo(() => buildRiskOptions(isZh), [isZh])
  const liquidityOptions = useMemo(() => buildLiquidityOptions(isZh), [isZh])
  const kycOptions = useMemo(() => buildKycOptions(isZh), [isZh])

  const [selectedMode, setSelectedMode] = useState<AnalysisMode>('multi-option')
  const [problemStatement, setProblemStatement] = useState(
    buildModeCopy(i18n.language.startsWith('zh'))['multi-option'].examples[0],
  )
  const [intakeContext, setIntakeContext] =
    useState<RwaIntakeContext>(defaultIntakeContext)
  const [assetQuery, setAssetQuery] = useState('')

  const modesQuery = useQuery({
    queryKey: ['analysis', 'modes', locale],
    queryFn: adapter.modes.list,
  })

  const bootstrapQuery = useQuery({
    queryKey: ['rwa', 'bootstrap', locale],
    queryFn: adapter.rwa.getBootstrap,
  })
  const wallet = useHashKeyWallet(bootstrapQuery.data?.chainConfig)
  const walletKycSnapshot = wallet.kycSnapshot

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
  const sessionIntakeContext = useMemo<RwaIntakeContext>(
    () => ({
      ...intakeContext,
      walletAddress: wallet.walletAddress || intakeContext.walletAddress || '',
      walletNetwork: wallet.walletNetwork ?? '',
      walletKycLevelOnchain: walletKycSnapshot?.level,
      walletKycVerified: walletKycSnapshot?.isHuman,
      minimumKycLevel:
        wallet.walletAddress && walletKycSnapshot
          ? walletKycSnapshot.level
          : intakeContext.minimumKycLevel,
    }),
    [
      intakeContext,
      wallet.walletAddress,
      wallet.walletNetwork,
      walletKycSnapshot,
    ],
  )
  const effectiveKycLevel = useMemo(() => {
    if (!wallet.walletAddress) {
      return intakeContext.minimumKycLevel
    }
    if (walletKycSnapshot) {
      return walletKycSnapshot.isHuman ? walletKycSnapshot.level : 0
    }
    return intakeContext.minimumKycLevel
  }, [intakeContext.minimumKycLevel, wallet.walletAddress, walletKycSnapshot])

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
        eyebrow={text.eyebrow}
        title={text.createLoaderTitle}
        description={text.createLoaderDescription}
        loaderLabel={text.createLoaderLabel}
        stageLabel={text.createLoaderStageLabel}
        stageTitle={text.createLoaderStageTitle}
        stageDescription={text.createLoaderStageDescription}
        tips={text.createLoaderTips}
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={text.eyebrow}
        title={text.title}
        description={text.description}
      />

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-3 text-sm text-text-secondary">
          <Badge tone="gold">{text.intakeBadge}</Badge>
          <span>{text.intakeLead}</span>
          <span>{text.intakeAnalysis}</span>
          <span>{text.intakeReport}</span>
        </div>

        {bootstrapQuery.data ? (
          <div className="mt-4 grid gap-3 xl:grid-cols-4">
            <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
              <p className="text-xs text-text-muted">{text.mainnet}</p>
              <p className="mt-2 font-medium text-text-primary">
                {bootstrapQuery.data.chainConfig.mainnetChainId}
              </p>
            </div>
            <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
              <p className="text-xs text-text-muted">{text.testnet}</p>
              <p className="mt-2 font-medium text-text-primary">
                {bootstrapQuery.data.chainConfig.testnetChainId}
              </p>
            </div>
            <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
              <p className="text-xs text-text-muted">{text.defaultExecutionNetwork}</p>
              <p className="mt-2 font-medium text-text-primary">
                {bootstrapQuery.data.chainConfig.defaultExecutionNetwork}
              </p>
            </div>
            <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
              <p className="text-xs text-text-muted">{text.planRegistry}</p>
              <p className="mt-2 break-all text-sm text-text-primary">
                {bootstrapQuery.data.chainConfig.planRegistryAddress || text.notConfigured}
              </p>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="rounded-full border border-border-subtle bg-app-bg-elevated p-3 text-gold-primary">
                <WalletCards className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  {text.walletPanelTitle}
                </h2>
                <p className="text-sm leading-7 text-text-secondary">
                  {text.walletPanelDescription}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {wallet.isConnected ? (
              <Button
                variant="secondary"
                onClick={() => wallet.disconnectWallet()}
              >
                {text.disconnectWallet}
              </Button>
            ) : (
              <Button
                onClick={() => void wallet.connectWallet()}
                disabled={!wallet.hasProvider || wallet.isWalletBusy}
              >
                <Cable className="size-4" />
                {text.connectWallet}
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => void wallet.switchNetwork('testnet')}
              disabled={!wallet.hasProvider || wallet.isWalletBusy}
            >
              {text.switchTestnet}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void wallet.switchNetwork('mainnet')}
              disabled={!wallet.hasProvider || wallet.isWalletBusy}
            >
              {text.switchMainnet}
            </Button>
          </div>
        </div>

        {!wallet.hasProvider ? (
          <div className="rounded-[18px] border border-[rgba(197,109,99,0.35)] bg-[rgba(197,109,99,0.1)] px-4 py-3 text-sm text-[#f7d4cf]">
            {text.walletUnavailable}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
            <p className="text-xs text-text-muted">{text.connectedAddress}</p>
            <p className="mt-2 break-all text-sm text-text-primary">
              {wallet.walletAddress || text.notConfigured}
            </p>
          </div>
          <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
            <p className="text-xs text-text-muted">{text.connectedNetwork}</p>
            <p className="mt-2 font-medium text-text-primary">
              {wallet.networkLabel}
            </p>
          </div>
          <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
            <div className="flex items-center gap-2">
              <p className="text-xs text-text-muted">{text.onchainKyc}</p>
              <Badge tone={wallet.walletAddress ? 'gold' : 'neutral'}>
                {wallet.walletAddress ? text.onchainDerived : text.manualFallback}
              </Badge>
            </div>
            <p className="mt-2 font-medium text-text-primary">
              {wallet.kycLoading
                ? '...'
                : `L${wallet.kycSnapshot?.isHuman ? wallet.kycSnapshot.level : effectiveKycLevel}`}
            </p>
            <p className="mt-2 text-xs leading-6 text-text-muted">
              {wallet.kycSnapshot?.note || text.onchainKycHint}
            </p>
          </div>
        </div>
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
                    {text.selectedLabel}
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
            <Badge tone="neutral">
              {text.selectedAssetCount(intakeContext.preferredAssetIds.length)}
            </Badge>
          </div>

          <div className="space-y-2">
            <label htmlFor="problemStatement" className="text-sm text-text-secondary">
              {text.yourQuestion}
            </label>
            <Textarea
              id="problemStatement"
              value={problemStatement}
              onChange={(event) => setProblemStatement(event.target.value)}
              placeholder={text.questionPlaceholder}
              className="min-h-32 text-base"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs text-text-muted">{text.exampleLabel}</p>
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
              <label className="text-sm text-text-secondary">{text.principal}</label>
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
              <label className="text-sm text-text-secondary">
                {text.settlementCurrency}
              </label>
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
            <p className="text-sm text-text-secondary">{text.holdingPeriod}</p>
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
                    {days} {text.daySuffix}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-text-secondary">{text.riskTolerance}</p>
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
                    <p className="mt-2 text-xs leading-6 text-text-muted">
                      {option.detail}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-text-secondary">{text.liquidityNeed}</p>
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
                    <p className="mt-2 text-xs leading-6 text-text-muted">
                      {option.detail}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-text-secondary">{text.kycCapability}</p>
              <Badge tone={wallet.walletAddress ? 'gold' : 'neutral'}>
                {wallet.walletAddress ? text.onchainDerived : text.manualFallback}
              </Badge>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              {kycOptions.map((option) => {
                const isActive = effectiveKycLevel === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={Boolean(wallet.walletAddress)}
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
                    } ${wallet.walletAddress ? 'cursor-not-allowed opacity-70' : ''}`}
                  >
                    <p className="font-medium">{option.label}</p>
                    <p className="mt-2 text-xs leading-6 text-text-muted">
                      {option.detail}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm text-text-secondary">{text.walletAddress}</label>
              <Input
                value={sessionIntakeContext.walletAddress ?? ''}
                readOnly
                placeholder="0x..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-text-secondary">{text.attestation}</label>
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
                  {intakeContext.wantsOnchainAttestation
                    ? text.attestationEnabled
                    : text.attestationDisabled}
                </p>
                <p className="mt-2 text-xs leading-6 text-text-muted">
                  {text.attestationDetail}
                </p>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-text-secondary">
              {text.additionalConstraints}
            </label>
            <Textarea
              value={intakeContext.additionalConstraints ?? ''}
              onChange={(event) =>
                setIntakeContext((current) => ({
                  ...current,
                  additionalConstraints: event.target.value,
                }))
              }
              placeholder={text.additionalConstraintsPlaceholder}
              className="min-h-24"
            />
          </div>

          <Button
            onClick={() =>
              void createMutation.mutateAsync({
                mode: selectedMode,
                locale,
                problemStatement,
                intakeContext: sessionIntakeContext,
              })
            }
            disabled={
              !problemStatement.trim() ||
              intakeContext.preferredAssetIds.length === 0 ||
              createMutation.isPending
            }
          >
            <Sparkles className="size-4" />
            {text.startAnalysis}
            <ArrowRight className="size-4" />
          </Button>

          {createMutation.isError ? (
            <div className="rounded-2xl border border-[rgba(197,109,99,0.35)] bg-[rgba(197,109,99,0.12)] px-4 py-3 text-sm text-[#f7d4cf]">
              {text.createError}
            </div>
          ) : null}
        </Card>

        <div className="space-y-4">
          <Card className="space-y-4 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  {text.assetLibrary}
                </h2>
                <p className="text-sm leading-7 text-text-secondary">
                  {text.assetLibraryDescription}
                </p>
              </div>
              <Badge tone="gold">{filteredAssets.length}</Badge>
            </div>

            <Input
              value={assetQuery}
              onChange={(event) => setAssetQuery(event.target.value)}
              placeholder={text.assetSearchPlaceholder}
            />

            <div className="space-y-3">
              {filteredAssets.map((asset) => {
                const isSelected = intakeContext.preferredAssetIds.includes(asset.id)
                const requiredLevel = asset.requiresKycLevel ?? 0
                const isEligible = requiredLevel <= effectiveKycLevel
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
                          <Badge tone={asset.featured ? 'gold' : 'neutral'}>
                            {asset.assetType}
                          </Badge>
                          <Badge tone={isEligible ? 'success' : 'warning'}>
                            {isEligible ? text.eligible : text.needsKyc(requiredLevel)}
                          </Badge>
                          {asset.onchainVerified ? (
                            <Badge tone="neutral">{text.onchainBadge}</Badge>
                          ) : null}
                          {asset.issuerDisclosed ? (
                            <Badge tone="neutral">{text.issuerBadge}</Badge>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm leading-7 text-text-secondary">
                          {asset.description}
                        </p>
                      </div>
                      {isSelected ? (
                        <CheckCircle2 className="mt-1 size-5 text-gold-primary" />
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-2 md:grid-cols-3">
                      <div className="rounded-[16px] border border-border-subtle bg-app-bg px-3 py-2">
                        <p className="text-xs text-text-muted">{text.baseReturn}</p>
                        <p className="mt-1 font-medium text-text-primary">
                          {formatPercent(asset.expectedReturnBase)}
                        </p>
                      </div>
                      <div className="rounded-[16px] border border-border-subtle bg-app-bg px-3 py-2">
                        <p className="text-xs text-text-muted">{text.earliestExit}</p>
                        <p className="mt-1 font-medium text-text-primary">
                          {asset.redemptionDays === 0 ? 'T+0' : `T+${asset.redemptionDays}`}
                        </p>
                      </div>
                      <div className="rounded-[16px] border border-border-subtle bg-app-bg px-3 py-2">
                        <p className="text-xs text-text-muted">{text.kycShort}</p>
                        <p className="mt-1 font-medium text-text-primary">
                          {asset.requiresKycLevel ?? 0}
                        </p>
                      </div>
                    </div>

                    {asset.primarySourceUrl ? (
                      <p className="mt-3 text-xs text-text-muted">
                        {text.sourceLabel}: {asset.primarySourceUrl}
                      </p>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
