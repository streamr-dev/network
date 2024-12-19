import { config as CHAIN_CONFIG } from '@streamr/config'
import { Logger, multiplyWeiAmount, retry } from '@streamr/utils'
import { Contract, EventLog, JsonRpcProvider, Provider, Wallet, ZeroAddress, formatUnits, parseEther } from 'ethers'
import { range } from 'lodash'
import type { Operator as OperatorContract } from '../ethereumArtifacts/Operator'
import OperatorArtifact from '../ethereumArtifacts/OperatorAbi.json'
import type { OperatorFactory as OperatorFactoryContract } from '../ethereumArtifacts/OperatorFactory'
import OperatorFactoryArtifact from '../ethereumArtifacts/OperatorFactoryAbi.json'
import type { Sponsorship as SponsorshipContract } from '../ethereumArtifacts/Sponsorship'
import SponsorshipArtifact from '../ethereumArtifacts/SponsorshipAbi.json'
import type { SponsorshipFactory as SponsorshipFactoryContract } from '../ethereumArtifacts/SponsorshipFactory'
import SponsorshipFactoryArtifact from '../ethereumArtifacts/SponsorshipFactoryAbi.json'
import type { DATAv2 as DATATokenContract } from '../ethereumArtifacts/DATAv2'
import DATATokenArtifact from '../ethereumArtifacts/DATAv2Abi.json'
import { SignerWithProvider } from '../Authentication'
import crypto from 'crypto'

const TEST_CHAIN_CONFIG = CHAIN_CONFIG.dev2
const FRACTION_MAX = parseEther('1')

/**
 * @deprecated
 * @hidden
 */
export interface SetupOperatorContractOpts {
    nodeCount?: number
    chainConfig?: {
        contracts: {
            DATA: string
            OperatorFactory: string
            OperatorDefaultDelegationPolicy: string
            OperatorDefaultExchangeRatePolicy: string
            OperatorDefaultUndelegationPolicy: string
        }
    }
    operatorConfig?: {
        operatorsCutPercentage?: number
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

export async function setupOperatorContract(
    opts?: SetupOperatorContractOpts
): Promise<SetupOperatorContractReturnType> {
    const operatorWallet = await generateWalletWithGasAndTokens({
        chainConfig: opts?.chainConfig
    })
    const operatorContract = await deployOperatorContract({
        chainConfig: opts?.chainConfig ?? TEST_CHAIN_CONFIG,
        deployer: operatorWallet,
        operatorsCutPercentage: opts?.operatorConfig?.operatorsCutPercentage,
        metadata: opts?.operatorConfig?.metadata
    })
    const nodeWallets: (Wallet & SignerWithProvider)[] = []
    if ((opts?.nodeCount !== undefined) && (opts?.nodeCount > 0)) {
        for (const _ of range(opts.nodeCount)) {
            nodeWallets.push(await generateWalletWithGasAndTokens({
                chainConfig: opts?.chainConfig
            }))
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
    chainConfig?: {
        contracts: {
            OperatorFactory: string
            OperatorDefaultDelegationPolicy: string
            OperatorDefaultExchangeRatePolicy: string
            OperatorDefaultUndelegationPolicy: string
        }
    }
}

/**
 * @param opts.deployer should be the operator's Wallet
 * @returns Operator
 */
export async function deployOperatorContract(opts: DeployOperatorContractOpts): Promise<OperatorContract> {
    logger.debug('Deploying OperatorContract')
    const abi = OperatorFactoryArtifact
    const chainConfig = opts.chainConfig ?? CHAIN_CONFIG.dev2
    const operatorFactory = new Contract(chainConfig.contracts.OperatorFactory, abi, opts.deployer) as unknown as OperatorFactoryContract
    const contractAddress = await operatorFactory.operators(opts.deployer.address)
    if (contractAddress !== ZeroAddress) {
        throw new Error('Operator already has a contract')
    }
    const operatorReceipt = await (await operatorFactory.deployOperator(
        multiplyWeiAmount(FRACTION_MAX, ((opts.operatorsCutPercentage ?? 0) / 100)),
        opts.operatorTokenName ?? `OperatorToken-${Date.now()}`,
        opts.metadata ?? '',
        [
            chainConfig.contracts.OperatorDefaultDelegationPolicy,
            chainConfig.contracts.OperatorDefaultExchangeRatePolicy,
            chainConfig.contracts.OperatorDefaultUndelegationPolicy,
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
    earningsPerSecondInWei?: bigint
    chainConfig?: {
        contracts: {
            SponsorshipFactory: string
            SponsorshipStakeWeightedAllocationPolicy: string
            SponsorshipDefaultLeavePolicy: string
            SponsorshipVoteKickPolicy: string
        }
    }
}

export async function deploySponsorshipContract(opts: DeploySponsorshipContractOpts): Promise<SponsorshipContract> {
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
        opts.metadata ?? '{}',
        [
            chainConfig.contracts.SponsorshipStakeWeightedAllocationPolicy,
            chainConfig.contracts.SponsorshipDefaultLeavePolicy,
            chainConfig.contracts.SponsorshipVoteKickPolicy,
        ], [
            opts.earningsPerSecondInWei ?? parseEther('1'),
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

interface GenerateWalletWithGasAndTokensOpts {
    chainConfig?: { contracts: { DATA: string } }
}

export async function generateWalletWithGasAndTokens(opts?: GenerateWalletWithGasAndTokensOpts): Promise<Wallet & SignerWithProvider> {
    const provider = getProvider()
    const privateKey = crypto.randomBytes(32).toString('hex')
    const newWallet = new Wallet(privateKey)
    const adminWallet = getTestAdminWallet()
    const token = (opts?.chainConfig !== undefined)
        ? new Contract(opts.chainConfig.contracts.DATA, DATATokenArtifact, adminWallet) as unknown as DATATokenContract
        : getTestTokenContract().connect(adminWallet)
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

export const delegate = async (delegator: Wallet, operatorContractAddress: string, amountWei: bigint, token?: DATATokenContract): Promise<void> => {
    logger.debug('Delegate', { amountWei: formatUnits(amountWei, 'wei') })
    // onTokenTransfer: the tokens are delegated on behalf of the given data address
    // eslint-disable-next-line max-len
    // https://github.com/streamr-dev/network-contracts/blob/01ec980cfe576e25e8c9acc08a57e1e4769f3e10/packages/network-contracts/contracts/OperatorTokenomics/Operator.sol#L233
    await transferTokens(delegator, operatorContractAddress, amountWei, delegator.address, token)
}

export const undelegate = async (delegator: Wallet, operatorContract: OperatorContract, amountWei: bigint): Promise<void> => {
    await (await operatorContract.connect(delegator).undelegate(amountWei)).wait()
}

export const stake = async (operatorContract: OperatorContract, sponsorshipContractAddress: string, amountWei: bigint): Promise<void> => {
    logger.debug('Stake', { amountWei: formatUnits(amountWei, 'wei') })
    await (await operatorContract.stake(sponsorshipContractAddress, amountWei)).wait()
}

export const unstake = async (operatorContract: OperatorContract, sponsorshipContractAddress: string): Promise<void> => {
    logger.debug('Unstake')
    await (await operatorContract.unstake(sponsorshipContractAddress)).wait()
}

export const sponsor = async (sponsorer: Wallet, sponsorshipContractAddress: string, amountWei: bigint, token?: DATATokenContract): Promise<void> => {
    logger.debug('Sponsor', { amountWei: formatUnits(amountWei, 'wei') })
    // eslint-disable-next-line max-len
    // https://github.com/streamr-dev/network-contracts/blob/01ec980cfe576e25e8c9acc08a57e1e4769f3e10/packages/network-contracts/contracts/OperatorTokenomics/Sponsorship.sol#L139
    await transferTokens(sponsorer, sponsorshipContractAddress, amountWei, undefined, token)
}

export const transferTokens = async (from: Wallet, to: string, amountWei: bigint, data?: string, token?: DATATokenContract): Promise<void> => {
    const tx = await ((token ?? getTestTokenContract()).connect(from).transferAndCall(to, amountWei, data ?? '0x'))
    await tx.wait()
}

export const getOperatorContract = (operatorAddress: string): OperatorContract => {
    return new Contract(operatorAddress, OperatorArtifact) as unknown as OperatorContract
}
