import ReactEChartsCore from 'echarts-for-react/lib/core'
import { useTranslation } from 'react-i18next'

import { buildChartOption } from '@/components/charts/option-factories'
import { EmptyState } from '@/components/ui/empty-state'
import { Card } from '@/components/ui/card'
import { echarts } from '@/lib/charts/echarts'
import { useAppStore } from '@/lib/store/app-store'
import type { ChartArtifact } from '@/types'

interface ChartCardProps {
  chart: ChartArtifact
}

function chartHeight(chart: ChartArtifact) {
  const categoryCount = new Set(chart.compareSeries?.map((item) => item.label) ?? []).size
  const maxLabelLength = Math.max(
    0,
    ...(chart.compareSeries?.map((item) => item.label.length) ?? []),
    ...(chart.radarSeries?.flatMap((item) => item.values.map((value) => value.dimension.length)) ?? []),
  )

  if (chart.kind === 'bar') {
    return maxLabelLength > 18 || categoryCount > 4 ? 420 : 360
  }
  if (chart.kind === 'radar') {
    return chart.radarSeries && chart.radarSeries.length > 2 ? 420 : 380
  }
  if (chart.kind === 'pie') {
    return 360
  }
  return 320
}

export function ChartCard({ chart }: ChartCardProps) {
  const { i18n } = useTranslation()
  const resolvedTheme = useAppStore((state) => state.resolvedTheme)
  const option = buildChartOption(chart)
  const isZh = i18n.language.startsWith('zh')

  return (
    <Card className="overflow-hidden p-5" data-testid={`chart-card-${chart.id}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">{chart.title}</h3>
          {chart.subtitle ? <p className="text-sm text-text-secondary">{chart.subtitle}</p> : null}
        </div>
        {chart.unit ? <p className="mono text-xs text-gold-ink">{chart.unit}</p> : null}
      </div>

      {option ? (
        <ReactEChartsCore
          key={`${chart.id}-${resolvedTheme}`}
          echarts={echarts}
          option={option}
          style={{ height: chartHeight(chart), width: '100%' }}
          notMerge
          lazyUpdate
        />
      ) : (
        <EmptyState
          title={isZh ? '图表数据不足' : 'Insufficient chart data'}
          description={
            isZh
              ? '当前数据还不足以形成可靠图表，因此这里先保留为空状态。'
              : 'This visualization was intentionally withheld because the underlying dataset is incomplete.'
          }
        />
      )}

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-text-muted">
        {chart.source ? <span>{isZh ? '来源' : 'Source'}: {chart.source}</span> : null}
        {chart.note ? <span>{chart.note}</span> : null}
      </div>
    </Card>
  )
}
