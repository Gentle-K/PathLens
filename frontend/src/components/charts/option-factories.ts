import type { EChartsOption } from 'echarts'

import { graphic } from '@/lib/charts/echarts'
import type { ChartArtifact, ChartSeriesDatum } from '@/types'

interface ChartPalette {
  appBg: string
  panel: string
  borderStrong: string
  axisLine: string
  textPrimary: string
  textSecondary: string
  gridLine: string
  goldPrimary: string
  goldBright: string
}

interface AxisTooltipDatum {
  axisValueLabel?: string
  seriesName?: string
  value?: unknown
}

function readCssVar(name: string, fallback: string) {
  if (typeof window === 'undefined') {
    return fallback
  }

  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function normalizeTooltipParams(params: unknown): AxisTooltipDatum[] {
  if (!Array.isArray(params)) {
    return typeof params === 'object' && params !== null ? [params as AxisTooltipDatum] : []
  }
  return params.filter((item): item is AxisTooltipDatum => typeof item === 'object' && item !== null)
}

function getPalette(): ChartPalette {
  return {
    appBg: readCssVar('--app-bg', '#08080A'),
    panel: readCssVar('--panel', '#121215'),
    borderStrong: readCssVar('--border-strong', 'rgba(249, 228, 159, 0.28)'),
    axisLine: readCssVar('--border-subtle', 'rgba(255,255,255,0.08)'),
    textPrimary: readCssVar('--text-primary', '#FBFBFC'),
    textSecondary: readCssVar('--text-secondary', 'rgba(251, 251, 252, 0.72)'),
    gridLine: readCssVar('--grid-line', 'rgba(255, 255, 255, 0.05)'),
    goldPrimary: readCssVar('--gold-primary', '#D4AF37'),
    goldBright: readCssVar('--gold-bright', '#F9E49F'),
  }
}

function createGoldGradient() {
  return new graphic.LinearGradient(0, 0, 1, 1, [
    { offset: 0, color: '#F9E49F' },
    { offset: 0.5, color: '#D4AF37' },
    { offset: 1, color: '#8A7338' },
  ])
}

function createSharedOption(palette: ChartPalette): EChartsOption {
  return {
    animationDuration: 500,
    animationEasing: 'cubicOut',
    grid: {
      top: 56,
      right: 24,
      bottom: 36,
      left: 44,
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        lineStyle: {
          color: palette.borderStrong,
          width: 1,
        },
      },
      backgroundColor: palette.panel,
      borderColor: palette.borderStrong,
      borderWidth: 1,
      textStyle: {
        color: palette.textPrimary,
        fontSize: 12,
      },
    },
  }
}

function truncateLabel(value: string, limit = 18) {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value
}

function axisLabelStyle(palette: ChartPalette) {
  return {
    color: palette.textSecondary,
    fontFamily: 'JetBrains Mono',
  }
}

function buildLineOption(chart: ChartArtifact, palette: ChartPalette): EChartsOption {
  const points = chart.lineSeries ?? []
  const goldGradient = createGoldGradient()

  return {
    ...createSharedOption(palette),
    xAxis: {
      type: 'category',
      data: points.map((point) => point.label),
      axisLabel: axisLabelStyle(palette),
      axisLine: { lineStyle: { color: palette.axisLine } },
      splitLine: {
        show: true,
        lineStyle: { color: palette.gridLine },
      },
    },
    yAxis: {
      type: 'value',
      axisLabel: axisLabelStyle(palette),
      axisLine: { lineStyle: { color: palette.axisLine } },
      splitLine: {
        show: true,
        lineStyle: { color: palette.gridLine },
      },
    },
    series: [
      {
        type: 'line',
        smooth: true,
        symbolSize: 9,
        showSymbol: true,
        lineStyle: {
          width: 3,
          color: goldGradient,
          shadowBlur: 14,
          shadowColor: 'rgba(212,175,55,0.45)',
        },
        itemStyle: {
          color: palette.goldBright,
          borderColor: palette.panel,
          borderWidth: 2,
        },
        areaStyle: {
          color: new graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(212, 175, 55, 0.22)' },
            { offset: 1, color: 'rgba(212, 175, 55, 0.03)' },
          ]),
        },
        data: points.map((point) => point.value),
      },
    ],
  }
}

function buildBarOption(chart: ChartArtifact, palette: ChartPalette): EChartsOption {
  const seriesData = chart.compareSeries ?? []
  const categories = Array.from(new Set(seriesData.map((item) => item.label)))
  const groups = Array.from(new Set(seriesData.map((item) => item.group ?? 'Value')))
  const goldGradient = createGoldGradient()
  const rotateLabels = categories.some((category) => category.length > 14)

  return {
    ...createSharedOption(palette),
    grid: {
      top: 72,
      right: 24,
      bottom: rotateLabels ? 86 : 58,
      left: 54,
      containLabel: true,
    },
    legend: {
      top: 8,
      right: 0,
      textStyle: {
        color: palette.textSecondary,
      },
    },
    xAxis: {
      type: 'category',
      data: categories,
      axisLabel: {
        ...axisLabelStyle(palette),
        interval: 0,
        rotate: rotateLabels ? 24 : 0,
        formatter: (value: string) => truncateLabel(value),
      },
      axisLine: { lineStyle: { color: palette.axisLine } },
      splitLine: {
        show: true,
        lineStyle: { color: palette.gridLine },
      },
    },
    yAxis: {
      type: 'value',
      axisLabel: axisLabelStyle(palette),
      axisLine: { lineStyle: { color: palette.axisLine } },
      splitLine: {
        show: true,
        lineStyle: { color: palette.gridLine },
      },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow',
      },
      backgroundColor: palette.panel,
      borderColor: palette.borderStrong,
      formatter: (params: unknown) => {
        const items = normalizeTooltipParams(params)
        const title = items[0]?.axisValueLabel ?? ''
        const lines = items.map((item) => `${item.seriesName ?? 'Value'}: ${item.value ?? '-'}`)
        return [title, ...lines].join('<br/>')
      },
    },
    series: groups.map((group, index) => ({
      type: 'bar',
      name: group,
      barMaxWidth: 28,
      itemStyle: {
        borderRadius: [12, 12, 4, 4],
        color: index === 0 ? goldGradient : 'rgba(249, 228, 159, 0.35)',
        shadowBlur: 16,
        shadowColor: 'rgba(212,175,55,0.24)',
      },
      data: categories.map((category) => {
        const datum = seriesData.find((item) => item.label === category && (item.group ?? 'Value') === group)
        return datum?.value ?? 0
      }),
    })),
  }
}

function buildScatterOption(chart: ChartArtifact, palette: ChartPalette): EChartsOption {
  const points = chart.scatterSeries ?? []

  return {
    ...createSharedOption(palette),
    xAxis: {
      type: 'value',
      axisLabel: axisLabelStyle(palette),
      axisLine: { lineStyle: { color: palette.axisLine } },
      splitLine: { lineStyle: { color: palette.gridLine } },
    },
    yAxis: {
      type: 'value',
      axisLabel: axisLabelStyle(palette),
      axisLine: { lineStyle: { color: palette.axisLine } },
      splitLine: { lineStyle: { color: palette.gridLine } },
    },
    series: [
      {
        type: 'scatter',
        symbolSize: (value: number[]) => Math.max(14, value[2] * 14),
        data: points.map((point) => [
          Number(point.group ?? 0),
          point.value,
          point.intensity ?? 0.6,
          point.label,
        ]),
        itemStyle: {
          color: 'rgba(249, 228, 159, 0.82)',
          shadowBlur: 26,
          shadowColor: 'rgba(212,175,55,0.48)',
        },
      },
    ],
    tooltip: {
      trigger: 'item',
      backgroundColor: palette.panel,
      borderColor: palette.borderStrong,
      formatter: (params) => {
        const payload = params as unknown as { data: [number, number, number, string] }
        return `${payload.data[3]}<br/>X: ${payload.data[0]}<br/>Y: ${payload.data[1]}`
      },
    },
  }
}

function buildRadarOption(chart: ChartArtifact, palette: ChartPalette): EChartsOption {
  const radarSeries = chart.radarSeries ?? []
  const dimensions = radarSeries[0]?.values.map((item) => item.dimension) ?? []

  return {
    ...createSharedOption(palette),
    legend: {
      top: 0,
      right: 0,
      type: radarSeries.length > 2 ? 'scroll' : 'plain',
      textStyle: {
        color: palette.textSecondary,
      },
    },
    radar: {
      center: ['50%', '56%'],
      radius: '62%',
      indicator: dimensions.map((dimension) => ({ name: dimension, max: 10 })),
      splitLine: { lineStyle: { color: palette.gridLine } },
      splitArea: { areaStyle: { color: ['rgba(255,255,255,0.02)', 'rgba(255,255,255,0.01)'] } },
      axisName: {
        color: palette.textSecondary,
        formatter: (value?: string) => truncateLabel(value ?? '', 16),
      },
    },
    series: [
      {
        type: 'radar',
        data: radarSeries.map((item, index) => ({
          name: item.name,
          value: item.values.map((value) => value.value),
          lineStyle: {
            color: index === 0 ? palette.goldBright : palette.goldPrimary,
            width: 2,
          },
          itemStyle: {
            color: index === 0 ? palette.goldBright : palette.goldPrimary,
          },
          areaStyle: {
            color: index === 0 ? 'rgba(249,228,159,0.14)' : 'rgba(212,175,55,0.08)',
          },
        })),
      },
    ],
  }
}

function buildHeatmapOption(chart: ChartArtifact, palette: ChartPalette): EChartsOption {
  const points = chart.heatmapSeries ?? []
  const xs = Array.from(new Set(points.map((point) => point.x)))
  const ys = Array.from(new Set(points.map((point) => point.y)))

  return {
    ...createSharedOption(palette),
    tooltip: {
      position: 'top',
      backgroundColor: palette.panel,
      borderColor: palette.borderStrong,
      textStyle: {
        color: palette.textPrimary,
      },
    },
    xAxis: {
      type: 'category',
      data: xs,
      axisLabel: axisLabelStyle(palette),
      axisLine: { lineStyle: { color: palette.axisLine } },
    },
    yAxis: {
      type: 'category',
      data: ys,
      axisLabel: axisLabelStyle(palette),
      axisLine: { lineStyle: { color: palette.axisLine } },
    },
    visualMap: {
      min: 0,
      max: 10,
      calculable: false,
      textStyle: { color: palette.textSecondary },
      inRange: {
        color: ['rgba(61,52,31,0.35)', '#8A7338', '#D4AF37', '#F9E49F'],
      },
    },
    series: [
      {
        type: 'heatmap',
        data: points.map((point) => [xs.indexOf(point.x), ys.indexOf(point.y), point.value]),
        label: { show: true, color: palette.appBg },
        emphasis: {
          itemStyle: {
            shadowBlur: 18,
            shadowColor: 'rgba(212,175,55,0.35)',
          },
        },
      },
    ],
  }
}

function buildPieOption(chart: ChartArtifact, palette: ChartPalette): EChartsOption {
  const slices = (chart.compareSeries ?? chart.lineSeries ?? []).map((item, index) => ({
    name: item.label,
    value: item.value,
    itemStyle: {
      color:
        index === 0
          ? '#F9E49F'
          : index === 1
            ? '#D4AF37'
            : index === 2
              ? '#8A7338'
              : 'rgba(249, 228, 159, 0.42)',
      borderColor: palette.panel,
      borderWidth: 2,
      shadowBlur: 18,
      shadowColor: 'rgba(212,175,55,0.22)',
    },
  }))

  return {
    ...createSharedOption(palette),
    tooltip: {
      trigger: 'item',
      backgroundColor: palette.panel,
      borderColor: palette.borderStrong,
      borderWidth: 1,
      textStyle: {
        color: palette.textPrimary,
        fontSize: 12,
      },
    },
    legend: {
      bottom: 0,
      type: 'scroll',
      textStyle: {
        color: palette.textSecondary,
      },
    },
    series: [
      {
        type: 'pie',
        radius: ['44%', '72%'],
        center: ['50%', '48%'],
        label: {
          color: palette.textSecondary,
          formatter: '{b}\n{d}%',
        },
        labelLine: {
          lineStyle: {
            color: palette.gridLine,
          },
        },
        data: slices,
      },
    ],
  }
}

function hasData(chart: ChartArtifact) {
  return Boolean(
    chart.lineSeries?.length ||
      chart.compareSeries?.length ||
      chart.scatterSeries?.length ||
      chart.radarSeries?.length ||
      chart.heatmapSeries?.length,
  )
}

export function buildChartOption(chart: ChartArtifact) {
  if (!hasData(chart)) {
    return undefined
  }

  const palette = getPalette()

  switch (chart.kind) {
    case 'line':
      return buildLineOption(chart, palette)
    case 'bar':
      return buildBarOption(chart, palette)
    case 'scatter':
      return buildScatterOption(chart, palette)
    case 'radar':
      return buildRadarOption(chart, palette)
    case 'heatmap':
      return buildHeatmapOption(chart, palette)
    case 'pie':
      return buildPieOption(chart, palette)
    default:
      return buildLineOption(
        {
          ...chart,
          lineSeries: chart.lineSeries ?? [],
        },
        palette,
      )
  }
}

export function serializeChartRows(chart: ChartArtifact) {
  const series = (chart.lineSeries ??
    chart.compareSeries ??
    chart.scatterSeries ??
    chart.heatmapSeries ??
    []) as Array<ChartSeriesDatum | { x: string; y: string; value: number }>

  return series.map((row) => Object.values(row).join(' | '))
}
