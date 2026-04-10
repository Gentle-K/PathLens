interface AssetRow {
  assetName: string
  assetType: string
  expectedReturn: string
  holdingReturn: string
  exitSpeed: string
  totalCostBps: number
  kycLevel: number
  overallRisk: number
}

interface ComparisonMatrixProps {
  assets: AssetRow[]
  title?: string
  className?: string
}

export function ComparisonMatrix({
  assets,
  title = 'RWA Comparison Matrix',
  className = '',
}: ComparisonMatrixProps) {
  if (!assets.length) {
    return null
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      {title && (
        <h3 className="mb-3 text-sm font-semibold text-neutral-200">
          {title}
        </h3>
      )}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-700/50 text-left text-xs uppercase tracking-wider text-neutral-500">
            <th className="px-3 py-2">Asset</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2 text-right">Expected Return</th>
            <th className="px-3 py-2 text-right">Holding Return</th>
            <th className="px-3 py-2 text-center">Exit</th>
            <th className="px-3 py-2 text-right">Cost (bps)</th>
            <th className="px-3 py-2 text-center">KYC</th>
            <th className="px-3 py-2 text-right">Risk</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset, idx) => (
            <tr
              key={idx}
              className="border-b border-neutral-800/50 transition-colors hover:bg-neutral-800/30"
            >
              <td className="px-3 py-2.5 font-medium text-neutral-200">
                {asset.assetName}
              </td>
              <td className="px-3 py-2.5">
                <span className="rounded-md bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                  {asset.assetType}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-neutral-300">
                {asset.expectedReturn}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-neutral-300">
                {asset.holdingReturn}
              </td>
              <td className="px-3 py-2.5 text-center text-neutral-400">
                {asset.exitSpeed}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-neutral-400">
                {asset.totalCostBps}
              </td>
              <td className="px-3 py-2.5 text-center">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    asset.kycLevel === 0
                      ? 'bg-emerald-900/30 text-emerald-400'
                      : 'bg-amber-900/30 text-amber-400'
                  }`}
                >
                  L{asset.kycLevel}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right">
                <span
                  className={`font-mono text-sm ${
                    asset.overallRisk < 30
                      ? 'text-emerald-400'
                      : asset.overallRisk < 55
                        ? 'text-amber-400'
                        : 'text-red-400'
                  }`}
                >
                  {asset.overallRisk.toFixed(1)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
