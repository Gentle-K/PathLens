import { useHashKeyWallet } from '@/lib/web3/use-hashkey-wallet'
import type { HashKeyChainConfig, WalletNetworkKey } from '@/types'

interface ConnectWalletButtonProps {
  chainConfig?: HashKeyChainConfig
  className?: string
}

export function ConnectWalletButton({
  chainConfig,
  className = '',
}: ConnectWalletButtonProps) {
  const {
    hasProvider,
    isConnected,
    isWalletBusy,
    walletLabel,
    networkLabel,
    walletNetwork,
    connectWallet,
    disconnectWallet,
    switchNetwork,
  } = useHashKeyWallet(chainConfig)

  if (!hasProvider) {
    return (
      <button
        disabled
        className={`inline-flex items-center gap-2 rounded-lg bg-neutral-800 px-4 py-2 text-sm text-neutral-500 opacity-60 ${className}`}
        title="No wallet provider detected"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-neutral-600" />
        No Wallet
      </button>
    )
  }

  if (isConnected) {
    return (
      <div className={`inline-flex items-center gap-2 ${className}`}>
        {/* Network badge */}
        <span
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
            walletNetwork
              ? 'bg-emerald-900/40 text-emerald-300'
              : 'bg-amber-900/40 text-amber-300'
          }`}
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              walletNetwork ? 'bg-emerald-400' : 'bg-amber-400'
            }`}
          />
          {networkLabel}
        </span>

        {/* Address */}
        <span className="rounded-md bg-neutral-800 px-2.5 py-1 font-mono text-xs text-neutral-300">
          {walletLabel}
        </span>

        {/* Network switch buttons */}
        {chainConfig && !walletNetwork && (
          <button
            onClick={() => switchNetwork('testnet' as WalletNetworkKey)}
            disabled={isWalletBusy}
            className="rounded-md bg-blue-900/40 px-2.5 py-1 text-xs text-blue-300 transition-colors hover:bg-blue-800/50 disabled:opacity-50"
          >
            Switch to HashKey
          </button>
        )}

        {/* Disconnect */}
        <button
          onClick={disconnectWallet}
          className="rounded-md bg-neutral-800 px-2.5 py-1 text-xs text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-neutral-200"
        >
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => connectWallet()}
      disabled={isWalletBusy}
      className={`inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:from-amber-500 hover:to-amber-400 disabled:opacity-50 ${className}`}
    >
      <span className="inline-block h-2 w-2 rounded-full bg-white/60" />
      {isWalletBusy ? 'Connecting…' : 'Connect Wallet'}
    </button>
  )
}
