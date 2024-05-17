import { ZeroAddress, Contract, JsonRpcProvider, Provider, parseEther, EventLog, NonceManager } from 'ethers'
import { config as CHAIN_CONFIG } from '@streamr/config'
import type { Operator, OperatorFactory, Sponsorship, SponsorshipFactory } from '@streamr/network-contracts-ethers6'
import { TestToken, operatorABI, operatorFactoryABI, sponsorshipABI, sponsorshipFactoryABI, tokenABI } from '@streamr/network-contracts-ethers6'
import { fastPrivateKey } from '@streamr/test-utils'
import { Logger, TheGraphClient, toEthereumAddress, retry } from '@streamr/utils'
import { Wallet } from 'ethers'
import { OperatorServiceConfig } from '../../../../src/plugins/operator/OperatorPlugin'
import { range } from 'lodash'
import fetch from 'node-fetch'

export const TEST_CHAIN_CONFIG = CHAIN_CONFIG.dev2

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
        operatorsCutPercent?: number
        metadata?: string
    }
}

export interface SetupOperatorContractReturnType {
    operatorWallet: Wallet
    operatorContract: Operator
    operatorServiceConfig: Omit<OperatorServiceConfig, 'signer'>
    nodeWallets: Wallet[]
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
        operatorsCutPercent: opts?.operatorConfig?.operatorsCutPercent,
        metadata: opts?.operatorConfig?.metadata
    })
    const nodeWallets: Wallet[] = []
    if ((opts?.nodeCount !== undefined) && (opts?.nodeCount > 0)) {
        for (const _ of range(opts.nodeCount)) {
            nodeWallets.push(await generateWalletWithGasAndTokens({
                chainConfig: opts?.chainConfig
            }))
        }
        await (await operatorContract.setNodeAddresses(nodeWallets.map((w) => w.address))).wait()
    }
    const operatorConfig = {
        operatorContractAddress: toEthereumAddress(await operatorContract.getAddress()),
        theGraphUrl: TEST_CHAIN_CONFIG.theGraphUrl,
        getEthersOverrides: () => ({})
    }
    return { operatorWallet, operatorContract, operatorServiceConfig: operatorConfig, nodeWallets }
}

interface DeployOperatorContractOpts {
    deployer: Wallet
    operatorsCutPercent?: number
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
export async function deployOperatorContract(opts: DeployOperatorContractOpts): Promise<Operator> {
    logger.debug('Deploying OperatorContract')
    const abi = operatorFactoryABI
    const chainConfig = opts.chainConfig ?? CHAIN_CONFIG.dev2
    const operatorFactory = new Contract(chainConfig.contracts.OperatorFactory, abi, opts.deployer) as unknown as OperatorFactory
    const contractAddress = await operatorFactory.operators(opts.deployer.address)
    if (contractAddress !== ZeroAddress) {
        throw new Error('Operator already has a contract')
    }
    const operatorReceipt = await (await operatorFactory.deployOperator(
        parseEther('1') * BigInt(opts.operatorsCutPercent ?? 0) / 100n,
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
    const newOperator = new Contract(newOperatorAddress, operatorABI, opts.deployer) as unknown as Operator
    logger.debug('Deployed OperatorContract', { address: newOperatorAddress })
    return newOperator
}

export interface DeploySponsorshipContractOpts {
    streamId: string
    deployer: Wallet
    metadata?: string
    minOperatorCount?: number
    earningsPerSecond?: number
    chainConfig?: {
        contracts: {
            SponsorshipFactory: string
            SponsorshipStakeWeightedAllocationPolicy: string
            SponsorshipDefaultLeavePolicy: string
            SponsorshipVoteKickPolicy: string
        }
    }
}

export async function deploySponsorshipContract(opts: DeploySponsorshipContractOpts): Promise<Sponsorship> {
    logger.debug('Deploying SponsorshipContract')
    const chainConfig = opts.chainConfig ?? CHAIN_CONFIG.dev2
    const sponsorshipFactory = new Contract(
        chainConfig.contracts.SponsorshipFactory,
        sponsorshipFactoryABI,
        opts.deployer
    ) as unknown as SponsorshipFactory
    const sponsorshipDeployTx = await sponsorshipFactory.deploySponsorship(
        (opts.minOperatorCount ?? 1).toString(),
        opts.streamId,
        opts.metadata ?? '{}',
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
    const newSponsorship = new Contract(newSponsorshipAddress, sponsorshipABI, opts.deployer) as unknown as Sponsorship
    logger.debug('Deployed SponsorshipContract', { address: newSponsorshipAddress })
    return newSponsorship
}

export function getProvider(): Provider {
    return new JsonRpcProvider(TEST_CHAIN_CONFIG.rpcEndpoints[0].url, undefined, {
        batchStallTime: 0,       // Don't batch requests, send them immediately
        cacheTimeout: -1         // Do not employ result caching
    })
}

export function getTokenContract(): TestToken {
    return new Contract(TEST_CHAIN_CONFIG.contracts.DATA, tokenABI) as unknown as TestToken
}

let cachedAdminWalletNonceManager: Wallet | undefined

// TODO: horrible hack to get things working, fix properly
export const getAdminWallet = (): Wallet => {
    if (cachedAdminWalletNonceManager === undefined) {
        cachedAdminWalletNonceManager = new Wallet(TEST_CHAIN_CONFIG.adminPrivateKey).connect(getProvider())
    }
    return cachedAdminWalletNonceManager
}

export const createTheGraphClient = (): TheGraphClient => {
    return new TheGraphClient({
        serverUrl: TEST_CHAIN_CONFIG.theGraphUrl,
        fetch,
        logger: new Logger(module)
    })
}

interface GenerateWalletWithGasAndTokensOpts {
    chainConfig?: { contracts: { DATA: string } }
}

export async function generateWalletWithGasAndTokens(opts?: GenerateWalletWithGasAndTokensOpts): Promise<Wallet> {
    const provider = getProvider()
    const newWallet = new Wallet(fastPrivateKey())
    const adminWallet = getAdminWallet()
    const token = (opts?.chainConfig !== undefined)
        ? new Contract(opts.chainConfig.contracts.DATA, tokenABI, adminWallet) as unknown as TestToken
        : getTokenContract().connect(adminWallet)
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
    return newWallet.connect(provider)
}

export const delegate = async (delegator: Wallet, operatorContractAddress: string, amount: number, token?: TestToken): Promise<void> => {
    logger.debug('Delegate', { amount })
    // onTokenTransfer: the tokens are delegated on behalf of the given data address
    // eslint-disable-next-line max-len
    // https://github.com/streamr-dev/network-contracts/blob/01ec980cfe576e25e8c9acc08a57e1e4769f3e10/packages/network-contracts/contracts/OperatorTokenomics/Operator.sol#L233
    await transferTokens(delegator, operatorContractAddress, amount, delegator.address, token)
}

export const stake = async (operatorContract: Operator, sponsorshipContractAddress: string, amount: number): Promise<void> => {
    logger.debug('Stake', { amount })
    await (await operatorContract.stake(sponsorshipContractAddress, parseEther(amount.toString()))).wait()
}

export const unstake = async (operatorContract: Operator, sponsorshipContractAddress: string): Promise<void> => {
    logger.debug('Unstake')
    await (await operatorContract.unstake(sponsorshipContractAddress)).wait()
}

export const sponsor = async (sponsorer: Wallet, sponsorshipContractAddress: string, amount: number, token?: TestToken): Promise<void> => {
    logger.debug('Sponsor', { amount })
    // eslint-disable-next-line max-len
    // https://github.com/streamr-dev/network-contracts/blob/01ec980cfe576e25e8c9acc08a57e1e4769f3e10/packages/network-contracts/contracts/OperatorTokenomics/Sponsorship.sol#L139
    await transferTokens(sponsorer, sponsorshipContractAddress, amount, undefined, token)
}

export const transferTokens = async (from: Wallet, to: string, amount: number, data?: string, token?: TestToken): Promise<void> => {
    const tx = await ((token ?? getTokenContract()).connect(from).transferAndCall(to, parseEther(amount.toString()), data ?? '0x'))
    await tx.wait()
}
