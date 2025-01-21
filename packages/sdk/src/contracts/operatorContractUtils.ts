import { config as CHAIN_CONFIG } from '@streamr/config'
import { Logger, multiplyWeiAmount, WeiAmount } from '@streamr/utils'
import { Contract, EventLog, JsonRpcProvider, parseEther, Provider, Wallet, ZeroAddress } from 'ethers'
import { range } from 'lodash'
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
    generateWalletWithGasAndTokens: () => Promise<Wallet & SignerWithProvider>
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
    const operatorWallet = await opts.generateWalletWithGasAndTokens()
    const operatorContract = await deployOperatorContract({
        deployer: operatorWallet,
        operatorsCutPercentage: opts?.operatorConfig?.operatorsCutPercentage,
        metadata: opts?.operatorConfig?.metadata
    })
    const nodeWallets: (Wallet & SignerWithProvider)[] = []
    if ((opts?.nodeCount !== undefined) && (opts?.nodeCount > 0)) {
        for (const _ of range(opts.nodeCount)) {
            nodeWallets.push(await opts.generateWalletWithGasAndTokens())
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
    deployer: Wallet
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
    const contractAddress = await operatorFactory.operators(opts.deployer.address)
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
    deployer: Wallet
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
    amount: WeiAmount,
    token?: DATATokenContract
): Promise<void> => {
    logger.debug('Delegate', { amount: amount.toString() })
    // onTokenTransfer: the tokens are delegated on behalf of the given data address
    // eslint-disable-next-line max-len
    // https://github.com/streamr-dev/network-contracts/blob/01ec980cfe576e25e8c9acc08a57e1e4769f3e10/packages/network-contracts/contracts/OperatorTokenomics/Operator.sol#L233
    await transferTokens(delegator, operatorContractAddress, amount, await delegator.getAddress(), token)
}

export const undelegate = async (
    delegator: SignerWithProvider,
    operatorContract: OperatorContract,
    amount: WeiAmount
): Promise<void> => {
    await (await operatorContract.connect(delegator).undelegate(amount)).wait()
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
    amount: WeiAmount,
    token?: DATATokenContract
): Promise<void> => {
    logger.debug('Sponsor', { amount: amount.toString() })
    // eslint-disable-next-line max-len
    // https://github.com/streamr-dev/network-contracts/blob/01ec980cfe576e25e8c9acc08a57e1e4769f3e10/packages/network-contracts/contracts/OperatorTokenomics/Sponsorship.sol#L139
    await transferTokens(sponsorer, sponsorshipContractAddress, amount, undefined, token)
}

export const transferTokens = async (
    from: SignerWithProvider,
    to: string,
    amount: WeiAmount,
    data?: string,
    token?: DATATokenContract
): Promise<void> => {
    const tx = await ((token ?? getTestTokenContract()).connect(from).transferAndCall(to, amount, data ?? '0x'))
    await tx.wait()
}

export const getOperatorContract = (operatorAddress: string): OperatorContract => {
    return new Contract(operatorAddress, OperatorArtifact) as unknown as OperatorContract
}
