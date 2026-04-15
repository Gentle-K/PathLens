import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { useTranslation } from 'react-i18next'
import type { DemoScenarioDefinition } from '@/types'

interface DemoScenarioSelectorProps {
  scenarios?: DemoScenarioDefinition[]
  selectedScenarioId?: string
  onSelect: (scenario: DemoScenarioDefinition | null) => void
}

export function DemoScenarioSelector({
  scenarios = [],
  selectedScenarioId = '',
  onSelect,
}: DemoScenarioSelectorProps) {
  const { t } = useTranslation()

  if (!scenarios.length) {
    return null
  }

  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            {t('analysis.demoScenarioSelector.title')}
          </h2>
          <p className="mt-2 text-sm leading-7 text-text-secondary">
            {t('analysis.demoScenarioSelector.description')}
          </p>
        </div>
        {selectedScenarioId ? (
          <Badge tone="gold">{t('analysis.demoScenarioSelector.enabled')}</Badge>
        ) : null}
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        {scenarios.map((scenario) => {
          const isActive = scenario.scenarioId === selectedScenarioId
          return (
            <button
              key={scenario.scenarioId}
              type="button"
              onClick={() => onSelect(isActive ? null : scenario)}
              className={`rounded-lg border p-4 text-left ${
                isActive
                  ? 'border-border-strong bg-[rgba(212,175,55,0.12)]'
                  : 'border-border-subtle bg-app-bg-elevated'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-text-primary">{scenario.title}</p>
                <Badge tone={isActive ? 'gold' : 'neutral'}>
                  {scenario.demoLabel}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-7 text-text-secondary">{scenario.description}</p>
              <p className="mt-3 text-xs text-text-muted">
                {scenario.featuredAssetIds.join(', ')}
              </p>
            </button>
          )
        })}
      </div>
    </Card>
  )
}
