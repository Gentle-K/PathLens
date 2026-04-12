import { ExternalLink, FileText } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/utils/format'
import type { EvidenceGovernance, EvidenceItem, LanguageCode } from '@/types'

import { DataSourceBadge } from './data-source-badge'

interface EvidencePanelEnhancedProps {
  evidence: EvidenceItem[]
  governance?: EvidenceGovernance
  locale?: LanguageCode
}

export function EvidencePanelEnhanced({
  evidence,
  governance,
  locale = 'en',
}: EvidencePanelEnhancedProps) {
  const isZh = locale === 'zh'

  if (!evidence.length) {
    return null
  }

    return (
      <div id="evidence-panel-enhanced" className="space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-white/50" />
        <h3 className="text-sm font-semibold text-white/90">
          {isZh ? '证据面板' : 'Evidence Panel'}
        </h3>
        <span className="text-xs text-white/40">
          {evidence.length} {isZh ? '条' : 'items'}
        </span>
        </div>

        {governance ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={governance.overallScore >= 0.7 ? 'success' : governance.overallScore >= 0.5 ? 'warning' : 'danger'}>
                {(governance.overallScore * 100).toFixed(0)}%
              </Badge>
              <span className="text-sm text-white/75">
                {isZh ? '证据覆盖 / 可信度' : 'Evidence coverage / confidence'}
              </span>
            </div>
            {governance.weakEvidenceWarning ? (
              <p className="mt-3 text-sm leading-6 text-white/65">
                {governance.weakEvidenceWarning}
              </p>
            ) : null}
            {governance.coverage.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {governance.coverage.map((item) => (
                  <Badge key={item.assetId} tone={item.coverageScore >= 0.7 ? 'success' : item.coverageScore >= 0.5 ? 'warning' : 'danger'}>
                    {item.assetName || item.assetId}: {(item.coverageScore * 100).toFixed(0)}%
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

      <div className="space-y-3">
        {evidence.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-white/10 bg-white/5 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <h4 className="text-sm font-medium text-white/90">
                  {item.title}
                </h4>
                <p className="text-xs text-white/40">{item.sourceName}</p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {item.sourceTag ? (
                  <DataSourceBadge tag={item.sourceTag} locale={locale} />
                ) : null}
                {item.freshness ? (
                  <Badge tone={item.freshness.bucket === 'fresh' ? 'success' : item.freshness.bucket === 'aging' ? 'warning' : item.freshness.bucket === 'stale' ? 'danger' : 'neutral'}>
                    {item.freshness.label || item.freshness.bucket}
                  </Badge>
                ) : null}
                {item.factType ? (
                  <Badge tone={item.factType === 'onchain_verified_fact' ? 'success' : 'neutral'}>
                    {item.factType}
                  </Badge>
                ) : null}
                {item.conflictKeys?.length ? (
                  <Badge tone="danger">{isZh ? '存在冲突' : 'Conflict'}</Badge>
                ) : null}
                {item.sourceUrl ? (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/30 transition hover:text-white/70"
                    aria-label={isZh ? '打开来源链接' : 'Open source link'}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : null}
              </div>
            </div>

            <p className="mt-3 text-sm leading-6 text-white/65">{item.summary}</p>

            {item.extractedFacts.length ? (
              <ul className="mt-3 space-y-1">
                {item.extractedFacts.map((fact, index) => (
                  <li key={`${item.id}-fact-${index}`} className="text-xs text-white/50">
                    • {fact}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-white/35">
              <span>
                {isZh ? '置信度' : 'Confidence'}:{' '}
                {(item.confidence * 100).toFixed(0)}%
              </span>
              <span>
                {isZh ? '抓取时间' : 'Fetched at'}:{' '}
                {formatDateTime(item.fetchedAt, locale)}
              </span>
              <span>
                {isZh ? '来源类型' : 'Source type'}: {item.sourceType}
              </span>
              {item.freshness?.staleWarning ? (
                <span>{item.freshness.staleWarning}</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
