#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const frontendPackageRoot = path.join(repoRoot, 'frontend')

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
    if (!fs.existsSync(envPath)) continue
    const content = fs.readFileSync(envPath, 'utf8')
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#') || !line.includes('=')) continue
      const separatorIndex = line.indexOf('=')
      const key = line.slice(0, separatorIndex).trim()
      if (!key || process.env[key]) continue
      process.env[key] = stripQuotes(line.slice(separatorIndex + 1).trim())
    }
  }
}

async function importFromFrontend(specifier) {
  const resolved = require.resolve(specifier, { paths: [frontendPackageRoot] })
  return import(pathToFileURL(resolved).href)
}

function parseArgs(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    if (!current.startsWith('--')) continue
    const key = current.slice(2)
    const value = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : 'true'
    result[key] = value
    if (value !== 'true') index += 1
  }
  return result
}

function resolveNetworkConfig(network) {
  const normalized = (network || process.env.HASHKEY_DEPLOY_NETWORK || 'testnet').trim().toLowerCase()
  const isMainnet = normalized === 'mainnet'
  return {
    network: isMainnet ? 'mainnet' : 'testnet',
    chainId: Number(
      process.env[isMainnet ? 'HASHKEY_MAINNET_CHAIN_ID' : 'HASHKEY_TESTNET_CHAIN_ID'] ||
        (isMainnet ? '177' : '133'),
    ),
    rpcUrl:
      process.env[isMainnet ? 'HASHKEY_MAINNET_RPC_URL' : 'HASHKEY_TESTNET_RPC_URL'] ||
      (isMainnet ? 'https://mainnet.hsk.xyz' : 'https://testnet.hsk.xyz'),
    explorerUrl:
      process.env[isMainnet ? 'HASHKEY_MAINNET_EXPLORER_URL' : 'HASHKEY_TESTNET_EXPLORER_URL'] ||
      (isMainnet ? 'https://hashkey.blockscout.com' : 'https://testnet-explorer.hsk.xyz'),
  }
}

function bigintReplacer(_key, value) {
  return typeof value === 'bigint' ? value.toString() : value
}

async function main() {
  loadEnvFiles()
  const args = parseArgs(process.argv.slice(2))
  const mode = (args.mode || 'index').trim().toLowerCase()
  const contract = (args.contract || '').trim().toLowerCase()
  const address = (args.address || '').trim()
  if (!contract || !address) {
    throw new Error('--contract and --address are required.')
  }

  const network = resolveNetworkConfig(args.network)
  const { createPublicClient, defineChain, http, parseAbi, parseAbiItem } = await importFromFrontend('viem')
  const accounts = await importFromFrontend('viem/accounts')

  const chain = defineChain({
    id: network.chainId,
    name: `HashKey ${network.network}`,
    network: `hashkey-${network.network}`,
    nativeCurrency: { name: 'HSK', symbol: 'HSK', decimals: 18 },
    rpcUrls: {
      default: { http: [network.rpcUrl] },
      public: { http: [network.rpcUrl] },
    },
    blockExplorers: {
      default: { name: 'Blockscout', url: network.explorerUrl },
    },
  })

  const client = createPublicClient({
    chain,
    transport: http(network.rpcUrl),
  })

  const assetProofAbi = parseAbi([
    'function owner() view returns (address)',
    'function pendingOwner() view returns (address)',
    'function attesters(address) view returns (bool)',
  ])
  const assetProofRegisteredEvent = parseAbiItem(
    'event AssetProofRegistered(bytes32 indexed proofKey, bytes32 indexed snapshotHash, address indexed attester, string assetId, string snapshotUri, string proofType, uint256 effectiveAt, uint256 recordedAt)',
  )
  const planRegisteredEvent = parseAbiItem(
    'event PlanRegistered(bytes32 indexed attestationHash, address indexed submitter, bytes32 reportHash, bytes32 portfolioHash, string sessionId, string summaryUri, uint256 recordedAt)',
  )

  const headBlock = await client.getBlockNumber()
  const finalityBuffer = BigInt(Math.max(0, Number(args['finality-buffer'] || '2')))
  const safeHead = headBlock > finalityBuffer ? headBlock - finalityBuffer : 0n

  if (mode === 'status') {
    let owner = ''
    let pendingOwner = ''
    let publisherAddress = (args.publisher || '').trim()
    const privateKey =
      process.env.ASSET_PROOF_REGISTRY_DEPLOYER_PRIVATE_KEY ||
      process.env.PLAN_REGISTRY_DEPLOYER_PRIVATE_KEY ||
      process.env.PRIVATE_KEY ||
      process.env.DEPLOYER_PRIVATE_KEY
    if (!publisherAddress && privateKey) {
      const account = accounts.privateKeyToAccount(
        privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`,
      )
      publisherAddress = account.address
    }
    let publisherAuthorized = false
    if (contract === 'asset-proof') {
      try {
        owner = await client.readContract({
          address,
          abi: assetProofAbi,
          functionName: 'owner',
        })
      } catch {}
      try {
        pendingOwner = await client.readContract({
          address,
          abi: assetProofAbi,
          functionName: 'pendingOwner',
        })
      } catch {}
      if (publisherAddress) {
        try {
          publisherAuthorized = await client.readContract({
            address,
            abi: assetProofAbi,
            functionName: 'attesters',
            args: [publisherAddress],
          })
        } catch {}
      }
    }

    const payload = {
      network: network.network,
      contract,
      contractAddress: address,
      headBlock: Number(headBlock),
      safeHead: Number(safeHead),
      owner,
      pendingOwner,
      publisherAddress,
      publisherAuthorized,
      attesters: publisherAuthorized && publisherAddress ? [publisherAddress] : [],
    }
    process.stdout.write(`${JSON.stringify(payload, bigintReplacer)}\n`)
    return
  }

  const fromBlock = BigInt(Math.max(0, Number(args['from-block'] || '0')))
  const requestedToBlock = BigInt(Math.max(0, Number(args['to-block'] || String(safeHead))))
  const toBlock = requestedToBlock > safeHead ? safeHead : requestedToBlock

  let events = []
  if (fromBlock <= toBlock) {
    if (contract === 'asset-proof') {
      const logs = await client.getLogs({
        address,
        event: assetProofRegisteredEvent,
        fromBlock,
        toBlock,
      })
      events = logs.map((log) => ({
        kind: 'asset_proof_registered',
        proofKey: log.args.proofKey,
        snapshotHash: log.args.snapshotHash,
        attester: log.args.attester,
        assetId: log.args.assetId,
        snapshotUri: log.args.snapshotUri,
        proofType: log.args.proofType,
        effectiveAt: Number(log.args.effectiveAt),
        recordedAt: Number(log.args.recordedAt),
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
      }))
    } else if (contract === 'plan') {
      const logs = await client.getLogs({
        address,
        event: planRegisteredEvent,
        fromBlock,
        toBlock,
      })
      events = logs.map((log) => ({
        kind: 'plan_registered',
        attestationHash: log.args.attestationHash,
        submitter: log.args.submitter,
        reportHash: log.args.reportHash,
        portfolioHash: log.args.portfolioHash,
        sessionId: log.args.sessionId,
        summaryUri: log.args.summaryUri,
        recordedAt: Number(log.args.recordedAt),
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
      }))
    } else {
      throw new Error(`Unsupported contract '${contract}'.`)
    }
  }

  const payload = {
    network: network.network,
    contract,
    contractAddress: address,
    headBlock: Number(headBlock),
    safeHead: Number(safeHead),
    fromBlock: Number(fromBlock),
    toBlock: Number(toBlock),
    events,
  }
  process.stdout.write(`${JSON.stringify(payload, bigintReplacer)}\n`)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
