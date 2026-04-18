import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { ErrorState } from '@/components/product/decision-ui'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select, Textarea } from '@/components/ui/field'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import { StocksWorkbenchShell } from '@/features/stocks/workbench-shell'
import { useStocksCopy } from '@/features/stocks/copy'
import { getStocksErrorMessage, useStocksMode } from '@/features/stocks/lib'

function boolToString(value: boolean) {
  return value ? 'true' : 'false'
}

export function StocksSettingsPage() {
  const adapter = useApiAdapter()
  const copy = useStocksCopy()
  const queryClient = useQueryClient()
  const bootstrapQuery = useQuery({
    queryKey: ['stocks', 'bootstrap'],
    queryFn: adapter.stocks.getBootstrap,
  })
  const { mode, setMode } = useStocksMode(bootstrapQuery.data?.settings.defaultMode ?? 'paper')
  const [whitelist, setWhitelist] = useState('')
  const [defaultMode, setDefaultMode] = useState<'paper' | 'live'>('paper')
  const [notificationsEnabled, setNotificationsEnabled] = useState('true')
  const [singleCap, setSingleCap] = useState('10')
  const [grossCap, setGrossCap] = useState('35')
  const [dailyLoss, setDailyLoss] = useState('3')
  const [maxPositions, setMaxPositions] = useState('4')
  const [maxEntries, setMaxEntries] = useState('1')
  const [tradingWindow, setTradingWindow] = useState('09:35-15:45')
  const [extendedHours, setExtendedHours] = useState('false')
  const [marketableLimit, setMarketableLimit] = useState('true')

  useEffect(() => {
    if (!bootstrapQuery.data) {
      return
    }

    const { settings } = bootstrapQuery.data
    setWhitelist(settings.whitelist.join(', '))
    setDefaultMode(settings.defaultMode)
    setNotificationsEnabled(boolToString(settings.notificationsEnabled))
    setSingleCap(String(Math.round(settings.riskLimits.singlePositionCapPct * 100)))
    setGrossCap(String(Math.round(settings.riskLimits.grossExposureCapPct * 100)))
    setDailyLoss(String(Math.round(settings.riskLimits.dailyLossStopPct * 100)))
    setMaxPositions(String(settings.riskLimits.maxOpenPositions))
    setMaxEntries(String(settings.riskLimits.maxNewEntriesPerSymbolPerDay))
    setTradingWindow(settings.riskLimits.tradingWindowEt)
    setExtendedHours(boolToString(settings.riskLimits.allowExtendedHours))
    setMarketableLimit(boolToString(settings.riskLimits.useMarketableLimitOrders))
  }, [bootstrapQuery.data])

  const saveMutation = useMutation({
    mutationFn: () =>
      adapter.stocks.updateSettings({
        whitelist: whitelist
          .split(',')
          .map((item) => item.trim().toUpperCase())
          .filter(Boolean),
        defaultMode,
        notificationsEnabled: notificationsEnabled === 'true',
        riskLimits: {
          singlePositionCapPct: Number(singleCap || '0') / 100,
          grossExposureCapPct: Number(grossCap || '0') / 100,
          dailyLossStopPct: Number(dailyLoss || '0') / 100,
          maxOpenPositions: Number(maxPositions || '0'),
          maxNewEntriesPerSymbolPerDay: Number(maxEntries || '0'),
          tradingWindowEt: tradingWindow.trim(),
          allowExtendedHours: extendedHours === 'true',
          useMarketableLimitOrders: marketableLimit === 'true',
        },
      }),
    onSuccess: async () => {
      toast.success(copy.messages.settingsSaved)
      await queryClient.invalidateQueries({ queryKey: ['stocks'] })
    },
    onError: (error) => {
      toast.error(getStocksErrorMessage(error, copy.actions.retry))
    },
  })

  if (bootstrapQuery.isError) {
    return (
      <ErrorState
        title={copy.pages.settings.title}
        description={getStocksErrorMessage(bootstrapQuery.error, copy.actions.retry)}
        action={
          <Button variant="secondary" onClick={() => void bootstrapQuery.refetch()}>
            {copy.actions.retry}
          </Button>
        }
      />
    )
  }

  return (
    <StocksWorkbenchShell
      title={copy.pages.settings.title}
      description={copy.pages.settings.description}
      mode={mode}
      onModeChange={setMode}
      bootstrap={bootstrapQuery.data}
      actions={
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {copy.actions.save}
        </Button>
      }
    >
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.85fr)]">
        <div className="space-y-5">
          <Card className="space-y-4 p-6">
            <p className="text-lg font-semibold text-text-primary">{copy.sections.guardrails}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={copy.fields.defaultMode}>
                <Select value={defaultMode} onChange={(event) => setDefaultMode(event.target.value as 'paper' | 'live')}>
                  <option value="paper">{copy.shell.mode.paper}</option>
                  <option value="live">{copy.shell.mode.live}</option>
                </Select>
              </Field>
              <Field label={copy.fields.notifications}>
                <Select value={notificationsEnabled} onChange={(event) => setNotificationsEnabled(event.target.value)}>
                  <option value="true">{copy.values.enabled}</option>
                  <option value="false">{copy.values.disabled}</option>
                </Select>
              </Field>
              <Field label={copy.fields.singleCap}>
                <Input value={singleCap} onChange={(event) => setSingleCap(event.target.value)} />
              </Field>
              <Field label={copy.fields.grossCap}>
                <Input value={grossCap} onChange={(event) => setGrossCap(event.target.value)} />
              </Field>
              <Field label={copy.fields.dailyLoss}>
                <Input value={dailyLoss} onChange={(event) => setDailyLoss(event.target.value)} />
              </Field>
              <Field label={copy.fields.maxPositions}>
                <Input value={maxPositions} onChange={(event) => setMaxPositions(event.target.value)} />
              </Field>
              <Field label={copy.fields.maxEntries}>
                <Input value={maxEntries} onChange={(event) => setMaxEntries(event.target.value)} />
              </Field>
              <Field label={copy.fields.tradingWindow}>
                <Input
                  value={tradingWindow}
                  onChange={(event) => setTradingWindow(event.target.value)}
                />
              </Field>
              <Field label={copy.fields.extendedHours}>
                <Select value={extendedHours} onChange={(event) => setExtendedHours(event.target.value)}>
                  <option value="false">{copy.values.no}</option>
                  <option value="true">{copy.values.yes}</option>
                </Select>
              </Field>
              <Field label={copy.fields.marketableLimit}>
                <Select value={marketableLimit} onChange={(event) => setMarketableLimit(event.target.value)}>
                  <option value="true">{copy.values.yes}</option>
                  <option value="false">{copy.values.no}</option>
                </Select>
              </Field>
            </div>
          </Card>

          <Card className="space-y-4 p-6">
            <p className="text-lg font-semibold text-text-primary">{copy.fields.whitelist}</p>
            <Textarea value={whitelist} onChange={(event) => setWhitelist(event.target.value)} />
            <p className="text-sm text-text-secondary">{copy.messages.whitelistHint}</p>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="space-y-4 p-6">
            <p className="text-lg font-semibold text-text-primary">{copy.sections.providerReadiness}</p>
            {(bootstrapQuery.data?.providerStatuses ?? []).map((provider) => (
              <div key={`${provider.provider}-${provider.mode ?? 'shared'}`} className="rounded-[20px] bg-app-bg-elevated p-4">
                <p className="text-sm font-semibold text-text-primary">
                  {provider.provider}
                  {provider.mode ? ` · ${provider.mode}` : ''}
                </p>
                <p className="mt-1 text-sm text-text-secondary">{provider.detail}</p>
              </div>
            ))}
          </Card>

          <Card className="space-y-4 p-6">
            <p className="text-lg font-semibold text-text-primary">{copy.sections.promotionGate}</p>
            {(bootstrapQuery.data?.promotionGate.blockers ?? []).length ? (
              <div className="space-y-2">
                {(bootstrapQuery.data?.promotionGate.blockers ?? []).map((blocker) => (
                  <p key={blocker} className="text-sm text-text-secondary">
                    {blocker}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-secondary">{copy.messages.paperOnly}</p>
            )}
          </Card>
        </div>
      </section>
    </StocksWorkbenchShell>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium text-text-primary">{label}</span>
      {children}
    </label>
  )
}
