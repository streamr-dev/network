import { config as CHAIN_CONFIG } from '@streamr/config'
import {
    DATAv2ABI as DATATokenABI,
    DATAv2 as DATATokenContract,
    OperatorABI,
    Operator as OperatorContract,
    OperatorFactoryABI,
    OperatorFactory as OperatorFactoryContract,
    SponsorshipABI,
    Sponsorship as SponsorshipContract,
    SponsorshipFactoryABI,
    SponsorshipFactory as SponsorshipFactoryContract
} from '@streamr/network-contracts'
import { Logger, multiplyWeiAmount, WeiAmount } from '@streamr/utils'
import { Contract, EventLog, parseEther, ZeroAddress } from 'ethers'
import { EnvironmentId } from '../Config'
import { SignerWithProvider } from '../identity/Identity'

const FRACTION_MAX = parseEther('1')

const logger = new Logger(module)

/**
 * @deprecated
 * @hidden
 */
export interface DeployOperatorContractOpts {
    deployer: SignerWithProvider
    operatorsCutPercentage?: number
    metadata?: string
    operatorTokenName?: string
    environmentId: EnvironmentId
}

/**
 * @param opts.deployer should be the operator's Wallet
 * @returns Operator
 */
export async function deployOperatorContract(opts: DeployOperatorContractOpts): Promise<OperatorContract> {
    logger.debug('Deploying OperatorContract')
    const operatorFactory = new Contract(
        CHAIN_CONFIG[opts.environmentId].contracts.OperatorFactory,
        OperatorFactoryABI, opts.deployer
    ) as unknown as OperatorFactoryContract
    const contractAddress = await operatorFactory.operators(await opts.deployer.getAddress())
    if (contractAddress !== ZeroAddress) {
        throw new Error('Operator already has a contract')
    }
    const operatorReceipt = await (await operatorFactory.deployOperator(
        multiplyWeiAmount(FRACTION_MAX, ((opts.operatorsCutPercentage ?? 0) / 100)),
        opts.operatorTokenName ?? `OperatorToken-${Date.now()}`,
        opts.metadata ?? '',
        [
            CHAIN_CONFIG[opts.environmentId].contracts.OperatorDefaultDelegationPolicy,
            CHAIN_CONFIG[opts.environmentId].contracts.OperatorDefaultExchangeRatePolicy,
            CHAIN_CONFIG[opts.environmentId].contracts.OperatorDefaultUndelegationPolicy,
        ], [
            0,
            0,
            0,
        ]
    )).wait()
    const newSponsorshipEvent = operatorReceipt!.logs.find((l: any) => l.fragment?.name === 'NewOperator') as EventLog
    const newOperatorAddress = newSponsorshipEvent.args.operatorContractAddress
    const newOperator = new Contract(newOperatorAddress, OperatorABI, opts.deployer) as unknown as OperatorContract
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
    earningsPerSecond: WeiAmount
    minOperatorCount?: number
    environmentId: EnvironmentId
}

export async function deploySponsorshipContract(opts: DeploySponsorshipContractOpts): Promise<SponsorshipContract> {
    logger.debug('Deploying SponsorshipContract')
    const sponsorshipFactory = new Contract(
        CHAIN_CONFIG[opts.environmentId].contracts.SponsorshipFactory,
        SponsorshipFactoryABI,
        opts.deployer
    ) as unknown as SponsorshipFactoryContract
    const sponsorshipDeployTx = await sponsorshipFactory.deploySponsorship(
        (opts.minOperatorCount ?? 1).toString(),
        opts.streamId,
        opts.metadata ?? '{}',
        [
            CHAIN_CONFIG[opts.environmentId].contracts.SponsorshipStakeWeightedAllocationPolicy,
            CHAIN_CONFIG[opts.environmentId].contracts.SponsorshipDefaultLeavePolicy,
            CHAIN_CONFIG[opts.environmentId].contracts.SponsorshipVoteKickPolicy,
        ], [
            opts.earningsPerSecond,
            '0',
            '0',
        ]
    )
    const sponsorshipDeployReceipt = await sponsorshipDeployTx.wait()
    const newSponsorshipEvent = sponsorshipDeployReceipt!.logs.find((l: any) => l.fragment?.name === 'NewSponsorship') as EventLog
    const newSponsorshipAddress = newSponsorshipEvent.args.sponsorshipContract
    const newSponsorship = new Contract(newSponsorshipAddress, SponsorshipABI, opts.deployer) as unknown as SponsorshipContract
    logger.debug('Deployed SponsorshipContract', { address: newSponsorshipAddress })
    return newSponsorship
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
    staker: SignerWithProvider,
    operatorContractAddress: string,
    sponsorshipContractAddress: string,
    amount: WeiAmount
): Promise<void> => {
    logger.debug('Stake', { amount: amount.toString() })
    const contract = getOperatorContract(operatorContractAddress).connect(staker)
    await (await contract.stake(sponsorshipContractAddress, amount)).wait()
}

export const unstake = async (
    staker: SignerWithProvider,
    operatorContractAddress: string,
    sponsorshipContractAddress: string
): Promise<void> => {
    logger.debug('Unstake')
    const contract = getOperatorContract(operatorContractAddress).connect(staker)
    await (await contract.unstake(sponsorshipContractAddress)).wait()
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
    const token = new Contract(tokenAddress, DATATokenABI) as unknown as DATATokenContract
    const tx = await token.connect(from).transferAndCall(to, amount, '0x')
    await tx.wait()
}

export const getOperatorContract = (operatorAddress: string): OperatorContract => {
    return new Contract(operatorAddress, OperatorABI) as unknown as OperatorContract
}

const getSponsorshipContract = (sponsorshipAddress: string): SponsorshipContract => {
    return new Contract(sponsorshipAddress, SponsorshipABI) as unknown as SponsorshipContract
}
