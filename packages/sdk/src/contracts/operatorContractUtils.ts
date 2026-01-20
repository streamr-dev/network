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
    SponsorshipFactoryABI
} from '@streamr/network-contracts'
import { Logger, multiplyWeiAmount, WeiAmount } from '@streamr/utils'
import {
    AbiCoder,
    BigNumberish,
    Contract,
    ContractTransactionReceipt,
    ContractTransactionResponse,
    EventLog,
    formatEther,
    Interface,
    parseEther,
    ZeroAddress
} from 'ethers'
import type { EnvironmentId } from '../ConfigTypes'
import type { SignerWithProvider } from '../identity/Identity'

const FRACTION_MAX = parseEther('1')

const logger = new Logger('operatorContractUtils')

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
    transactionTimeout?: number
}

/**
 * @deprecated
 * @hidden
 */
export interface TransactionOpts {
    gasLimit?: BigNumberish
    gasPrice?: BigNumberish
    nonce?: number
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
        ],
        [
            0,
            0,
            0
        ]
    )).wait(undefined, opts.transactionTimeout)
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
    maxOperatorCount?: number
    minStakeDuration?: number
    environmentId: EnvironmentId
    sponsorAmount?: WeiAmount
    transactionTimeout?: number
}

export async function deploySponsorshipContract(opts: DeploySponsorshipContractOpts): Promise<SponsorshipContract> {
    logger.debug('Deploying SponsorshipContract')
    const policies: { contractAddress: string, param: number | bigint }[] = [{
        contractAddress: CHAIN_CONFIG[opts.environmentId].contracts.SponsorshipStakeWeightedAllocationPolicy,
        param: opts.earningsPerSecond
    }, {
        contractAddress: CHAIN_CONFIG[opts.environmentId].contracts.SponsorshipDefaultLeavePolicy,
        param: opts.minStakeDuration ?? 0
    }, {
        contractAddress: CHAIN_CONFIG[opts.environmentId].contracts.SponsorshipVoteKickPolicy,
        param: 0
    }]
    if (opts.maxOperatorCount !== undefined) {
        policies.push({
            contractAddress: CHAIN_CONFIG[opts.environmentId].contracts.SponsorshipMaxOperatorsJoinPolicy,
            param: opts.maxOperatorCount
        })
    }
    const sponsorshipContractParams = AbiCoder.defaultAbiCoder().encode(
        ['uint32', 'string', 'string', 'address[]', 'uint[]'],
        [
            (opts.minOperatorCount ?? 1).toString(),
            opts.streamId,
            opts.metadata ?? '{}',
            policies.map((p) => p.contractAddress),
            policies.map((p) => p.param),
        ],
    )
    const deployTx = await getTokenContract(CHAIN_CONFIG[opts.environmentId].contracts.DATA)
        .connect(opts.deployer)
        .transferAndCall(
            CHAIN_CONFIG[opts.environmentId].contracts.SponsorshipFactory,
            opts.sponsorAmount ?? 0n,
            sponsorshipContractParams,
        )
    const deployReceipt = await deployTx.wait(undefined, opts.transactionTimeout)
    const factoryInterface = new Interface(SponsorshipFactoryABI)
    const newSponsorshipEvent = deployReceipt!.logs
        .map((log) => factoryInterface.parseLog(log))
        .find((p) => p?.name === 'NewSponsorship')!
    const sponsorshipAddress = newSponsorshipEvent.args.sponsorshipContract
    logger.debug('Deployed SponsorshipContract', { address: sponsorshipAddress })
    return new Contract(
        sponsorshipAddress,
        SponsorshipABI,
        opts.deployer,
    ) as unknown as SponsorshipContract
}

export const delegate = async (
    delegator: SignerWithProvider,
    operatorContractAddress: string,
    amount: WeiAmount,
    transactionTimeout?: number
): Promise<void> => {
    logger.debug('Delegate', { amount: amount.toString() })
    const tokenAddress = await getOperatorContract(operatorContractAddress).connect(delegator.provider).token()
    await transferTokens(delegator, operatorContractAddress, amount, tokenAddress, transactionTimeout)
}

export const undelegate = async (
    delegator: SignerWithProvider,
    operatorContractAddress: string,
    amount: WeiAmount,
    transactionTimeout?: number
): Promise<void> => {
    logger.debug('Undelegate', { amount: amount.toString() })
    await (await getOperatorContract(operatorContractAddress).connect(delegator).undelegate(amount)).wait(undefined, transactionTimeout)
}

export const stake = async (
    staker: SignerWithProvider,
    operatorContractAddress: string,
    sponsorshipContractAddress: string,
    amount: WeiAmount,
    txOpts: TransactionOpts = {},
    onSubmit: (tx: ContractTransactionResponse) => void = () => {},
    transactionTimeout?: number
): Promise<ContractTransactionReceipt | null> => {
    logger.debug('Stake', { amount: formatEther(amount), sponsorshipContractAddress })
    const operatorContract = getOperatorContract(operatorContractAddress).connect(staker)
    const tx = await operatorContract.stake(sponsorshipContractAddress, amount, txOpts)
    logger.debug('Stake: transaction submitted', { tx: tx.hash, nonce: tx.nonce })
    onSubmit(tx)
    logger.debug('Stake: waiting for transaction to be mined', { tx: tx.hash, timeout: transactionTimeout })
    try {
        const receipt = await tx.wait(undefined, transactionTimeout)
        logger.debug('Stake: confirmation received', { receipt: receipt?.hash })
        return receipt
    } catch (error) {
        logger.error(`Stake: error waiting for tx to be mined`, { tx: tx.hash, error })
        throw error
    }
}

export const unstake = async (
    staker: SignerWithProvider,
    operatorContractAddress: string,
    sponsorshipContractAddress: string,
    amount: WeiAmount,
    txOpts: TransactionOpts = {},
    onSubmit: (tx: ContractTransactionResponse) => void = () => {},
    transactionTimeout?: number
): Promise<ContractTransactionReceipt | null> => {
    logger.debug('Unstake', { amount: formatEther(amount), sponsorshipContractAddress })
    const operatorContract = getOperatorContract(operatorContractAddress).connect(staker)
    const sponsorshipContract = getSponsorshipContract(sponsorshipContractAddress).connect(staker)
    const currentAmount = await sponsorshipContract.stakedWei(operatorContractAddress)
    const targetAmount = currentAmount - amount

    const tx = await operatorContract.reduceStakeTo(sponsorshipContractAddress, targetAmount, txOpts)
    logger.debug('Unstake: transaction submitted', { tx: tx.hash, nonce: tx.nonce })
    onSubmit(tx)
    logger.debug('Unstake: waiting for transaction to be mined', { tx: tx.hash, timeout: transactionTimeout })
    try {
        const receipt = await tx.wait(undefined, transactionTimeout)
        logger.debug('Unstake: confirmation received', { receipt: receipt?.hash })
        return receipt
    } catch (error) {
        logger.error(`Unstake: error waiting for tx to be mined`, { tx: tx.hash, error })
        throw error
    }
}

export const sponsor = async (
    sponsorer: SignerWithProvider,
    sponsorshipContractAddress: string,
    amount: WeiAmount,
    transactionTimeout?: number
): Promise<void> => {
    logger.debug('Sponsor', { amount: amount.toString() })
    const tokenAddress = await getSponsorshipContract(sponsorshipContractAddress).connect(sponsorer.provider).token()
    await transferTokens(sponsorer, sponsorshipContractAddress, amount, tokenAddress, transactionTimeout)
}

export const transferTokens = async (
    from: SignerWithProvider,
    to: string,
    amount: WeiAmount,
    tokenAddress: string,
    transactionTimeout?: number
): Promise<void> => {
    const token = getTokenContract(tokenAddress)
    const tx = await token.connect(from).transferAndCall(to, amount, '0x')
    await tx.wait(undefined, transactionTimeout)
}

export const getOperatorContract = (operatorAddress: string): OperatorContract => {
    return new Contract(operatorAddress, OperatorABI) as unknown as OperatorContract
}

const getSponsorshipContract = (sponsorshipAddress: string): SponsorshipContract => {
    return new Contract(sponsorshipAddress, SponsorshipABI) as unknown as SponsorshipContract
}

const getTokenContract = (tokenAddress: string): DATATokenContract => {
    return new Contract(tokenAddress, DATATokenABI) as unknown as DATATokenContract
}
