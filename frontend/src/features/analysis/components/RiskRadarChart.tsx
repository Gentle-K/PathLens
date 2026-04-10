import ReactEChartsCore from 'echarts-for-react'

interface RiskDimension {
  name: string
  value: number
}

interface AssetRadarData {
  assetName: string
  dimensions: RiskDimension[]
  color?: string
}

interface RiskRadarChartProps {
  assets: AssetRadarData[]
  maxValue?: number
  className?: string
}

const DEFAULT_COLORS = [
  '#f59e0b', // amber
  '#3b82f6', // blue
  '#10b981', // emerald
  '#ef4444', // red
  '#8b5cf6', // violet
]

export function RiskRadarChart({
  assets,
  maxValue = 100,
  className = '',
}: RiskRadarChartProps) {
  if (!assets.length) {
    return null
  }

  // Use the first asset's dimensions as the radar axis labels
  const indicators = assets[0].dimensions.map((d) => ({
    name: d.name,
    max: maxValue,
  }))

  const series = assets.map((asset, idx) => ({
    name: asset.assetName,
    value: asset.dimensions.map((d) => d.value),
    lineStyle: {
      color: asset.color ?? DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
      width: 2,
    },
    areaStyle: {
      color: asset.color ?? DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
      opacity: 0.12,
    },
    itemStyle: {
      color: asset.color ?? DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
    },
  }))

  const option = {
    backgroundColor: 'transparent',
    legend: {
      data: assets.map((a) => a.assetName),
      bottom: 0,
      textStyle: { color: '#a3a3a3', fontSize: 11 },
    },
    radar: {
      indicator: indicators,
      shape: 'polygon',
      splitNumber: 4,
      axisName: {
        color: '#a3a3a3',
        fontSize: 11,
      },
      splitLine: {
        lineStyle: { color: 'rgba(163,163,163,0.15)' },
      },
      splitArea: {
        show: false,
      },
      axisLine: {
        lineStyle: { color: 'rgba(163,163,163,0.2)' },
      },
    },
    series: [
      {
        type: 'radar',
        data: series,
        emphasis: {
          lineStyle: { width: 3 },
        },
      },
    ],
    tooltip: {
      trigger: 'item',
    },
  }

  return (
    <div className={className}>
      <ReactEChartsCore
        option={option}
        style={{ height: 360, width: '100%' }}
        notMerge
        lazyUpdate
      />
    </div>
  )
}

/**
 * Convert a backend RiskVector object into the format expected by RiskRadarChart.
 */
export function riskVectorToRadarData(
  assetName: string,
  riskVector: {
    market: number
    liquidity: number
    peg_redemption: number
    issuer_custody: number
    smart_contract: number
    oracle_dependency: number
    compliance_access: number
  },
  color?: string,
): AssetRadarData {
  return {
    assetName,
    color,
    dimensions: [
      { name: 'Market', value: riskVector.market },
      { name: 'Liquidity', value: riskVector.liquidity },
      { name: 'Peg/Redemption', value: riskVector.peg_redemption },
      { name: 'Issuer/Custody', value: riskVector.issuer_custody },
      { name: 'Smart Contract', value: riskVector.smart_contract },
      { name: 'Oracle', value: riskVector.oracle_dependency },
      { name: 'Compliance', value: riskVector.compliance_access },
    ],
  }
}
