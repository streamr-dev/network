import { config as CHAIN_CONFIG } from '@streamr/config'
import { Logger, multiplyWeiAmount, WeiAmount } from '@streamr/utils'
import { Contract, EventLog, JsonRpcProvider, parseEther, Provider, Wallet, ZeroAddress } from 'ethers'
import range from 'lodash/range'
import { SignerWithProvider } from '../Authentication'
import type { DATAv2 as DATATokenContract } from '../ethereumArtifacts/DATAv2'
import DATATokenArtifact from '../ethereumArtifacts/DATAv2Abi.json'
import type { Operator as OperatorContract } from '../ethereumArtifacts/Operator'
import OperatorArtifact from '../ethereumArtifacts/OperatorAbi.json'
import type { OperatorFactory as OperatorFactoryContract } from '../ethereumArtifacts/OperatorFactory'
import OperatorFactoryArtifact from '../ethereumArtifacts/OperatorFactoryAbi.json'
import type { Sponsorship as SponsorshipContract } from '../ethereumArtifacts/Sponsorship'
import SponsorshipArtifact from '../ethereumArtifacts/SponsorshipAbi.json'
import type { SponsorshipFactory as SponsorshipFactoryContract } from '../ethereumArtifacts/SponsorshipFactory'
import SponsorshipFactoryArtifact from '../ethereumArtifacts/SponsorshipFactoryAbi.json'

const TEST_CHAIN_CONFIG = CHAIN_CONFIG.dev2
const FRACTION_MAX = parseEther('1')

/**
 * @deprecated
 * @hidden
 */
export interface SetupOperatorContractOpts {
    nodeCount?: number
    operatorConfig?: {
        operatorsCutPercentage?: number
        metadata?: string
    }
    createTestWallet: (opts?: { gas?: boolean, tokens?: boolean }) => Promise<Wallet & SignerWithProvider>
}

/**
 * @deprecated
 * @hidden
 */
export interface SetupOperatorContractReturnType {
    operatorWallet: Wallet & SignerWithProvider
    operatorContract: OperatorContract
    nodeWallets: (Wallet & SignerWithProvider)[]
}

const logger = new Logger(module)

export async function setupOperatorContract(
    opts: SetupOperatorContractOpts
): Promise<SetupOperatorContractReturnType> {
    const operatorWallet = await opts.createTestWallet({ gas: true, tokens: true })
    const operatorContract = await deployOperatorContract({
        deployer: operatorWallet,
        operatorsCutPercentage: opts?.operatorConfig?.operatorsCutPercentage,
        metadata: opts?.operatorConfig?.metadata
    })
    const nodeWallets: (Wallet & SignerWithProvider)[] = []
    if ((opts?.nodeCount !== undefined) && (opts?.nodeCount > 0)) {
        for (const _ of range(opts.nodeCount)) {
            nodeWallets.push(await opts.createTestWallet({ gas: true, tokens: true }))
        }
        await (await operatorContract.setNodeAddresses(nodeWallets.map((w) => w.address))).wait()
    }
    return { operatorWallet, operatorContract, nodeWallets }
}

/**
 * @deprecated
 * @hidden
 */
export interface DeployOperatorContractOpts {
    deployer: SignerWithProvider
    operatorsCutPercentage?: number
    metadata?: string
    operatorTokenName?: string
}

/**
 * @param opts.deployer should be the operator's Wallet
 * @returns Operator
 */
export async function deployOperatorContract(opts: DeployOperatorContractOpts): Promise<OperatorContract> {
    logger.debug('Deploying OperatorContract')
    const abi = OperatorFactoryArtifact
    const operatorFactory = new Contract(TEST_CHAIN_CONFIG.contracts.OperatorFactory, abi, opts.deployer) as unknown as OperatorFactoryContract
    const contractAddress = await operatorFactory.operators(await opts.deployer.getAddress())
    if (contractAddress !== ZeroAddress) {
        throw new Error('Operator already has a contract')
    }
    const operatorReceipt = await (await operatorFactory.deployOperator(
        multiplyWeiAmount(FRACTION_MAX, ((opts.operatorsCutPercentage ?? 0) / 100)),
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
export interface DeploySponsorshipContractOpts {
    streamId: string
    deployer: SignerWithProvider
    metadata?: string
    minOperatorCount?: number
    earningsPerSecond?: WeiAmount
}

export async function deploySponsorshipContract(opts: DeploySponsorshipContractOpts): Promise<SponsorshipContract> {
    logger.debug('Deploying SponsorshipContract')
    const sponsorshipFactory = new Contract(
        TEST_CHAIN_CONFIG.contracts.SponsorshipFactory,
        SponsorshipFactoryArtifact,
        opts.deployer
    ) as unknown as SponsorshipFactoryContract
    const sponsorshipDeployTx = await sponsorshipFactory.deploySponsorship(
        (opts.minOperatorCount ?? 1).toString(),
        opts.streamId,
        opts.metadata ?? '{}',
        [
            TEST_CHAIN_CONFIG.contracts.SponsorshipStakeWeightedAllocationPolicy,
            TEST_CHAIN_CONFIG.contracts.SponsorshipDefaultLeavePolicy,
            TEST_CHAIN_CONFIG.contracts.SponsorshipVoteKickPolicy,
        ], [
            opts.earningsPerSecond ?? parseEther('1'),
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

export function getTestTokenContract(): DATATokenContract {
    return new Contract(TEST_CHAIN_CONFIG.contracts.DATA, DATATokenArtifact) as unknown as DATATokenContract
}

export const getTestAdminWallet = (adminKey?: string, provider?: Provider): Wallet => {
    return new Wallet(adminKey ?? TEST_CHAIN_CONFIG.adminPrivateKey).connect(provider ?? getProvider())
}

export const delegate = async (
    delegator: SignerWithProvider,
    operatorContractAddress: string,
    amount: WeiAmount
): Promise<void> => {
    logger.debug('Delegate', { amount: amount.toString() })
    const tokenAddress = await getOperatorContract(operatorContractAddress).connect(delegator.provider).token()
    await transferTokens(delegator, operatorContractAddress, amount, tokenAddress)
}

export const undelegate = async (
    delegator: SignerWithProvider,
    operatorContractAddress: string,
    amount: WeiAmount
): Promise<void> => {    
    logger.debug('Undelegate', { amount: amount.toString() })
    await (await getOperatorContract(operatorContractAddress).connect(delegator).undelegate(amount)).wait()
}

export const stake = async (
    operatorContract: OperatorContract,
    sponsorshipContractAddress: string,
    amount: WeiAmount
): Promise<void> => {
    logger.debug('Stake', { amount: amount.toString() })
    await (await operatorContract.stake(sponsorshipContractAddress, amount)).wait()
}

export const unstake = async (
    operatorContract: OperatorContract,
    sponsorshipContractAddress: string
): Promise<void> => {
    logger.debug('Unstake')
    await (await operatorContract.unstake(sponsorshipContractAddress)).wait()
}

export const sponsor = async (
    sponsorer: SignerWithProvider,
    sponsorshipContractAddress: string,
    amount: WeiAmount
): Promise<void> => {
    logger.debug('Sponsor', { amount: amount.toString() })
    const tokenAddress = await getSponsorshipContract(sponsorshipContractAddress).connect(sponsorer.provider).token()
    await transferTokens(sponsorer, sponsorshipContractAddress, amount, tokenAddress)
}

export const transferTokens = async (
    from: SignerWithProvider,
    to: string,
    amount: WeiAmount,
    tokenAddress: string
): Promise<void> => {
    const token = new Contract(tokenAddress, DATATokenArtifact) as unknown as DATATokenContract
    const tx = await token.connect(from).transferAndCall(to, amount, '0x')
    await tx.wait()
}

export const getOperatorContract = (operatorAddress: string): OperatorContract => {
    return new Contract(operatorAddress, OperatorArtifact) as unknown as OperatorContract
}

const getSponsorshipContract = (sponsorshipAddress: string): SponsorshipContract => {
    return new Contract(sponsorshipAddress, SponsorshipArtifact) as unknown as SponsorshipContract
}
