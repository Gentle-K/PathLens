import { Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { ComparisonMatrix as ComparisonMatrixData } from '@/types'

interface ComparisonMatrixProps {
  matrix?: ComparisonMatrixData
}

function badgeTone(tone: string) {
  switch (tone) {
    case 'success':
      return 'success' as const
    case 'gold':
      return 'gold' as const
    case 'warning':
      return 'warning' as const
    case 'danger':
      return 'danger' as const
    default:
      return 'neutral' as const
  }
}

export function ComparisonMatrix({ matrix }: ComparisonMatrixProps) {
  const { t } = useTranslation()

  if (!matrix?.rows?.length || !matrix.metrics.length) {
    return null
  }

  return (
    <Card className="space-y-4 p-6" data-testid="comparison-matrix">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{matrix.title}</h2>
          {matrix.notes?.length ? (
            <p className="mt-2 text-sm leading-7 text-text-secondary">
              {matrix.notes[0]}
            </p>
          ) : null}
        </div>
        <Badge tone="neutral">{matrix.rows.length}</Badge>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[980px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left align-bottom">
              <th className="sticky left-0 z-10 bg-app-panel px-3 py-3 text-xs font-medium uppercase tracking-[0.08em] text-text-muted">
                {t('analysis.comparisonMatrix.asset')}
              </th>
              {matrix.metrics.map((metric) => (
                <th
                  key={metric.key}
                  className="px-3 py-3 text-xs font-medium uppercase tracking-[0.08em] text-text-muted"
                >
                  <div className="flex items-center gap-1">
                    <span>{metric.label}</span>
                    {metric.description ? (
                      <span title={metric.description}>
                        <Info className="size-3.5 text-text-muted" />
                      </span>
                    ) : null}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.assetId} className="border-b border-border-subtle align-top">
                <td className="sticky left-0 z-10 min-w-56 bg-app-panel px-3 py-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-text-primary">{row.assetName}</p>
                      <Badge tone="neutral">{row.assetSymbol}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(row.statuses ?? []).map((status) => (
                        <Badge key={`${row.assetId}-${status}`} tone={status === 'demo' ? 'warning' : status === 'verified' ? 'success' : 'neutral'}>
                          {t(`analysis.comparisonMatrix.statuses.${status}`, status)}
                        </Badge>
                      ))}
                      {!row.defaultRankEligible ? (
                        <Badge tone="warning">
                          {t('analysis.comparisonMatrix.defaultExcluded')}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </td>
                {row.cells.map((cell) => (
                  <td key={`${row.assetId}-${cell.metricKey}`} className="min-w-40 px-3 py-4">
                    <div
                      className="rounded-lg border border-border-subtle bg-app-bg-elevated p-3"
                      title={cell.tooltip}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-text-primary">{cell.displayValue}</p>
                        <div className="flex flex-wrap gap-1">
                          {(cell.badges ?? []).slice(0, 2).map((badge) => (
                            <Badge key={`${row.assetId}-${cell.metricKey}-${badge}`} tone={badgeTone(cell.tone)}>
                              {badge}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      {cell.rationale ? (
                        <p className="mt-2 text-xs leading-6 text-text-muted">
                          {cell.rationale}
                        </p>
                      ) : null}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {matrix.notes?.length > 1 ? (
        <div className="space-y-2">
          {matrix.notes.slice(1).map((note) => (
            <p key={note} className="text-xs leading-6 text-text-muted">
              {note}
            </p>
          ))}
        </div>
      ) : null}
    </Card>
  )
}
