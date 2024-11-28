import { config as CHAIN_CONFIG } from '@streamr/config'
import { Logger, retry } from '@streamr/utils'
import { Contract, EventLog, JsonRpcProvider, Provider, Wallet, ZeroAddress, parseEther } from 'ethers'
import { range } from 'lodash'
import type { Operator as OperatorContract } from '../ethereumArtifacts/Operator'
import OperatorArtifact from '../ethereumArtifacts/OperatorAbi.json'
import type { OperatorFactory as OperatorFactoryContract } from '../ethereumArtifacts/OperatorFactory'
import OperatorFactoryArtifact from '../ethereumArtifacts/OperatorFactoryAbi.json'
import type { Sponsorship as SponsorshipContract } from '../ethereumArtifacts/Sponsorship'
import SponsorshipArtifact from '../ethereumArtifacts/SponsorshipAbi.json'
import type { SponsorshipFactory as SponsorshipFactoryContract } from '../ethereumArtifacts/SponsorshipFactory'
import SponsorshipFactoryArtifact from '../ethereumArtifacts/SponsorshipFactoryAbi.json'
import type { TestToken as TestTokenContract } from '../ethereumArtifacts/TestToken'
import TestTokenArtifact from '../ethereumArtifacts/TestTokenAbi.json'
import { SignerWithProvider } from '../Authentication'
import crypto from 'crypto'

const TEST_CHAIN_CONFIG = CHAIN_CONFIG.dev2

/**
 * @deprecated
 * @hidden
 */
export interface SetupTestOperatorContractOpts {
    nodeCount?: number
    operatorConfig?: {
        operatorsCutPercent?: number
        metadata?: string
    }
}

/**
 * @deprecated
 * @hidden
 */
export interface SetupOperatorContractReturnType {
    operatorWallet: Wallet
    operatorContract: OperatorContract
    nodeWallets: (Wallet & SignerWithProvider)[]
}

const logger = new Logger(module)

export async function setupTestOperatorContract(
    opts?: SetupTestOperatorContractOpts
): Promise<SetupOperatorContractReturnType> {
    const operatorWallet = await createTestWallet()
    const operatorContract = await deployTestOperatorContract({
        deployer: operatorWallet,
        operatorsCutPercent: opts?.operatorConfig?.operatorsCutPercent,
        metadata: opts?.operatorConfig?.metadata
    })
    const nodeWallets: (Wallet & SignerWithProvider)[] = []
    if ((opts?.nodeCount !== undefined) && (opts?.nodeCount > 0)) {
        for (const _ of range(opts.nodeCount)) {
            nodeWallets.push(await createTestWallet())
        }
        await (await operatorContract.setNodeAddresses(nodeWallets.map((w) => w.address))).wait()
    }
    return { operatorWallet, operatorContract, nodeWallets }
}

/**
 * @deprecated
 * @hidden
 */
export interface DeployTestOperatorContractOpts {
    deployer: Wallet
    operatorsCutPercent?: number
    metadata?: string
    operatorTokenName?: string
}

/**
 * @param opts.deployer should be the operator's Wallet
 * @returns Operator
 */
export async function deployTestOperatorContract(opts: DeployTestOperatorContractOpts): Promise<OperatorContract> {
    logger.debug('Deploying OperatorContract')
    const abi = OperatorFactoryArtifact
    const operatorFactory = new Contract(TEST_CHAIN_CONFIG.contracts.OperatorFactory, abi, opts.deployer) as unknown as OperatorFactoryContract
    const contractAddress = await operatorFactory.operators(opts.deployer.address)
    if (contractAddress !== ZeroAddress) {
        throw new Error('Operator already has a contract')
    }
    const operatorReceipt = await (await operatorFactory.deployOperator(
        parseEther('1') * BigInt(opts.operatorsCutPercent ?? 0) / 100n,
        opts.operatorTokenName ?? `OperatorToken-${Date.now()}`,
        opts.metadata ?? '',
        [
            TEST_CHAIN_CONFIG.contracts.OperatorDefaultDelegationPolicy,
            TEST_CHAIN_CONFIG.contracts.OperatorDefaultExchangeRatePolicy,
            TEST_CHAIN_CONFIG.contracts.OperatorDefaultUndelegationPolicy,
        ], [
            0,
            0,
            0,
        ]
    )).wait()
    const newSponsorshipEvent = operatorReceipt!.logs.find((l: any) => l.fragment?.name === 'NewOperator') as EventLog
    const newOperatorAddress = newSponsorshipEvent.args.operatorContractAddress
    const newOperator = new Contract(newOperatorAddress, OperatorArtifact, opts.deployer) as unknown as OperatorContract
    logger.debug('Deployed OperatorContract', { address: newOperatorAddress })
    return newOperator
}

/**
 * @deprecated
 * @hidden
 */
export interface DeployTestSponsorshipContractOpts {
    streamId: string
    deployer: Wallet
    minOperatorCount?: number
    earningsPerSecond?: bigint
    chainConfig?: {
        contracts: {
            SponsorshipFactory: string
            SponsorshipStakeWeightedAllocationPolicy: string
            SponsorshipDefaultLeavePolicy: string
            SponsorshipVoteKickPolicy: string
        }
    }
}

export async function deployTestSponsorshipContract(opts: DeployTestSponsorshipContractOpts): Promise<SponsorshipContract> {
    logger.debug('Deploying SponsorshipContract')
    const chainConfig = opts.chainConfig ?? CHAIN_CONFIG.dev2
    const sponsorshipFactory = new Contract(
        chainConfig.contracts.SponsorshipFactory,
        SponsorshipFactoryArtifact,
        opts.deployer
    ) as unknown as SponsorshipFactoryContract
    const sponsorshipDeployTx = await sponsorshipFactory.deploySponsorship(
        (opts.minOperatorCount ?? 1).toString(),
        opts.streamId,
        '{}',
        [
            chainConfig.contracts.SponsorshipStakeWeightedAllocationPolicy,
            chainConfig.contracts.SponsorshipDefaultLeavePolicy,
            chainConfig.contracts.SponsorshipVoteKickPolicy,
        ], [
            parseEther((opts.earningsPerSecond ?? 1).toString()).toString(),
            '0',
            '0',
        ]
    )
    const sponsorshipDeployReceipt = await sponsorshipDeployTx.wait()
    const newSponsorshipEvent = sponsorshipDeployReceipt!.logs.find((l: any) => l.fragment?.name === 'NewSponsorship') as EventLog
    const newSponsorshipAddress = newSponsorshipEvent.args.sponsorshipContract
    const newSponsorship = new Contract(newSponsorshipAddress, SponsorshipArtifact, opts.deployer) as unknown as SponsorshipContract
    logger.debug('Deployed SponsorshipContract', { address: newSponsorshipAddress })
    return newSponsorship
}

export function getProvider(): Provider {
    return new JsonRpcProvider(TEST_CHAIN_CONFIG.rpcEndpoints[0].url, undefined, {
        batchStallTime: 0,       // Don't batch requests, send them immediately
        cacheTimeout: -1         // Do not employ result caching
    })
}

export function getTestTokenContract(): TestTokenContract {
    return new Contract(TEST_CHAIN_CONFIG.contracts.DATA, TestTokenArtifact) as unknown as TestTokenContract
}

export const getTestAdminWallet = (adminKey?: string, provider?: Provider): Wallet => {
    return new Wallet(adminKey ?? TEST_CHAIN_CONFIG.adminPrivateKey).connect(provider ?? getProvider())
}

export async function createTestWallet(): Promise<Wallet & SignerWithProvider> {
    const provider = getProvider()
    const privateKey = crypto.randomBytes(32).toString('hex')
    const newWallet = new Wallet(privateKey)
    const adminWallet = getTestAdminWallet()
    const token = getTestTokenContract().connect(adminWallet)
    await retry(
        async () => {
            await (await token.mint(newWallet.address, parseEther('1000000'))).wait()
            await (await adminWallet.sendTransaction({
                to: newWallet.address,
                value: parseEther('1')
            })).wait()
        },
        (message: string, err: any) => {
            logger.debug(message, { err })
        },
        'Token minting',
        10,
        100
    )
    return newWallet.connect(provider) as (Wallet & SignerWithProvider)
}

export const delegate = async (delegator: Wallet, operatorContractAddress: string, amountWei: bigint, token?: TestTokenContract): Promise<void> => {
    logger.debug('Delegate', { amountWei })
    // onTokenTransfer: the tokens are delegated on behalf of the given data address
    // eslint-disable-next-line max-len
    // https://github.com/streamr-dev/network-contracts/blob/01ec980cfe576e25e8c9acc08a57e1e4769f3e10/packages/network-contracts/contracts/OperatorTokenomics/Operator.sol#L233
    await transferTokens(delegator, operatorContractAddress, amountWei, delegator.address, token)
}

export const undelegate = async (delegator: Wallet, operatorContract: OperatorContract, amount: bigint): Promise<void> => {
    await (await operatorContract.connect(delegator).undelegate(parseEther(amount.toString()))).wait()
}

export const stake = async (operatorContract: OperatorContract, sponsorshipContractAddress: string, amount: bigint): Promise<void> => {
    logger.debug('Stake', { amount })
    await (await operatorContract.stake(sponsorshipContractAddress, parseEther(amount.toString()))).wait()
}

export const unstake = async (operatorContract: OperatorContract, sponsorshipContractAddress: string): Promise<void> => {
    logger.debug('Unstake')
    await (await operatorContract.unstake(sponsorshipContractAddress)).wait()
}

export const sponsor = async (sponsorer: Wallet, sponsorshipContractAddress: string, amountWei: bigint, token?: TestTokenContract): Promise<void> => {
    logger.debug('Sponsor', { amountWei })
    // eslint-disable-next-line max-len
    // https://github.com/streamr-dev/network-contracts/blob/01ec980cfe576e25e8c9acc08a57e1e4769f3e10/packages/network-contracts/contracts/OperatorTokenomics/Sponsorship.sol#L139
    await transferTokens(sponsorer, sponsorshipContractAddress, amountWei, undefined, token)
}

export const transferTokens = async (from: Wallet, to: string, amountWei: bigint, data?: string, token?: TestTokenContract): Promise<void> => {
    const tx = await ((token ?? getTestTokenContract()).connect(from).transferAndCall(to, parseEther(amountWei.toString()), data ?? '0x'))
    await tx.wait()
}

export const getOperatorContract = (operatorAddress: string): OperatorContract => {
    return new Contract(operatorAddress, OperatorArtifact) as unknown as OperatorContract
}
