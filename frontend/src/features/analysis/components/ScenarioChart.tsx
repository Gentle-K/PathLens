import ReactEChartsCore from 'echarts-for-react'

interface PathPoint {
  day: number
  p10Value: number
  p50Value: number
  p90Value: number
}

interface ScenarioChartProps {
  assetName: string
  path: PathPoint[]
  investmentAmount?: number
  currency?: string
  className?: string
}

export function ScenarioChart({
  assetName,
  path,
  investmentAmount,
  currency = 'USD',
  className = '',
}: ScenarioChartProps) {
  if (!path.length) {
    return null
  }

  const days = path.map((p) => `Day ${p.day}`)

  const option = {
    backgroundColor: 'transparent',
    title: {
      text: `${assetName} — Scenario Paths`,
      textStyle: { color: '#e5e5e5', fontSize: 14, fontWeight: 500 },
      left: 'center',
      top: 0,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(23,23,23,0.95)',
      borderColor: 'rgba(163,163,163,0.2)',
      textStyle: { color: '#e5e5e5', fontSize: 12 },
      formatter: (params: Array<{ seriesName: string; value: number; axisValue: string }>) => {
        const header = params[0]?.axisValue ?? ''
        const lines = params.map(
          (p) => `${p.seriesName}: ${currency}${p.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        )
        return `<strong>${header}</strong><br/>${lines.join('<br/>')}`
      },
    },
    legend: {
      data: ['P90 (optimistic)', 'P50 (base)', 'P10 (pessimistic)'],
      bottom: 0,
      textStyle: { color: '#a3a3a3', fontSize: 11 },
    },
    grid: {
      left: 60,
      right: 20,
      top: 40,
      bottom: 40,
    },
    xAxis: {
      type: 'category',
      data: days,
      axisLabel: { color: '#737373', fontSize: 11 },
      axisLine: { lineStyle: { color: 'rgba(163,163,163,0.2)' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#737373',
        fontSize: 11,
        formatter: (v: number) => `${currency}${v.toLocaleString()}`,
      },
      splitLine: { lineStyle: { color: 'rgba(163,163,163,0.1)' } },
    },
    series: [
      {
        name: 'P90 (optimistic)',
        type: 'line',
        data: path.map((p) => p.p90Value),
        smooth: true,
        lineStyle: { color: '#10b981', width: 2 },
        itemStyle: { color: '#10b981' },
        areaStyle: { color: 'rgba(16,185,129,0.06)' },
      },
      {
        name: 'P50 (base)',
        type: 'line',
        data: path.map((p) => p.p50Value),
        smooth: true,
        lineStyle: { color: '#f59e0b', width: 2.5 },
        itemStyle: { color: '#f59e0b' },
      },
      {
        name: 'P10 (pessimistic)',
        type: 'line',
        data: path.map((p) => p.p10Value),
        smooth: true,
        lineStyle: { color: '#ef4444', width: 2 },
        itemStyle: { color: '#ef4444' },
        areaStyle: { color: 'rgba(239,68,68,0.06)' },
      },
    ],
  }

  // Reference line for investment amount
  if (investmentAmount) {
    option.series.push({
      name: 'Investment',
      type: 'line',
      data: path.map(() => investmentAmount),
      smooth: false,
      lineStyle: { color: '#525252', width: 1, type: 'dashed' as const } as never,
      itemStyle: { color: '#525252' },
      symbol: 'none',
    } as never)
  }

  return (
    <div className={className}>
      <ReactEChartsCore
        option={option}
        style={{ height: 320, width: '100%' }}
        notMerge
        lazyUpdate
      />
    </div>
  )
}
