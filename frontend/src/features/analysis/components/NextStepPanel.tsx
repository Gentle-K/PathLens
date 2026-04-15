import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { ActionIntent } from '@/types'

interface NextStepPanelProps {
  intents?: ActionIntent[]
}

export function NextStepPanel({ intents = [] }: NextStepPanelProps) {
  const { t } = useTranslation()

  if (!intents.length) {
    return null
  }

  return (
    <Card className="space-y-4 p-6" data-testid="next-step-panel">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          {t('analysis.nextStepPanel.title')}
        </h2>
        <p className="mt-2 text-sm leading-7 text-text-secondary">
          {t('analysis.nextStepPanel.description')}
        </p>
      </div>

      <div className="space-y-3">
        {intents.map((intent) => (
          <div key={intent.assetId} className="rounded-lg border border-border-subtle bg-app-bg-elevated p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-medium text-text-primary">{intent.assetName}</p>
              <div className="flex flex-wrap gap-2">
                <Badge tone={intent.actionReadiness === 'ready' ? 'success' : intent.actionReadiness === 'partial' ? 'warning' : 'danger'}>
                  {t(`analysis.nextStepPanel.readiness.${intent.actionReadiness}`, intent.actionReadiness)}
                </Badge>
                <Badge tone="neutral">
                  {t(`analysis.nextStepPanel.actionType.${intent.actionType}`, intent.actionType)}
                </Badge>
              </div>
            </div>
            {intent.summary ? (
              <p className="mt-2 text-sm leading-7 text-text-secondary">{intent.summary}</p>
            ) : null}

            {intent.actionBlockers.length ? (
              <div className="mt-3 space-y-2">
                {intent.actionBlockers.map((blocker) => (
                  <div key={`${intent.assetId}-${blocker.code}`} className="rounded-lg border border-border-subtle bg-app-bg px-3 py-2 text-sm text-text-secondary">
                    <span className="font-medium text-text-primary">{blocker.label}</span>
                    <span className="ml-2">{blocker.detail}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {intent.checklist.length ? (
              <ul className="mt-3 space-y-2 text-sm leading-7 text-text-secondary">
                {intent.checklist.map((item) => (
                  <li key={`${intent.assetId}-${item}`}>- {item}</li>
                ))}
              </ul>
            ) : null}

            {intent.actionLinks.length ? (
              <div className="mt-3 flex flex-wrap gap-3">
                {intent.actionLinks.map((link) => (
                  <a
                    key={`${intent.assetId}-${link.kind}-${link.url}`}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-gold-ink underline-offset-4 hover:underline"
                  >
                    <ExternalLink className="size-3.5" />
                    {link.label}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  )
}
