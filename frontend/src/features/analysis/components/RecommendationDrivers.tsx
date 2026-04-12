import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { LanguageCode, RecommendationReason } from '@/types'

interface RecommendationDriversProps {
  reason?: RecommendationReason
  locale?: LanguageCode
}

export function RecommendationDrivers({
  reason,
  locale = 'en',
}: RecommendationDriversProps) {
  const isZh = locale === 'zh'

  if (!reason) {
    return null
  }

  return (
    <Card className="space-y-4 p-6" data-testid="recommendation-drivers">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          {isZh ? '为什么这样推荐？' : 'Why this recommendation?'}
        </h2>
        {reason.summary ? (
          <p className="mt-2 text-sm leading-7 text-text-secondary">{reason.summary}</p>
        ) : null}
      </div>

      {reason.topDrivers.length ? (
        <div className="space-y-3">
          {reason.topDrivers.map((driver) => (
            <div key={`${driver.title}-${driver.assetId ?? 'general'}`} className="rounded-lg border border-border-subtle bg-app-bg-elevated p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-text-primary">{driver.title}</p>
                <Badge tone={driver.impact === 'high' ? 'gold' : 'neutral'}>{driver.impact}</Badge>
              </div>
              <p className="mt-2 text-sm leading-7 text-text-secondary">{driver.detail}</p>
            </div>
          ))}
        </div>
      ) : null}

      {reason.constraintImpacts.length ? (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-text-primary">
            {isZh ? '影响最大的约束' : 'Highest-impact constraints'}
          </h3>
          {reason.constraintImpacts.map((impact) => (
            <div key={impact.constraintKey} className="rounded-lg border border-border-subtle bg-app-bg-elevated p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-text-primary">{impact.label}</p>
                <Badge tone={impact.impactLevel === 'high' ? 'warning' : 'neutral'}>{impact.impactLevel}</Badge>
              </div>
              <p className="mt-2 text-sm leading-7 text-text-secondary">{impact.detail}</p>
            </div>
          ))}
        </div>
      ) : null}

      {reason.excludedReasons.length ? (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-text-primary">
            {isZh ? '被排除的资产' : 'Excluded assets'}
          </h3>
          {reason.excludedReasons.map((item) => (
            <div key={item.assetId} className="rounded-lg border border-border-subtle bg-app-bg-elevated p-4">
              <p className="font-medium text-text-primary">{item.assetName}</p>
              <p className="mt-2 text-sm leading-7 text-text-secondary">{item.reason}</p>
            </div>
          ))}
        </div>
      ) : null}

      {reason.sensitivitySummary.length ? (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-text-primary">
            {isZh ? '敏感性变化' : 'Sensitivity shifts'}
          </h3>
          {reason.sensitivitySummary.map((item) => (
            <div key={item.scenarioKey} className="rounded-lg border border-border-subtle bg-app-bg-elevated p-4">
              <p className="font-medium text-text-primary">{item.label}</p>
              <p className="mt-2 text-sm leading-7 text-text-secondary">{item.impactSummary}</p>
              {item.changedAssets.length ? (
                <p className="mt-2 text-xs text-text-muted">
                  {item.changedAssets.join(', ')}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  )
}
