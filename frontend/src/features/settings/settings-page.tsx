import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Monitor, MoonStar, ShieldCheck, SunMedium, Wallet } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  PageContainer,
  PageHeader,
  PageSection,
} from '@/components/layout/page-header'
import {
  ErrorState,
  MetricCard,
  SectionCard,
} from '@/components/product/decision-ui'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/field'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import { useAppStore } from '@/lib/store/app-store'
import {
  getLocalStorageItem,
  setLocalStorageItem,
} from '@/lib/utils/safe-storage'
import { shortAddress } from '@/lib/web3/hashkey'
import type { LanguageCode, SettingsPayload, ThemeMode } from '@/types'

const RISK_KEY = 'ga-risk-default'
const RETENTION_KEY = 'ga-data-retention'
const CURRENCY_KEY = 'ga-preferred-currency'
const NETWORK_KEY = 'ga-preferred-network'
const CHART_UNIT_KEY = 'ga-preferred-chart-unit'
const EXPORT_KEY = 'ga-export-preference'

const legacyRiskMap: Record<string, string> = {
  Conservative: 'conservative',
  Balanced: 'balanced',
  Aggressive: 'aggressive',
}
const legacyNetworkMap: Record<string, string> = {
  'HashKey Chain': 'hashkey',
  'Ethereum-compatible': 'evm',
  'General analysis': 'general',
}
const legacyChartUnitMap: Record<string, string> = {
  'Native units': 'native',
  'USD converted': 'usd',
  'Percent / basis points': 'percent',
}
const legacyExportMap: Record<string, string> = {
  'Manual export': 'manual',
  'Auto PDF after completion': 'autoPdf',
}
const legacyRetentionMap: Record<string, string> = {
  '30 days': '30',
  '90 days': '90',
  '365 days': '365',
}

function normalizeStoredValue(
  value: string | null,
  fallback: string,
  mapping?: Record<string, string>,
) {
  if (!value) {
    return fallback
  }
  return mapping?.[value] ?? value
}

function themeIcon(mode: ThemeMode) {
  if (mode === 'light') {
    return <SunMedium className="size-4" />
  }
  if (mode === 'dark') {
    return <MoonStar className="size-4" />
  }
  return <Monitor className="size-4" />
}

export function SettingsPage() {
  const { t } = useTranslation()
  const adapter = useApiAdapter()
  const queryClient = useQueryClient()
  const syncFromSettings = useAppStore((state) => state.syncFromSettings)
  const themeMode = useAppStore((state) => state.themeMode)
  const walletAddress = useAppStore((state) => state.walletAddress)
  const locale = useAppStore((state) => state.locale)
  const [riskDefault, setRiskDefault] = useState(() =>
    normalizeStoredValue(getLocalStorageItem(RISK_KEY), 'balanced', legacyRiskMap),
  )
  const [dataRetention, setDataRetention] = useState(() =>
    normalizeStoredValue(getLocalStorageItem(RETENTION_KEY), '90', legacyRetentionMap),
  )
  const [preferredCurrency, setPreferredCurrency] = useState(() =>
    normalizeStoredValue(getLocalStorageItem(CURRENCY_KEY), 'USD'),
  )
  const [preferredNetwork, setPreferredNetwork] = useState(() =>
    normalizeStoredValue(getLocalStorageItem(NETWORK_KEY), 'hashkey', legacyNetworkMap),
  )
  const [chartUnit, setChartUnit] = useState(() =>
    normalizeStoredValue(getLocalStorageItem(CHART_UNIT_KEY), 'native', legacyChartUnitMap),
  )
  const [exportPreference, setExportPreference] = useState(() =>
    normalizeStoredValue(getLocalStorageItem(EXPORT_KEY), 'manual', legacyExportMap),
  )
  const hydratedFromServerRef = useRef(false)

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: adapter.settings.get,
  })
  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: adapter.profile.get,
  })

  const saveLocalPreferences = (
    nextRisk = riskDefault,
    nextRetention = dataRetention,
    nextCurrency = preferredCurrency,
    nextNetwork = preferredNetwork,
    nextChartUnit = chartUnit,
    nextExportPreference = exportPreference,
  ) => {
    setLocalStorageItem(RISK_KEY, nextRisk)
    setLocalStorageItem(RETENTION_KEY, nextRetention)
    setLocalStorageItem(CURRENCY_KEY, nextCurrency)
    setLocalStorageItem(NETWORK_KEY, nextNetwork)
    setLocalStorageItem(CHART_UNIT_KEY, nextChartUnit)
    setLocalStorageItem(EXPORT_KEY, nextExportPreference)
  }

  const updateMutation = useMutation({
    mutationFn: adapter.settings.update,
    onMutate: async (nextSettings: SettingsPayload) => {
      await queryClient.cancelQueries({ queryKey: ['settings'] })
      const previousSettings = queryClient.getQueryData<SettingsPayload>(['settings'])
      queryClient.setQueryData<SettingsPayload>(['settings'], nextSettings)
      syncFromSettings(nextSettings)
      return { previousSettings }
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(['settings'], settings)
      syncFromSettings(settings)
      toast.success(t('settings.saved'))
    },
    onError: (_error, _nextSettings, context) => {
      if (context?.previousSettings) {
        queryClient.setQueryData(['settings'], context.previousSettings)
        syncFromSettings(context.previousSettings)
      }
      toast.error(t('common.retry'))
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })
  const deleteMutation = useMutation({
    mutationFn: adapter.auth.deletePersonalData,
    onSuccess: (result) => {
      toast.success(t('settings.deleteSuccess', { count: result.deletedSessionCount }))
    },
  })

  const currentSettings = settingsQuery.data
  const profile = profileQuery.data

  useLayoutEffect(() => {
    if (currentSettings && !hydratedFromServerRef.current) {
      hydratedFromServerRef.current = true
      syncFromSettings(currentSettings)
    }
  }, [currentSettings, syncFromSettings])

  const localeOptions = useMemo(
    () =>
      [
        { value: 'en', label: t('common.languages.en') },
        { value: 'zh-CN', label: t('common.languages.zhCn') },
        { value: 'zh-HK', label: t('common.languages.zhHk') },
      ] satisfies Array<{ value: LanguageCode; label: string }>,
    [t],
  )

  const applyServerSettings = (patch: Partial<SettingsPayload>) => {
    const cachedSettings = queryClient.getQueryData<SettingsPayload>(['settings']) ?? currentSettings
    if (!cachedSettings) {
      return
    }
    updateMutation.mutate({
      ...cachedSettings,
      ...patch,
    })
  }

  if (settingsQuery.isError || profileQuery.isError) {
    return (
      <ErrorState
        title={t('settings.title')}
        description={
          (settingsQuery.error as Error | undefined)?.message ??
          (profileQuery.error as Error | undefined)?.message ??
          t('common.retry')
        }
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void settingsQuery.refetch()
              void profileQuery.refetch()
            }}
          >
            {t('common.retry')}
          </Button>
        }
      />
    )
  }

  if (!currentSettings || !profile) {
    return (
      <Card className="space-y-4 p-6">
        <p className="text-base font-semibold text-text-primary">{t('common.loading')}</p>
        <p className="text-sm text-text-secondary">{t('settings.description')}</p>
      </Card>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow={t('settings.eyebrow')}
        title={t('settings.title')}
        description={t('settings.description')}
      />

      <PageSection className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title={t('settings.groups.appearance')}
          value={localeOptions.find((item) => item.value === locale)?.label ?? locale}
          detail={t('settings.groupDescriptions.appearance')}
          tone="brand"
        />
        <MetricCard
          title={t('settings.groups.defaults')}
          value={t(`settings.options.risk.${riskDefault}`)}
          detail={t('settings.groupDescriptions.defaults')}
          tone="success"
        />
        <MetricCard
          title={t('settings.groups.notifications')}
          value={t(`settings.options.export.${exportPreference}`)}
          detail={t('settings.groupDescriptions.notifications')}
          tone="warning"
        />
        <MetricCard
          title={t('settings.groups.account')}
          value={walletAddress ? t('settings.notificationsEnabled') : t('settings.notificationsDisabled')}
          detail={walletAddress ? shortAddress(walletAddress) : t('actions.disconnectWallet')}
          tone="brand"
        />
      </PageSection>

      <PageSection className="space-y-6">
        <SectionCard
          title={t('settings.groups.appearance')}
          description={t('settings.groupDescriptions.appearance')}
        >
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-text-primary">
                {t('settings.fields.language')}
              </label>
              <Select
                value={locale}
                onChange={(event) =>
                  void applyServerSettings({ language: event.target.value as LanguageCode })
                }
              >
                {localeOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-text-primary">
                {t('settings.fields.theme')}
              </label>
              <div className="grid gap-2 sm:grid-cols-3">
                {(['system', 'dark', 'light'] as const).map((optionThemeMode) => {
                  const active = themeMode === optionThemeMode
                  return (
                    <button
                      key={optionThemeMode}
                      type="button"
                      aria-pressed={active}
                      className={
                        active
                          ? 'flex items-center justify-center gap-2 rounded-[18px] border border-primary bg-primary-soft px-4 py-3 text-sm font-semibold text-text-primary'
                          : 'flex items-center justify-center gap-2 rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3 text-sm text-text-secondary hover:border-border-strong hover:text-text-primary'
                      }
                      onClick={() => void applyServerSettings({ themeMode: optionThemeMode })}
                    >
                      {themeIcon(optionThemeMode)}
                      {t(`common.themes.${optionThemeMode}`)}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title={t('settings.groups.defaults')}
          description={t('settings.groupDescriptions.defaults')}
        >
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-text-primary">{t('settings.fields.risk')}</label>
              <Select
                value={riskDefault}
                onChange={(event) => {
                  const next = event.target.value
                  setRiskDefault(next)
                  saveLocalPreferences(next)
                }}
              >
                <option value="conservative">{t('settings.options.risk.conservative')}</option>
                <option value="balanced">{t('settings.options.risk.balanced')}</option>
                <option value="aggressive">{t('settings.options.risk.aggressive')}</option>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-text-primary">{t('settings.fields.currency')}</label>
              <Select
                value={preferredCurrency}
                onChange={(event) => {
                  const next = event.target.value
                  setPreferredCurrency(next)
                  saveLocalPreferences(riskDefault, dataRetention, next)
                }}
              >
                <option value="USD">{t('settings.options.currency.usd')}</option>
                <option value="USDC">{t('settings.options.currency.usdc')}</option>
                <option value="USDT">{t('settings.options.currency.usdt')}</option>
                <option value="HKD">{t('settings.options.currency.hkd')}</option>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-text-primary">{t('settings.fields.network')}</label>
              <Select
                value={preferredNetwork}
                onChange={(event) => {
                  const next = event.target.value
                  setPreferredNetwork(next)
                  saveLocalPreferences(riskDefault, dataRetention, preferredCurrency, next)
                }}
              >
                <option value="hashkey">{t('settings.options.network.hashkey')}</option>
                <option value="evm">{t('settings.options.network.evm')}</option>
                <option value="general">{t('settings.options.network.general')}</option>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-text-primary">{t('settings.fields.chartUnit')}</label>
              <Select
                value={chartUnit}
                onChange={(event) => {
                  const next = event.target.value
                  setChartUnit(next)
                  saveLocalPreferences(riskDefault, dataRetention, preferredCurrency, preferredNetwork, next)
                }}
              >
                <option value="native">{t('settings.options.chartUnit.native')}</option>
                <option value="usd">{t('settings.options.chartUnit.usd')}</option>
                <option value="percent">{t('settings.options.chartUnit.percent')}</option>
              </Select>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title={t('settings.groups.notifications')}
          description={t('settings.groupDescriptions.notifications')}
        >
          <div className="grid gap-4 xl:grid-cols-2">
            <Button
              variant={currentSettings.notificationsEmail ? 'primary' : 'secondary'}
              onClick={() =>
                void applyServerSettings({
                  notificationsEmail: !currentSettings.notificationsEmail,
                })
              }
            >
              {t('settings.fields.emailNotifications')} ·{' '}
              {currentSettings.notificationsEmail
                ? t('settings.notificationsEnabled')
                : t('settings.notificationsDisabled')}
            </Button>
            <Button
              variant={currentSettings.notificationsPush ? 'primary' : 'secondary'}
              onClick={() =>
                void applyServerSettings({
                  notificationsPush: !currentSettings.notificationsPush,
                })
              }
            >
              {t('settings.fields.pushNotifications')} ·{' '}
              {currentSettings.notificationsPush
                ? t('settings.notificationsEnabled')
                : t('settings.notificationsDisabled')}
            </Button>
            <div className="space-y-2 xl:col-span-2">
              <label className="text-sm font-semibold text-text-primary">
                {t('settings.fields.exportPreference')}
              </label>
              <Select
                value={exportPreference}
                onChange={(event) => {
                  const next = event.target.value
                  setExportPreference(next)
                  saveLocalPreferences(
                    riskDefault,
                    dataRetention,
                    preferredCurrency,
                    preferredNetwork,
                    chartUnit,
                    next,
                  )
                  void applyServerSettings({
                    autoExportPdf: next === 'autoPdf',
                  })
                }}
              >
                <option value="manual">{t('settings.options.export.manual')}</option>
                <option value="autoPdf">{t('settings.options.export.autoPdf')}</option>
              </Select>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title={t('settings.groups.account')}
          description={t('settings.groupDescriptions.account')}
        >
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-text-primary">{t('settings.fields.name')}</label>
                <Input value={profile.name} readOnly />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-text-primary">{t('settings.fields.email')}</label>
                <Input value={profile.email} readOnly />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-text-primary">{t('settings.fields.timezone')}</label>
                <Input value={profile.timezone} readOnly />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-text-primary">{t('settings.fields.bio')}</label>
                <Input value={profile.bio} readOnly />
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[24px] border border-border-subtle bg-app-bg-elevated p-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary">
                    {walletAddress ? <Wallet className="size-5" /> : <ShieldCheck className="size-5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary">
                      {walletAddress ? shortAddress(walletAddress) : t('actions.disconnectWallet')}
                    </p>
                    <p className="text-sm text-text-secondary">
                      {walletAddress
                        ? t('actions.disconnectWallet')
                        : t('settings.groupDescriptions.account')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-text-primary">{t('settings.fields.retention')}</label>
                <Select
                  value={dataRetention}
                  onChange={(event) => {
                    const next = event.target.value
                    setDataRetention(next)
                    saveLocalPreferences(riskDefault, next)
                  }}
                >
                  <option value="30">{t('settings.options.retention.days30')}</option>
                  <option value="90">{t('settings.options.retention.days90')}</option>
                  <option value="365">{t('settings.options.retention.days365')}</option>
                </Select>
              </div>

              <div className="rounded-[24px] border border-border-subtle bg-app-bg-elevated p-4">
                <p className="text-sm font-semibold text-text-primary">{t('settings.deleteData')}</p>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  {t('settings.deleteDescription')}
                </p>
                <Button
                  className="mt-4 w-full"
                  variant="danger"
                  disabled={deleteMutation.isPending}
                  onClick={() => void deleteMutation.mutateAsync()}
                >
                  {deleteMutation.isPending ? t('settings.deletingData') : t('settings.deleteData')}
                </Button>
              </div>
            </div>
          </div>
        </SectionCard>
      </PageSection>
    </PageContainer>
  )
}
