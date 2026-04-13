#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const frontendPackageRoot = path.join(repoRoot, 'frontend')
const contractPath = path.join(repoRoot, 'contracts', 'AssetProofRegistry.sol')

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith('--') || value == null) {
      continue
    }
    args[key.slice(2)] = value
  }
  return args
}

function stripQuotes(value) {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function loadEnvFiles() {
  const candidates = [
    path.join(repoRoot, '.env.local'),
    path.join(frontendPackageRoot, '.env.local'),
    path.join(repoRoot, '.env'),
    path.join(frontendPackageRoot, '.env'),
  ]

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) {
      continue
    }
    const content = fs.readFileSync(envPath, 'utf8')
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#') || !line.includes('=')) {
        continue
      }
      const separatorIndex = line.indexOf('=')
      const key = line.slice(0, separatorIndex).trim()
      if (!key || process.env[key]) {
        continue
      }
      process.env[key] = stripQuotes(line.slice(separatorIndex + 1).trim())
    }
  }
}

async function importFromFrontend(specifier) {
  const resolved = require.resolve(specifier, { paths: [frontendPackageRoot] })
  return import(pathToFileURL(resolved).href)
}

function readContractSource() {
  return fs.readFileSync(contractPath, 'utf8')
}

function compileAssetProofRegistry(solc) {
  const input = {
    language: 'Solidity',
    sources: {
      'AssetProofRegistry.sol': {
        content: readContractSource(),
      },
    },
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      outputSelection: {
        '*': {
          '*': ['abi'],
        },
      },
    },
  }

  const output = JSON.parse(solc.compile(JSON.stringify(input)))
  if (output.errors?.length) {
    const fatalError = output.errors.find((entry) => entry.severity === 'error')
    for (const entry of output.errors) {
      console.error(`${entry.severity.toUpperCase()}: ${entry.formattedMessage}`)
    }
    if (fatalError) {
      process.exit(1)
    }
  }

  const artifact = output.contracts?.['AssetProofRegistry.sol']?.AssetProofRegistry
  if (!artifact?.abi) {
    console.error('Failed to compile AssetProofRegistry.sol')
    process.exit(1)
  }
  return artifact.abi
}

function resolveNetworkConfig(networkArg) {
  const network = (networkArg || process.env.HASHKEY_DEPLOY_NETWORK || 'testnet').trim().toLowerCase()
  const isMainnet = network === 'mainnet'
  const chainId = Number(
    process.env[isMainnet ? 'HASHKEY_MAINNET_CHAIN_ID' : 'HASHKEY_TESTNET_CHAIN_ID'] ||
      (isMainnet ? '177' : '133'),
  )
  const rpcUrl =
    process.env[isMainnet ? 'HASHKEY_MAINNET_RPC_URL' : 'HASHKEY_TESTNET_RPC_URL'] ||
    (isMainnet ? 'https://mainnet.hsk.xyz' : 'https://testnet.hsk.xyz')
  const explorerUrl =
    process.env[isMainnet ? 'HASHKEY_MAINNET_EXPLORER_URL' : 'HASHKEY_TESTNET_EXPLORER_URL'] ||
    (isMainnet ? 'https://hashkey.blockscout.com' : 'https://testnet-explorer.hsk.xyz')

  return {
    network: isMainnet ? 'mainnet' : 'testnet',
    chainId,
    rpcUrl,
    explorerUrl,
  }
}

async function main() {
  loadEnvFiles()
  const args = parseArgs(process.argv.slice(2))
  const registry = args.registry
  const assetId = args['asset-id']
  const snapshotHash = args['snapshot-hash']
  const snapshotUri = args['snapshot-uri']
  const proofType = args['proof-type']
  const effectiveAt = Number(args['effective-at'] || '0')

  if (!registry || !assetId || !snapshotHash || !snapshotUri || !proofType || !effectiveAt) {
    console.error('Missing required args for proof publish.')
    process.exit(1)
  }

  const privateKey =
    process.env.ASSET_PROOF_REGISTRY_DEPLOYER_PRIVATE_KEY ||
    process.env.PLAN_REGISTRY_DEPLOYER_PRIVATE_KEY ||
    process.env.PRIVATE_KEY ||
    process.env.DEPLOYER_PRIVATE_KEY
  if (!privateKey) {
    console.error('A deployer private key is required to publish proof onchain.')
    process.exit(1)
  }

  const { default: solc } = await importFromFrontend('solc')
  const viem = await importFromFrontend('viem')
  const accounts = await importFromFrontend('viem/accounts')
  const abi = compileAssetProofRegistry(solc)
  const network = resolveNetworkConfig(args.network)
  const chain = viem.defineChain({
    id: network.chainId,
    name: `HashKey Chain ${network.network === 'mainnet' ? 'Mainnet' : 'Testnet'}`,
    network: `hashkey-${network.network}`,
    nativeCurrency: { name: 'HSK', symbol: 'HSK', decimals: 18 },
    rpcUrls: {
      default: { http: [network.rpcUrl] },
      public: { http: [network.rpcUrl] },
    },
    blockExplorers: {
      default: {
        name: 'Blockscout',
        url: network.explorerUrl,
      },
    },
  })

  const account = accounts.privateKeyToAccount(
    privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`,
  )
  const walletClient = viem.createWalletClient({
    account,
    chain,
    transport: viem.http(network.rpcUrl),
  })
  const publicClient = viem.createPublicClient({
    chain,
    transport: viem.http(network.rpcUrl),
  })

  const snapshotHashHex = snapshotHash.startsWith('0x') ? snapshotHash : `0x${snapshotHash}`
  const proofKey = viem.keccak256(
    viem.encodePacked(
      ['string', 'bytes32', 'string', 'uint64'],
      [assetId, snapshotHashHex, proofType, BigInt(effectiveAt)],
    ),
  )

  const hash = await walletClient.writeContract({
    address: registry,
    abi,
    functionName: 'registerAssetProof',
    args: [snapshotHashHex, proofKey, assetId, snapshotUri, proofType, BigInt(effectiveAt)],
    account,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })

  process.stdout.write(
    JSON.stringify({
      proofKey,
      transactionHash: hash,
      blockNumber: receipt.blockNumber ? Number(receipt.blockNumber) : undefined,
      explorerUrl: `${network.explorerUrl}/tx/${hash}`,
      attester: account.address,
    }),
  )
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
