import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'

import { useAppStore } from '@/lib/store/app-store'
import type {
  HashKeyChainConfig,
  WalletKycSnapshot,
  WalletNetworkKey,
} from '@/types'

import {
  connectInjectedWallet,
  getInjectedProvider,
  getNetworkLabel,
  readInjectedWalletState,
  readMarketSnapshots,
  readWalletKyc,
  resolveWalletNetwork,
  shortAddress,
  switchWalletNetwork,
  writePlanAttestation,
} from '@/lib/web3/hashkey'

export function useHashKeyWallet(chainConfig?: HashKeyChainConfig) {
  const walletAddress = useAppStore((state) => state.walletAddress)
  const walletChainId = useAppStore((state) => state.walletChainId)
  const setWalletState = useAppStore((state) => state.setWalletState)
  const clearWalletState = useAppStore((state) => state.clearWalletState)
  const locale = useAppStore((state) => state.locale)

  const walletNetwork = useMemo(
    () => resolveWalletNetwork(chainConfig, walletChainId),
    [chainConfig, walletChainId],
  )
  const hasProvider = Boolean(getInjectedProvider())
  const isZh = locale === 'zh'

  useEffect(() => {
    const provider = getInjectedProvider()
    if (!provider) {
      clearWalletState()
      return
    }

    let active = true

    const syncWalletState = async () => {
      try {
        const nextState = await readInjectedWalletState()
        if (!active) {
          return
        }

        if (!nextState.address) {
          clearWalletState()
          return
        }

        setWalletState({
          walletAddress: nextState.address,
          walletChainId: nextState.chainId,
        })
      } catch {
        if (active) {
          clearWalletState()
        }
      }
    }

    void syncWalletState()

    const handleWalletChange = () => {
      void syncWalletState()
    }

    provider.on?.('accountsChanged', handleWalletChange)
    provider.on?.('chainChanged', handleWalletChange)

    return () => {
      active = false
      provider.removeListener?.('accountsChanged', handleWalletChange)
      provider.removeListener?.('chainChanged', handleWalletChange)
    }
  }, [clearWalletState, setWalletState])

  const connectMutation = useMutation({
    mutationFn: connectInjectedWallet,
    onSuccess: (nextState) => {
      setWalletState({
        walletAddress: nextState.address,
        walletChainId: nextState.chainId,
      })
    },
  })

  const switchMutation = useMutation({
    mutationFn: (network: WalletNetworkKey) => {
      if (!chainConfig) {
        throw new Error('Chain config is not loaded yet.')
      }
      return switchWalletNetwork(chainConfig, network)
    },
    onSuccess: async () => {
      try {
        const nextState = await readInjectedWalletState()
        if (!nextState.address) {
          clearWalletState()
          return
        }
        setWalletState({
          walletAddress: nextState.address,
          walletChainId: nextState.chainId,
        })
      } catch {
        clearWalletState()
      }
    },
  })

  const kycQuery = useQuery<WalletKycSnapshot>({
    queryKey: ['wallet', 'kyc', walletAddress, walletNetwork],
    queryFn: () => {
      if (!chainConfig || !walletAddress || !walletNetwork) {
        throw new Error('Wallet KYC query requires a connected wallet on HashKey.')
      }
      return readWalletKyc(chainConfig, walletAddress, walletNetwork)
    },
    enabled: Boolean(chainConfig && walletAddress && walletNetwork),
    staleTime: 30_000,
  })

  return {
    hasProvider,
    walletAddress,
    walletChainId,
    walletNetwork,
    walletLabel: shortAddress(walletAddress),
    networkLabel: getNetworkLabel(walletNetwork, isZh),
    isConnected: Boolean(walletAddress),
    isWalletBusy: connectMutation.isPending || switchMutation.isPending,
    connectWallet: connectMutation.mutateAsync,
    switchNetwork: switchMutation.mutateAsync,
    disconnectWallet: clearWalletState,
    kycSnapshot: kycQuery.data,
    kycError: kycQuery.error,
    kycLoading: kycQuery.isPending || kycQuery.isFetching,
  }
}

export function useLiveMarketSnapshots(
  chainConfig?: HashKeyChainConfig,
  preferredNetwork?: WalletNetworkKey | null,
) {
  const defaultNetwork =
    preferredNetwork ??
    (chainConfig?.defaultExecutionNetwork === 'mainnet' ? 'mainnet' : 'testnet')

  return useQuery({
    queryKey: ['hashkey', 'market-snapshots', defaultNetwork],
    queryFn: () => {
      if (!chainConfig) {
        throw new Error('Chain config is not loaded yet.')
      }
      return readMarketSnapshots(chainConfig, defaultNetwork)
    },
    enabled: Boolean(chainConfig),
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
}

export function useAttestationWriter(chainConfig?: HashKeyChainConfig) {
  return useMutation({
    mutationFn: async (payload: {
      network: WalletNetworkKey
      reportHash: string
      portfolioHash: string
      attestationHash: string
      sessionId: string
      summaryUri: string
    }) => {
      if (!chainConfig) {
        throw new Error('Chain config is not loaded yet.')
      }
      return writePlanAttestation({
        chainConfig,
        ...payload,
      })
    },
  })
}
