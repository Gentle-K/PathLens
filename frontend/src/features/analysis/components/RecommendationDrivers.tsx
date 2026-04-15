import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { RecommendationReason } from '@/types'

interface RecommendationDriversProps {
  reason?: RecommendationReason
}

export function RecommendationDrivers({ reason }: RecommendationDriversProps) {
  const { t } = useTranslation()

  if (!reason) {
    return null
  }

  return (
    <Card className="space-y-4 p-6" data-testid="recommendation-drivers">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          {t('analysis.recommendationDrivers.title')}
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
                <Badge tone={driver.impact === 'high' ? 'gold' : 'neutral'}>
                  {t(`analysis.recommendationDrivers.impact.${driver.impact}`, driver.impact)}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-7 text-text-secondary">{driver.detail}</p>
            </div>
          ))}
        </div>
      ) : null}

      {reason.constraintImpacts.length ? (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-text-primary">
            {t('analysis.recommendationDrivers.highestImpactConstraints')}
          </h3>
          {reason.constraintImpacts.map((impact) => (
            <div key={impact.constraintKey} className="rounded-lg border border-border-subtle bg-app-bg-elevated p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-text-primary">{impact.label}</p>
                <Badge tone={impact.impactLevel === 'high' ? 'warning' : 'neutral'}>
                  {t(`analysis.recommendationDrivers.impact.${impact.impactLevel}`, impact.impactLevel)}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-7 text-text-secondary">{impact.detail}</p>
            </div>
          ))}
        </div>
      ) : null}

      {reason.excludedReasons.length ? (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-text-primary">
            {t('analysis.recommendationDrivers.excludedAssets')}
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
            {t('analysis.recommendationDrivers.sensitivityShifts')}
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
