import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { DemoScenarioDefinition, LanguageCode } from '@/types'

interface DemoScenarioSelectorProps {
  scenarios?: DemoScenarioDefinition[]
  selectedScenarioId?: string
  locale?: LanguageCode
  onSelect: (scenario: DemoScenarioDefinition | null) => void
}

export function DemoScenarioSelector({
  scenarios = [],
  selectedScenarioId = '',
  locale = 'en',
  onSelect,
}: DemoScenarioSelectorProps) {
  const isZh = locale === 'zh'

  if (!scenarios.length) {
    return null
  }

  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            {isZh ? '官方 Demo 场景' : 'Official demo scenarios'}
          </h2>
          <p className="mt-2 text-sm leading-7 text-text-secondary">
            {isZh
              ? '一键填充问题、约束、资产池和随机种子。Demo 资产池固定，适合现场评审。'
              : 'One click fills the prompt, constraints, asset universe, and seed. The demo universe stays fixed for judging.'}
          </p>
        </div>
        {selectedScenarioId ? <Badge tone="gold">{isZh ? 'Demo 已启用' : 'Demo enabled'}</Badge> : null}
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
