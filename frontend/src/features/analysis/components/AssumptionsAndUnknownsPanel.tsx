import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { LanguageCode } from '@/types'

interface AssumptionsAndUnknownsPanelProps {
  assumptions?: string[]
  unknowns?: string[]
  warnings?: string[]
  locale?: LanguageCode
}

export function AssumptionsAndUnknownsPanel({
  assumptions = [],
  unknowns = [],
  warnings = [],
  locale = 'en',
}: AssumptionsAndUnknownsPanelProps) {
  const isZh = locale === 'zh'

  if (!assumptions.length && !unknowns.length && !warnings.length) {
    return null
  }

  return (
    <Card className="space-y-4 p-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          {isZh ? '假设、未知项与提醒' : 'Assumptions, unknowns, and warnings'}
        </h2>
      </div>

      {assumptions.length ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-text-primary">{isZh ? '假设' : 'Assumptions'}</p>
            <Badge tone="neutral">{assumptions.length}</Badge>
          </div>
          {assumptions.map((item) => (
            <div key={item} className="rounded-lg border border-border-subtle bg-app-bg-elevated p-4 text-sm leading-7 text-text-secondary">
              {item}
            </div>
          ))}
        </div>
      ) : null}

      {unknowns.length ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-text-primary">{isZh ? '未知项' : 'Unknowns'}</p>
            <Badge tone="warning">{unknowns.length}</Badge>
          </div>
          {unknowns.map((item) => (
            <div key={item} className="rounded-lg border border-border-subtle bg-app-bg-elevated p-4 text-sm leading-7 text-text-secondary">
              {item}
            </div>
          ))}
        </div>
      ) : null}

      {warnings.length ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-text-primary">{isZh ? '提醒' : 'Warnings'}</p>
            <Badge tone="danger">{warnings.length}</Badge>
          </div>
          {warnings.map((item) => (
            <div key={item} className="rounded-lg border border-[rgba(197,109,99,0.28)] bg-[rgba(197,109,99,0.1)] p-4 text-sm leading-7 text-[#f7d4cf]">
              {item}
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  )
}
