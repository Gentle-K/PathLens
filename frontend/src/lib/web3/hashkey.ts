import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  formatUnits,
  http,
  type Address,
  type Hex,
} from 'viem'

import type {
  HashKeyChainConfig,
  MarketDataSnapshot,
  OracleFeedConfig,
  WalletKycSnapshot,
  WalletNetworkKey,
} from '@/types'

export interface InjectedEthereumProvider {
  isMetaMask?: boolean
  request(args: {
    method: string
    params?: unknown[] | Record<string, unknown>
  }): Promise<unknown>
  on?(event: string, handler: (...args: unknown[]) => void): void
  removeListener?(event: string, handler: (...args: unknown[]) => void): void
}

type WalletState = {
  address: string
  chainId: number | null
}

export const kycSbtAbi = [
  {
    type: 'function',
    name: 'isHuman',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'verified', type: 'bool' },
      { name: 'level', type: 'uint8' },
    ],
  },
] as const

export const aproPriceFeedAbi = [
  {
    type: 'function',
    name: 'latestRoundData',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
] as const

export const planRegistryAbi = [
  {
    type: 'function',
    name: 'registerPlan',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'reportHash', type: 'bytes32' },
      { name: 'portfolioHash', type: 'bytes32' },
      { name: 'attestationHash', type: 'bytes32' },
      { name: 'sessionId', type: 'string' },
      { name: 'summaryUri', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'PlanRegistered',
    inputs: [
      { indexed: true, name: 'attestationHash', type: 'bytes32' },
      { indexed: true, name: 'submitter', type: 'address' },
      { indexed: false, name: 'reportHash', type: 'bytes32' },
      { indexed: false, name: 'portfolioHash', type: 'bytes32' },
      { indexed: false, name: 'sessionId', type: 'string' },
      { indexed: false, name: 'summaryUri', type: 'string' },
      { indexed: false, name: 'recordedAt', type: 'uint256' },
    ],
  },
] as const

declare global {
  interface Window {
    ethereum?: InjectedEthereumProvider
  }
}

export function getInjectedProvider() {
  if (typeof window === 'undefined') {
    return undefined
  }
  return window.ethereum
}

export function resolveWalletNetwork(
  chainConfig: HashKeyChainConfig | undefined,
  chainId: number | null,
): WalletNetworkKey | null {
  if (!chainConfig || chainId == null) {
    return null
  }
  if (chainId === chainConfig.testnetChainId) {
    return 'testnet'
  }
  if (chainId === chainConfig.mainnetChainId) {
    return 'mainnet'
  }
  return null
}

export function getNetworkLabel(network: WalletNetworkKey | null, isZh: boolean) {
  if (network === 'testnet') {
    return isZh ? 'HashKey Chain 测试网' : 'HashKey Chain Testnet'
  }
  if (network === 'mainnet') {
    return isZh ? 'HashKey Chain 主网' : 'HashKey Chain Mainnet'
  }
  return isZh ? '未连接到 HashKey 网络' : 'Not on a HashKey network'
}

function hexChainId(value: number) {
  return `0x${value.toString(16)}`
}

export function toViemChain(
  chainConfig: HashKeyChainConfig,
  network: WalletNetworkKey,
) {
  const isTestnet = network === 'testnet'
  const chainId = isTestnet
    ? chainConfig.testnetChainId
    : chainConfig.mainnetChainId
  const rpcUrl = isTestnet
    ? chainConfig.testnetRpcUrl
    : chainConfig.mainnetRpcUrl
  const explorerUrl = isTestnet
    ? chainConfig.testnetExplorerUrl
    : chainConfig.mainnetExplorerUrl

  return defineChain({
    id: chainId,
    name: `${chainConfig.ecosystemName} ${isTestnet ? 'Testnet' : 'Mainnet'}`,
    network: `${chainConfig.ecosystemName.toLowerCase().replaceAll(' ', '-')}-${network}`,
    nativeCurrency: {
      name: chainConfig.nativeTokenSymbol,
      symbol: chainConfig.nativeTokenSymbol,
      decimals: 18,
    },
    rpcUrls: {
      default: { http: [rpcUrl] },
      public: { http: [rpcUrl] },
    },
    blockExplorers: {
      default: {
        name: 'Blockscout',
        url: explorerUrl,
      },
    },
  })
}

function publicClientFor(
  chainConfig: HashKeyChainConfig,
  network: WalletNetworkKey,
) {
  const chain = toViemChain(chainConfig, network)
  return createPublicClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0]),
  })
}

function planRegistryAddress(
  chainConfig: HashKeyChainConfig,
  network: WalletNetworkKey,
) {
  return network === 'testnet'
    ? chainConfig.testnetPlanRegistryAddress || chainConfig.planRegistryAddress
    : chainConfig.mainnetPlanRegistryAddress || chainConfig.planRegistryAddress
}

function kycSbtAddress(
  chainConfig: HashKeyChainConfig,
  network: WalletNetworkKey,
) {
  return network === 'testnet'
    ? chainConfig.testnetKycSbtAddress || chainConfig.kycSbtAddress
    : chainConfig.mainnetKycSbtAddress || chainConfig.kycSbtAddress
}

function explorerBase(
  chainConfig: HashKeyChainConfig,
  network: WalletNetworkKey,
) {
  return network === 'testnet'
    ? chainConfig.testnetExplorerUrl
    : chainConfig.mainnetExplorerUrl
}

function rpcUrlFor(
  chainConfig: HashKeyChainConfig,
  network: WalletNetworkKey,
) {
  return network === 'testnet'
    ? chainConfig.testnetRpcUrl
    : chainConfig.mainnetRpcUrl
}

function feedAddressFor(feed: OracleFeedConfig, network: WalletNetworkKey) {
  return network === 'testnet'
    ? feed.testnetAddress
    : feed.mainnetAddress
}

function chainIdFor(
  chainConfig: HashKeyChainConfig,
  network: WalletNetworkKey,
) {
  return network === 'testnet'
    ? chainConfig.testnetChainId
    : chainConfig.mainnetChainId
}

function normalizeHashToBytes32(value: string): Hex {
  const normalized = value.trim().toLowerCase().replace(/^0x/, '')
  return `0x${normalized.padStart(64, '0').slice(0, 64)}` as Hex
}

export async function readInjectedWalletState(): Promise<WalletState> {
  const provider = getInjectedProvider()
  if (!provider) {
    return { address: '', chainId: null }
  }

  const [accounts, chainIdHex] = await Promise.all([
    provider.request({ method: 'eth_accounts' }),
    provider.request({ method: 'eth_chainId' }),
  ])

  const firstAccount = Array.isArray(accounts) ? String(accounts[0] ?? '') : ''
  return {
    address: firstAccount,
    chainId:
      typeof chainIdHex === 'string' ? Number.parseInt(chainIdHex, 16) : null,
  }
}

export async function connectInjectedWallet() {
  const provider = getInjectedProvider()
  if (!provider) {
    throw new Error('No injected wallet provider is available.')
  }

  const accounts = await provider.request({
    method: 'eth_requestAccounts',
  })
  const chainIdHex = await provider.request({ method: 'eth_chainId' })
  const firstAccount = Array.isArray(accounts) ? String(accounts[0] ?? '') : ''

  return {
    address: firstAccount,
    chainId:
      typeof chainIdHex === 'string' ? Number.parseInt(chainIdHex, 16) : null,
  }
}

export async function switchWalletNetwork(
  chainConfig: HashKeyChainConfig,
  network: WalletNetworkKey,
) {
  const provider = getInjectedProvider()
  if (!provider) {
    throw new Error('No injected wallet provider is available.')
  }

  const chainId = chainIdFor(chainConfig, network)
  const chain = toViemChain(chainConfig, network)

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hexChainId(chainId) }],
    })
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? Number((error as { code?: number }).code)
        : undefined

    if (code !== 4902) {
      throw error
    }

    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: hexChainId(chain.id),
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: [rpcUrlFor(chainConfig, network)],
          blockExplorerUrls: [explorerBase(chainConfig, network)],
        },
      ],
    })
  }
}

export async function readWalletKyc(
  chainConfig: HashKeyChainConfig,
  walletAddress: string,
  network: WalletNetworkKey,
): Promise<WalletKycSnapshot> {
  const contractAddress = kycSbtAddress(chainConfig, network)
  const fetchedAt = new Date().toISOString()

  if (!walletAddress || !contractAddress) {
    return {
      walletAddress,
      network,
      contractAddress,
      isHuman: false,
      level: 0,
      sourceUrl: chainConfig.docsUrls.find((url) => url.includes('/Tools/KYC')),
      explorerUrl: contractAddress
        ? `${explorerBase(chainConfig, network)}/address/${contractAddress}`
        : undefined,
      fetchedAt,
      note: contractAddress
        ? 'Wallet not connected.'
        : 'KYC SBT contract is not configured for this network.',
    }
  }

  const client = publicClientFor(chainConfig, network)
  const [isHuman, level] = await client.readContract({
    address: contractAddress as Address,
    abi: kycSbtAbi,
    functionName: 'isHuman',
    args: [walletAddress as Address],
  })

  return {
    walletAddress,
    network,
    contractAddress,
    isHuman,
    level: Number(level),
    sourceUrl: chainConfig.docsUrls.find((url) => url.includes('/Tools/KYC')),
    explorerUrl: `${explorerBase(chainConfig, network)}/address/${contractAddress}`,
    fetchedAt,
    note: isHuman
      ? 'Onchain KYC/SBT eligibility detected.'
      : 'No onchain KYC/SBT eligibility was detected for this wallet.',
  }
}

export async function readMarketSnapshots(
  chainConfig: HashKeyChainConfig,
  network: WalletNetworkKey,
) {
  const client = publicClientFor(chainConfig, network)
  const fetchedAt = new Date().toISOString()

  return Promise.all(
    chainConfig.oracleFeeds.map(async (feed): Promise<MarketDataSnapshot> => {
      const feedAddress = feedAddressFor(feed, network)
      if (!feedAddress) {
        return {
          feedId: feed.id,
          pair: feed.pair,
          network,
          sourceName: feed.sourceName,
          sourceUrl:
            feed.docsUrl ||
            chainConfig.docsUrls.find((url) => url.includes('/Tools/Oracle')) ||
            '',
          feedAddress: '',
          price: undefined,
          decimals: feed.decimals,
          fetchedAt,
          note: 'This oracle feed is not configured on the selected network.',
          status: 'unavailable',
        }
      }

      try {
        const [roundId, answer, , updatedAt] = await client.readContract({
          address: feedAddress as Address,
          abi: aproPriceFeedAbi,
          functionName: 'latestRoundData',
        })

        return {
          feedId: feed.id,
          pair: feed.pair,
          network,
          sourceName: feed.sourceName,
          sourceUrl:
            feed.docsUrl ||
            chainConfig.docsUrls.find((url) => url.includes('/Tools/Oracle')) ||
            '',
          feedAddress,
          explorerUrl: `${explorerBase(chainConfig, network)}/address/${feedAddress}`,
          price: Number(formatUnits(answer, feed.decimals)),
          decimals: feed.decimals,
          fetchedAt,
          updatedAt:
            Number(updatedAt) > 0
              ? new Date(Number(updatedAt) * 1000).toISOString()
              : undefined,
          roundId: Number(roundId),
          note: 'Live price fetched from the configured HashKey APRO oracle feed.',
          status: 'live',
        }
      } catch (error) {
        return {
          feedId: feed.id,
          pair: feed.pair,
          network,
          sourceName: feed.sourceName,
          sourceUrl:
            feed.docsUrl ||
            chainConfig.docsUrls.find((url) => url.includes('/Tools/Oracle')) ||
            '',
          feedAddress,
          explorerUrl: `${explorerBase(chainConfig, network)}/address/${feedAddress}`,
          price: undefined,
          decimals: feed.decimals,
          fetchedAt,
          note:
            error instanceof Error
              ? error.message
              : 'The live price feed request failed.',
          status: 'unavailable',
        }
      }
    }),
  )
}

export async function writePlanAttestation(params: {
  chainConfig: HashKeyChainConfig
  network: WalletNetworkKey
  reportHash: string
  portfolioHash: string
  attestationHash: string
  sessionId: string
  summaryUri: string
}) {
  const provider = getInjectedProvider()
  if (!provider) {
    throw new Error('No injected wallet provider is available.')
  }

  const contractAddress = planRegistryAddress(params.chainConfig, params.network)
  if (!contractAddress) {
    throw new Error('Plan Registry is not configured for the selected network.')
  }

  const chain = toViemChain(params.chainConfig, params.network)
  const walletClient = createWalletClient({
    chain,
    transport: custom(provider),
  })
  const publicClient = publicClientFor(params.chainConfig, params.network)

  const [account] = await walletClient.getAddresses()
  const hash = await walletClient.writeContract({
    account,
    address: contractAddress as Address,
    abi: planRegistryAbi,
    functionName: 'registerPlan',
    args: [
      normalizeHashToBytes32(params.reportHash),
      normalizeHashToBytes32(params.portfolioHash),
      normalizeHashToBytes32(params.attestationHash),
      params.sessionId,
      params.summaryUri,
    ],
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })

  return {
    account,
    transactionHash: hash,
    transactionUrl: `${explorerBase(params.chainConfig, params.network)}/tx/${hash}`,
    blockNumber: Number(receipt.blockNumber),
  }
}

export function shortAddress(value?: string) {
  if (!value) {
    return ''
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}
