#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const frontendPackageRoot = path.join(repoRoot, 'frontend')
const contractPath = path.join(repoRoot, 'contracts', 'PlanRegistry.sol')

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

      const value = stripQuotes(line.slice(separatorIndex + 1).trim())
      process.env[key] = value
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

function compilePlanRegistry(solc) {
  const input = {
    language: 'Solidity',
    sources: {
      'PlanRegistry.sol': {
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
          '*': ['abi', 'evm.bytecode.object'],
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

  const artifact = output.contracts?.['PlanRegistry.sol']?.PlanRegistry
  if (!artifact?.abi || !artifact?.evm?.bytecode?.object) {
    console.error('Failed to compile PlanRegistry.sol')
    process.exit(1)
  }

  return {
    abi: artifact.abi,
    bytecode: `0x${artifact.evm.bytecode.object}`,
  }
}

function resolveNetworkConfig() {
  const network = (process.env.HASHKEY_DEPLOY_NETWORK || 'testnet').trim().toLowerCase()
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

  const privateKey =
    process.env.PLAN_REGISTRY_DEPLOYER_PRIVATE_KEY ||
    process.env.PRIVATE_KEY ||
    process.env.DEPLOYER_PRIVATE_KEY
  if (!privateKey) {
    console.error(
      'PLAN_REGISTRY_DEPLOYER_PRIVATE_KEY is required. The script also accepts PRIVATE_KEY or DEPLOYER_PRIVATE_KEY from .env.local.',
    )
    process.exit(1)
  }

  const { default: solc } = await importFromFrontend('solc')
  const viem = await importFromFrontend('viem')
  const accounts = await importFromFrontend('viem/accounts')
  const { abi, bytecode } = compilePlanRegistry(solc)
  const network = resolveNetworkConfig()

  const chain = viem.defineChain({
    id: network.chainId,
    name: `HashKey Chain ${network.network === 'mainnet' ? 'Mainnet' : 'Testnet'}`,
    network: `hashkey-${network.network}`,
    nativeCurrency: {
      name: 'HSK',
      symbol: 'HSK',
      decimals: 18,
    },
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

  console.log(`Deploying PlanRegistry to HashKey ${network.network}...`)
  console.log(`RPC: ${network.rpcUrl}`)
  console.log(`Deployer: ${account.address}`)

  const hash = await walletClient.deployContract({
    abi,
    bytecode,
    account,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })

  console.log('')
  console.log(`Contract address: ${receipt.contractAddress}`)
  console.log(`Transaction hash: ${hash}`)
  console.log(`Explorer: ${network.explorerUrl}/tx/${hash}`)
  console.log('')
  console.log(
    network.network === 'mainnet'
      ? `Set HASHKEY_MAINNET_PLAN_REGISTRY_ADDRESS=${receipt.contractAddress}`
      : `Set HASHKEY_TESTNET_PLAN_REGISTRY_ADDRESS=${receipt.contractAddress}`,
  )
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
