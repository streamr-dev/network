import { AddressZero } from '@ethersproject/constants'
import { Contract } from '@ethersproject/contracts'
import { JsonRpcProvider, Provider } from '@ethersproject/providers'
import { parseEther } from '@ethersproject/units'
import { config as CHAIN_CONFIG } from '@streamr/config'
import type { Operator, OperatorFactory, Sponsorship, SponsorshipFactory } from '@streamr/network-contracts'
import { TestToken, operatorABI, operatorFactoryABI, sponsorshipABI, sponsorshipFactoryABI, tokenABI } from '@streamr/network-contracts'
import { fastPrivateKey } from '@streamr/test-utils'
import { toEthereumAddress } from '@streamr/utils'
import { BigNumber, Wallet } from 'ethers'
import { OperatorServiceConfig } from '../../../../src/plugins/operator/OperatorPlugin'
import { range } from 'lodash'

export const TEST_CHAIN_CONFIG = CHAIN_CONFIG.dev2

export interface SetupOperatorContractOpts {
    nodeCount?: number
    adminKey?: string
    provider?: Provider
    chainConfig?: {
        contracts: {
            DATA: string
            OperatorFactory: string
            OperatorDefaultDelegationPolicy: string
            OperatorDefaultPoolYieldPolicy: string
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

export async function setupOperatorContract(
    opts?: SetupOperatorContractOpts
): Promise<SetupOperatorContractReturnType> {
    const operatorWallet = await generateWalletWithGasAndTokens({
        provider: opts?.provider,
        chainConfig: opts?.chainConfig,
        adminKey: opts?.adminKey
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
                provider: opts?.provider,
                chainConfig: opts?.chainConfig,
                adminKey: opts?.adminKey
            }))
        }
        await (await operatorContract.setNodeAddresses(nodeWallets.map((w) => w.address))).wait()
    }
    const operatorConfig = {
        operatorContractAddress: toEthereumAddress(operatorContract.address),
        theGraphUrl: TEST_CHAIN_CONFIG.theGraphUrl,
    }
    return { operatorWallet, operatorContract, operatorServiceConfig: operatorConfig, nodeWallets }
}

interface DeployOperatorContractOpts {
    deployer: Wallet
    operatorsCutPercent?: number
    metadata?: string
    poolTokenName?: string
    chainConfig?: {
        contracts: {
            OperatorFactory: string
            OperatorDefaultDelegationPolicy: string
            OperatorDefaultPoolYieldPolicy: string
            OperatorDefaultUndelegationPolicy: string
        }
    }
}

/**
 * @param opts.deployer should be the operator's Wallet
 * @returns Operator
 */
export async function deployOperatorContract(opts: DeployOperatorContractOpts): Promise<Operator> {
    const abi = operatorFactoryABI
    const chainConfig = opts.chainConfig ?? CHAIN_CONFIG.dev2
    const operatorFactory = new Contract(chainConfig.contracts.OperatorFactory, abi, opts.deployer) as unknown as OperatorFactory
    const contractAddress = await operatorFactory.operators(opts.deployer.address)
    if (contractAddress !== AddressZero) {
        throw new Error('Operator already has a contract')
    }
    const operatorReceipt = await (await operatorFactory.deployOperator(
        parseEther('1').mul(opts.operatorsCutPercent ?? 0).div(100),
        opts.poolTokenName ?? `Pool-${Date.now()}`,
        opts.metadata ?? '',
        [
            chainConfig.contracts.OperatorDefaultDelegationPolicy,
            chainConfig.contracts.OperatorDefaultPoolYieldPolicy,
            chainConfig.contracts.OperatorDefaultUndelegationPolicy,
        ], [
            0,
            0,
            0,
        ]
    )).wait()
    const newOperatorAddress = operatorReceipt.events?.find((e) => e.event === 'NewOperator')?.args?.operatorContractAddress
    const newOperator = new Contract(newOperatorAddress, operatorABI, opts.deployer) as unknown as Operator
    return newOperator
}

export interface DeploySponsorshipContractOpts {
    streamId: string
    deployer: Wallet
    metadata?: string
    minOperatorCount?: number
    earningsPerSecond?: BigNumber
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
            (opts.earningsPerSecond ?? parseEther('0.01')).toString(),
            '0',
            '0',
        ]
    )
    const sponsorshipDeployReceipt = await sponsorshipDeployTx.wait() 
    const newSponsorshipEvent = sponsorshipDeployReceipt.events?.find((e) => e.event === 'NewSponsorship')
    const newSponsorshipAddress = newSponsorshipEvent?.args?.sponsorshipContract
    const newSponsorship = new Contract(newSponsorshipAddress, sponsorshipABI, opts.deployer) as unknown as Sponsorship
    return newSponsorship
}

export function getProvider(): Provider {
    return new JsonRpcProvider(TEST_CHAIN_CONFIG.rpcEndpoints[0].url)
}

export function getTokenContract(): TestToken {
    return new Contract(TEST_CHAIN_CONFIG.contracts.DATA, tokenABI) as unknown as TestToken
}

export const getAdminWallet = (adminKey?: string, provider?: Provider): Wallet => {
    return new Wallet(adminKey ?? TEST_CHAIN_CONFIG.adminPrivateKey).connect(provider ?? getProvider())
}

interface GenerateWalletWithGasAndTokensOpts {
    provider?: Provider
    chainConfig?: { contracts: { DATA: string } }
    adminKey?: string
}

export async function generateWalletWithGasAndTokens(opts?: GenerateWalletWithGasAndTokensOpts): Promise<Wallet> {
    const provider = opts?.provider ?? getProvider()
    const newWallet = new Wallet(fastPrivateKey())
    const adminWallet = getAdminWallet(opts?.adminKey, opts?.provider)
    const token = (opts?.chainConfig !== undefined)
        ? new Contract(opts.chainConfig.contracts.DATA, tokenABI, adminWallet) as unknown as TestToken
        : getTokenContract().connect(adminWallet)
    await (await token.mint(newWallet.address, parseEther('1000000'), {
        nonce: await adminWallet.getTransactionCount()
    })).wait()
    await (await adminWallet.sendTransaction({
        to: newWallet.address,
        value: parseEther('1')
    })).wait()
    return newWallet.connect(provider)
}

export const delegate = async (delegator: Wallet, operatorContractAddress: string, amount: number, token?: TestToken): Promise<void> => {
    // onTokenTransfer: the tokens are delegated on behalf of the given data address
    // eslint-disable-next-line max-len
    // https://github.com/streamr-dev/network-contracts/blob/01ec980cfe576e25e8c9acc08a57e1e4769f3e10/packages/network-contracts/contracts/OperatorTokenomics/Operator.sol#L233
    await transferTokens(delegator, operatorContractAddress, amount, delegator.address, token)
}

export const stake = async (operatorContract: Operator, sponsorshipContractAddress: string, amount: number): Promise<void> => {
    await (await operatorContract.stake(sponsorshipContractAddress, parseEther(amount.toString()))).wait()
}

export const unstake = async (operatorContract: Operator, sponsorshipContractAddress: string): Promise<void> => {
    await (await operatorContract.unstake(sponsorshipContractAddress)).wait()
}

export const sponsor = async (sponsorer: Wallet, sponsorshipContractAddress: string, amount: number, token?: TestToken): Promise<void> => {
    // eslint-disable-next-line max-len
    // https://github.com/streamr-dev/network-contracts/blob/01ec980cfe576e25e8c9acc08a57e1e4769f3e10/packages/network-contracts/contracts/OperatorTokenomics/Sponsorship.sol#L139
    await transferTokens(sponsorer, sponsorshipContractAddress, amount, undefined, token)
}

export const transferTokens = async (from: Wallet, to: string, amount: number, data?: string, token?: TestToken): Promise<void> => {
    const tx = await ((token ?? getTokenContract()).connect(from).transferAndCall(to, parseEther(amount.toString()), data ?? '0x'))
    await tx.wait()
}
