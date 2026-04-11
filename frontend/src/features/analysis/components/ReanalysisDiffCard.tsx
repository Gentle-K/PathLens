import { ArrowRightLeft } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { formatDateTime } from '@/lib/utils/format'
import type { LanguageCode, ReanalysisDiff } from '@/types'

interface ReanalysisDiffCardProps {
  diff?: ReanalysisDiff
  locale?: LanguageCode
}

export function ReanalysisDiffCard({
  diff,
  locale = 'en',
}: ReanalysisDiffCardProps) {
  const isZh = locale === 'zh'

  if (!diff) {
    return null
  }

  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ArrowRightLeft className="size-5 text-gold-primary" />
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              {isZh ? '再分析差异' : 'Re-analysis diff'}
            </h2>
            {diff.previousSnapshotAt ? (
              <p className="mt-1 text-sm text-text-secondary">
                {isZh ? '上次快照' : 'Previous snapshot'}: {formatDateTime(diff.previousSnapshotAt, locale)}
              </p>
            ) : null}
            {diff.currentGeneratedAt ? (
              <p className="mt-1 text-sm text-text-secondary">
                {isZh ? '当前结果' : 'Current result'}: {formatDateTime(diff.currentGeneratedAt, locale)}
              </p>
            ) : null}
          </div>
        </div>
        {diff.summary ? <Badge tone="gold">{diff.summary}</Badge> : null}
      </div>

      {diff.whyChanged.length ? (
        <div className="space-y-2">
          {diff.whyChanged.map((item) => (
            <p key={item} className="text-sm leading-7 text-text-secondary">
              {item}
            </p>
          ))}
        </div>
      ) : null}

      {diff.changedConstraints.length ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-text-primary">
            {isZh ? '约束变化' : 'Constraint changes'}
          </p>
          {diff.changedConstraints.map((item) => (
            <div key={`${item.label}-${item.before}-${item.after}`} className="rounded-lg border border-border-subtle bg-app-bg-elevated p-4">
              <p className="font-medium text-text-primary">{item.label}</p>
              <p className="mt-2 text-sm text-text-secondary">{item.before} {'->'} {item.after}</p>
              {item.detail ? <p className="mt-2 text-xs text-text-muted">{item.detail}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {diff.previousRecommendation.length || diff.currentRecommendation.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-border-subtle bg-app-bg-elevated p-4">
            <p className="text-sm font-medium text-text-primary">
              {isZh ? '上次推荐' : 'Previous recommendation'}
            </p>
            {diff.previousRecommendation.length ? (
              <ul className="mt-2 space-y-2 text-sm leading-7 text-text-secondary">
                {diff.previousRecommendation.map((item) => (
                  <li key={`previous-${item}`}>• {item}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-text-secondary">
                {isZh ? '无可比推荐。' : 'No comparable recommendation.'}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-border-subtle bg-app-bg-elevated p-4">
            <p className="text-sm font-medium text-text-primary">
              {isZh ? '当前推荐' : 'Current recommendation'}
            </p>
            {diff.currentRecommendation.length ? (
              <ul className="mt-2 space-y-2 text-sm leading-7 text-text-secondary">
                {diff.currentRecommendation.map((item) => (
                  <li key={`current-${item}`}>• {item}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-text-secondary">
                {isZh ? '当前没有推荐。' : 'There is no current recommendation.'}
              </p>
            )}
          </div>
        </div>
      ) : null}

      {diff.changedWeights.length ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-text-primary">
            {isZh ? '权重变化' : 'Weight changes'}
          </p>
          {diff.changedWeights.map((item) => (
            <div key={item.assetId} className="rounded-lg border border-border-subtle bg-app-bg-elevated p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-text-primary">{item.assetName}</p>
                <Badge tone={item.deltaWeightPct >= 0 ? 'success' : 'warning'}>
                  {item.deltaWeightPct >= 0 ? '+' : ''}
                  {item.deltaWeightPct.toFixed(1)}%
                </Badge>
              </div>
              <p className="mt-2 text-sm text-text-secondary">
                {item.beforeWeightPct.toFixed(1)}% {'->'} {item.afterWeightPct.toFixed(1)}%
              </p>
              {item.reason ? <p className="mt-2 text-xs text-text-muted">{item.reason}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {diff.changedRisk.length ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-text-primary">
            {isZh ? '风险变化' : 'Risk changes'}
          </p>
          {diff.changedRisk.map((item) => (
            <div key={`${item.assetId}-risk`} className="rounded-lg border border-border-subtle bg-app-bg-elevated p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-text-primary">{item.assetName}</p>
                <Badge tone={item.deltaOverall <= 0 ? 'success' : 'warning'}>
                  {item.deltaOverall >= 0 ? '+' : ''}
                  {item.deltaOverall.toFixed(1)}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-text-secondary">
                {item.beforeOverall.toFixed(1)} {'->'} {item.afterOverall.toFixed(1)}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {diff.changedEvidence.length ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-text-primary">
            {isZh ? '证据变化' : 'Evidence changes'}
          </p>
          {diff.changedEvidence.map((item) => {
            const improved =
              item.afterCoverageScore >= item.beforeCoverageScore &&
              item.afterConflictCount <= item.beforeConflictCount

            return (
              <div
                key={`${item.assetId ?? item.assetName ?? item.summary}-evidence`}
                className="rounded-lg border border-border-subtle bg-app-bg-elevated p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-text-primary">
                    {item.assetName || item.assetId || (isZh ? '证据' : 'Evidence')}
                  </p>
                  <Badge tone={improved ? 'success' : 'warning'}>
                    {Math.round(item.beforeCoverageScore * 100)}% {'->'} {Math.round(item.afterCoverageScore * 100)}%
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-text-secondary">{item.summary}</p>
                <p className="mt-2 text-xs text-text-muted">
                  {isZh ? '冲突数' : 'Conflicts'}: {item.beforeConflictCount} {'->'} {item.afterConflictCount}
                </p>
              </div>
            )
          })}
        </div>
      ) : null}
    </Card>
  )
}
