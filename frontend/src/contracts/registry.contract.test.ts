import fs from 'node:fs'
import path from 'node:path'

import { createCustomCommon, Hardfork, Mainnet, type Common } from '@ethereumjs/common'
import { createLegacyTx } from '@ethereumjs/tx'
import {
  type Address as VmAddress,
  bytesToHex,
  createAccount,
  createAddressFromPrivateKey,
  hexToBytes,
} from '@ethereumjs/util'
import { createVM, runTx, type VM } from '@ethereumjs/vm'
import solc from 'solc'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  decodeFunctionResult,
  encodeFunctionData,
  type Abi,
  type Address,
} from 'viem'

const repoRoot = path.resolve(import.meta.dirname, '../../..')

type ContractArtifact = {
  abi: Abi
  bytecode: `0x${string}`
}

type TestAccount = {
  address: VmAddress
  hex: Address
  privateKey: Uint8Array
}

function bytes32(seed: number) {
  return `0x${seed.toString(16).padStart(64, '0')}` as const
}

function sameAddress(actual: string, expected: string) {
  expect(actual.toLowerCase()).toBe(expected.toLowerCase())
}

function compileContract(contractFile: string, contractName: string): ContractArtifact {
  const source = fs.readFileSync(path.join(repoRoot, 'contracts', contractFile), 'utf8')
  const input = {
    language: 'Solidity',
    sources: {
      [contractFile]: { content: source },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'paris',
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object'],
        },
      },
    },
  }
  const output = JSON.parse(solc.compile(JSON.stringify(input)))
  const fatal = (output.errors ?? []).find((entry: { severity: string }) => entry.severity === 'error')
  if (fatal) {
    throw new Error(output.errors.map((entry: { formattedMessage: string }) => entry.formattedMessage).join('\n'))
  }
  const artifact = output.contracts?.[contractFile]?.[contractName]
  if (!artifact?.abi || !artifact?.evm?.bytecode?.object) {
    throw new Error(`Unable to compile ${contractName}`)
  }
  return {
    abi: artifact.abi as Abi,
    bytecode: `0x${artifact.evm.bytecode.object}`,
  }
}

function buildAccount(seedByte: string): TestAccount {
  const privateKey = hexToBytes(`0x${seedByte.repeat(32)}`)
  const address = createAddressFromPrivateKey(privateKey)
  return {
    address,
    hex: address.toString() as Address,
    privateKey,
  }
}

async function deployContract({
  artifact,
  from,
  common,
  vm,
}: {
  artifact: ContractArtifact
  from: TestAccount
  common: Common
  vm: VM
}) {
  const result = await sendTransaction({
    common,
    data: artifact.bytecode,
    from,
    vm,
  })
  if (result.execResult.exceptionError) {
    throw new Error(result.execResult.exceptionError.error)
  }
  if (!result.createdAddress) {
    throw new Error('Missing contract address')
  }
  return result.createdAddress
}

async function sendTransaction({
  common,
  data,
  from,
  to,
  vm,
}: {
  common: Common
  data: `0x${string}`
  from: TestAccount
  to?: VmAddress
  vm: VM
}) {
  const account = await vm.stateManager.getAccount(from.address)
  const tx = createLegacyTx(
    {
      nonce: account?.nonce ?? 0n,
      gasLimit: 8_000_000n,
      gasPrice: 10n,
      to: to?.toString(),
      data,
    },
    { common },
  ).sign(from.privateKey)
  return runTx(vm, {
    skipBalance: true,
    tx,
  })
}

async function readContract<TResult>({
  address,
  args = [],
  artifact,
  from,
  functionName,
  vm,
}: {
  address: VmAddress
  args?: readonly unknown[]
  artifact: ContractArtifact
  from: TestAccount
  functionName: string
  vm: VM
}): Promise<TResult> {
  const result = await vm.evm.runCall({
    caller: from.address,
    data: hexToBytes(
      encodeFunctionData({
        abi: artifact.abi,
        args: args as never,
        functionName: functionName as never,
      }),
    ),
    gasLimit: 8_000_000n,
    origin: from.address,
    to: address,
  })
  if (result.execResult.exceptionError) {
    throw new Error(result.execResult.exceptionError.error)
  }
  return decodeFunctionResult({
    abi: artifact.abi,
    data: bytesToHex(result.execResult.returnValue),
    functionName: functionName as never,
  }) as TResult
}

async function writeContract({
  address,
  args = [],
  artifact,
  common,
  from,
  functionName,
  vm,
}: {
  address: VmAddress
  args?: readonly unknown[]
  artifact: ContractArtifact
  common: Common
  from: TestAccount
  functionName: string
  vm: VM
}) {
  const result = await sendTransaction({
    common,
    data: encodeFunctionData({
      abi: artifact.abi,
      args: args as never,
      functionName: functionName as never,
    }),
    from,
    to: address,
    vm,
  })
  if (result.execResult.exceptionError) {
    throw new Error(result.execResult.exceptionError.error)
  }
  return result
}

describe('Registry contracts', () => {
  const assetProofArtifact = compileContract('AssetProofRegistry.sol', 'AssetProofRegistry')
  const planRegistryArtifact = compileContract('PlanRegistry.sol', 'PlanRegistry')

  let common: Common
  let vm: VM
  let owner: TestAccount
  let attester: TestAccount
  let outsider: TestAccount

  beforeEach(async () => {
    common = createCustomCommon({ chainId: 1337 }, Mainnet, { hardfork: Hardfork.Paris })
    vm = await createVM({ common })
    owner = buildAccount('11')
    attester = buildAccount('22')
    outsider = buildAccount('33')

    await Promise.all(
      [owner, attester, outsider].map((account) =>
        vm.stateManager.putAccount(
          account.address,
          createAccount({
            balance: 10n ** 20n,
          }),
        ),
      ),
    )
  })

  it('AssetProofRegistry enforces owner, attester, batch publish, and ownership transfer', async () => {
    const address = await deployContract({
      artifact: assetProofArtifact,
      common,
      from: owner,
      vm,
    })

    sameAddress(
      await readContract<Address>({
        address,
        artifact: assetProofArtifact,
        from: owner,
        functionName: 'owner',
        vm,
      }),
      owner.hex,
    )
    expect(
      await readContract<boolean>({
        address,
        args: [owner.hex],
        artifact: assetProofArtifact,
        from: owner,
        functionName: 'attesters',
        vm,
      }),
    ).toBe(true)

    await expect(
      writeContract({
        address,
        args: [attester.hex, true],
        artifact: assetProofArtifact,
        common,
        from: outsider,
        functionName: 'setAttester',
        vm,
      }),
    ).rejects.toBeDefined()

    await writeContract({
      address,
      args: [attester.hex, true],
      artifact: assetProofArtifact,
      common,
      from: owner,
      functionName: 'setAttester',
      vm,
    })
    expect(
      await readContract<boolean>({
        address,
        args: [attester.hex],
        artifact: assetProofArtifact,
        from: owner,
        functionName: 'attesters',
        vm,
      }),
    ).toBe(true)

    await expect(
      writeContract({
        address,
        args: ['0x0000000000000000000000000000000000000000', true],
        artifact: assetProofArtifact,
        common,
        from: owner,
        functionName: 'setAttester',
        vm,
      }),
    ).rejects.toBeDefined()

    await expect(
      writeContract({
        address,
        args: [bytes32(10), bytes32(11), 'hsk-usdt', 'hashkey://proof/1', 'proof', 1n],
        artifact: assetProofArtifact,
        common,
        from: outsider,
        functionName: 'registerAssetProof',
        vm,
      }),
    ).rejects.toBeDefined()

    await expect(
      writeContract({
        address,
        args: [
          '0x0000000000000000000000000000000000000000000000000000000000000000',
          bytes32(11),
          '',
          'hashkey://proof/1',
          'proof',
          1n,
        ],
        artifact: assetProofArtifact,
        common,
        from: attester,
        functionName: 'registerAssetProof',
        vm,
      }),
    ).rejects.toBeDefined()

    await writeContract({
      address,
      args: [bytes32(10), bytes32(11), 'hsk-usdt', 'hashkey://proof/1', 'proof', 1n],
      artifact: assetProofArtifact,
      common,
      from: attester,
      functionName: 'registerAssetProof',
      vm,
    })
    expect(
      await readContract<`0x${string}`>({
        address,
        args: ['hsk-usdt'],
        artifact: assetProofArtifact,
        from: owner,
        functionName: 'getLatestProofKey',
        vm,
      }),
    ).toBe(bytes32(11))

    const record = await readContract<Record<string, unknown> & readonly unknown[]>({
      address,
      args: [bytes32(11)],
      artifact: assetProofArtifact,
      from: owner,
      functionName: 'getAssetProof',
      vm,
    })
    expect(record['assetId'] ?? record[1]).toBe('hsk-usdt')
    expect(record['snapshotUri'] ?? record[2]).toBe('hashkey://proof/1')

    await writeContract({
      address,
      args: [[
        {
          snapshotHash: bytes32(20),
          proofKey: bytes32(21),
          assetId: 'hsk-usdt',
          snapshotUri: 'hashkey://proof/2',
          proofType: 'proof',
          effectiveAt: 2n,
        },
        {
          snapshotHash: bytes32(30),
          proofKey: bytes32(31),
          assetId: 'hsk-usdc',
          snapshotUri: 'hashkey://proof/3',
          proofType: 'proof',
          effectiveAt: 3n,
        },
      ]],
      artifact: assetProofArtifact,
      common,
      from: attester,
      functionName: 'publishAssetProofBatch',
      vm,
    })

    const history = await readContract<readonly `0x${string}`[]>({
      address,
      args: ['hsk-usdt'],
      artifact: assetProofArtifact,
      from: owner,
      functionName: 'getProofHistory',
      vm,
    })
    expect(history).toHaveLength(2)
    expect(history[0]).toBe(bytes32(11))
    expect(history[1]).toBe(bytes32(21))
    expect(
      await readContract<`0x${string}`>({
        address,
        args: ['hsk-usdc'],
        artifact: assetProofArtifact,
        from: owner,
        functionName: 'getLatestProofKey',
        vm,
      }),
    ).toBe(bytes32(31))

    await expect(
      writeContract({
        address,
        args: [bytes32(99), bytes32(21), 'hsk-usdt', 'hashkey://proof/dup', 'proof', 99n],
        artifact: assetProofArtifact,
        common,
        from: attester,
        functionName: 'registerAssetProof',
        vm,
      }),
    ).rejects.toBeDefined()

    await writeContract({
      address,
      args: [attester.hex],
      artifact: assetProofArtifact,
      common,
      from: owner,
      functionName: 'transferOwnership',
      vm,
    })
    sameAddress(
      await readContract<Address>({
        address,
        artifact: assetProofArtifact,
        from: owner,
        functionName: 'pendingOwner',
        vm,
      }),
      attester.hex,
    )
    await expect(
      writeContract({
        address,
        artifact: assetProofArtifact,
        common,
        from: outsider,
        functionName: 'acceptOwnership',
        vm,
      }),
    ).rejects.toBeDefined()
    await writeContract({
      address,
      artifact: assetProofArtifact,
      common,
      from: attester,
      functionName: 'acceptOwnership',
      vm,
    })
    sameAddress(
      await readContract<Address>({
        address,
        artifact: assetProofArtifact,
        from: owner,
        functionName: 'owner',
        vm,
      }),
      attester.hex,
    )
    await expect(
      writeContract({
        address,
        args: [outsider.hex, true],
        artifact: assetProofArtifact,
        common,
        from: owner,
        functionName: 'setAttester',
        vm,
      }),
    ).rejects.toBeDefined()
    await writeContract({
      address,
      args: [outsider.hex, true],
      artifact: assetProofArtifact,
      common,
      from: attester,
      functionName: 'setAttester',
      vm,
    })
    expect(
      await readContract<boolean>({
        address,
        args: [outsider.hex],
        artifact: assetProofArtifact,
        from: owner,
        functionName: 'attesters',
        vm,
      }),
    ).toBe(true)

    await expect(
      writeContract({
        address,
        args: ['0x0000000000000000000000000000000000000000'],
        artifact: assetProofArtifact,
        common,
        from: attester,
        functionName: 'transferOwnership',
        vm,
      }),
    ).rejects.toBeDefined()
  })

  it('PlanRegistry stays permissionless and rejects invalid or duplicate plans', async () => {
    const address = await deployContract({
      artifact: planRegistryArtifact,
      common,
      from: owner,
      vm,
    })

    await writeContract({
      address,
      args: [bytes32(100), bytes32(101), bytes32(102), 'session-1', 'hashkey://report-anchor'],
      artifact: planRegistryArtifact,
      common,
      from: outsider,
      functionName: 'registerPlan',
      vm,
    })
    const record = await readContract<Record<string, unknown> & readonly unknown[]>({
      address,
      args: [bytes32(102)],
      artifact: planRegistryArtifact,
      from: owner,
      functionName: 'getPlan',
      vm,
    })
    sameAddress(String(record['submitter'] ?? record[2]), outsider.hex)
    expect(record['sessionId'] ?? record[4]).toBe('session-1')

    await expect(
      writeContract({
        address,
        args: [bytes32(100), bytes32(101), bytes32(102), 'session-1', 'hashkey://report-anchor'],
        artifact: planRegistryArtifact,
        common,
        from: owner,
        functionName: 'registerPlan',
        vm,
      }),
    ).rejects.toBeDefined()

    await expect(
      writeContract({
        address,
        args: [
          '0x0000000000000000000000000000000000000000000000000000000000000000',
          bytes32(201),
          bytes32(202),
          '',
          'hashkey://report-anchor',
        ],
        artifact: planRegistryArtifact,
        common,
        from: owner,
        functionName: 'registerPlan',
        vm,
      }),
    ).rejects.toBeDefined()

    await expect(
      readContract({
        address,
        args: [bytes32(999)],
        artifact: planRegistryArtifact,
        from: owner,
        functionName: 'getPlan',
        vm,
      }),
    ).rejects.toBeDefined()
  })
})
