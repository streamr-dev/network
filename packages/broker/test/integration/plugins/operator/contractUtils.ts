import { AddressZero } from '@ethersproject/constants'
import { Contract } from '@ethersproject/contracts'
import { JsonRpcProvider, Provider } from '@ethersproject/providers'
import { parseEther } from '@ethersproject/units'
import { config as CHAIN_CONFIG } from '@streamr/config'
import type { Operator, OperatorFactory, Sponsorship, SponsorshipFactory } from '@streamr/network-contracts'
import { TestToken, operatorABI, operatorFactoryABI, sponsorshipABI, sponsorshipFactoryABI, tokenABI } from '@streamr/network-contracts'
import { fastPrivateKey } from '@streamr/test-utils'
import { toEthereumAddress } from '@streamr/utils'
import { BigNumber, ContractReceipt, Wallet } from 'ethers'
import { OperatorServiceConfig } from '../../../../src/plugins/operator/OperatorPlugin'
import { range } from 'lodash'

const TEST_CHAIN = 'dev2'
// TODO read from config when https://github.com/streamr-dev/network-contracts/pull/604 
export const THE_GRAPH_URL = `http://${process.env.STREAMR_DOCKER_DEV_HOST ?? '10.200.10.1'}:8800/subgraphs/name/streamr-dev/network-subgraphs`

export interface SetupOperatorContractOpts {
    nodeCount?: number
    adminKey?: string
    provider?: Provider
    // eslint-disable-next-line max-len
    chainConfig?: { contracts: { DATA: string, OperatorFactory: string, OperatorDefaultDelegationPolicy: string, OperatorDefaultPoolYieldPolicy: string, OperatorDefaultUndelegationPolicy: string } }
}

export async function setupOperatorContract(
    opts?: SetupOperatorContractOpts
): Promise<{ operatorWallet: Wallet, operatorContract: Operator, operatorConfig: OperatorServiceConfig, nodeWallets: Wallet[] }> {
    const provider = opts?.provider ?? getProvider()
    const operatorWallet = await generateWalletWithGasAndTokens({
        provider: opts?.provider,
        chainConfig: opts?.chainConfig,
        adminKey: opts?.adminKey
    })
    const operatorContract = await deployOperatorContract({ chainConfig: opts?.chainConfig ?? CHAIN_CONFIG[TEST_CHAIN], deployer: operatorWallet })
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
        signer: operatorWallet, // TODO remove
        provider: provider,
        theGraphUrl: THE_GRAPH_URL,
    }
    return { operatorWallet, operatorContract, operatorConfig, nodeWallets }
}

interface DeployOperatorContractOpts {
    deployer: Wallet
    minOperatorStakePercent?: number
    operatorSharePercent?: number
    operatorMetadata?: string
    poolTokenName?: string 
    // eslint-disable-next-line max-len
    chainConfig?: { contracts: { OperatorFactory: string, OperatorDefaultDelegationPolicy: string, OperatorDefaultPoolYieldPolicy: string, OperatorDefaultUndelegationPolicy: string } }
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
        [ opts.poolTokenName ?? `Pool-${Date.now()}`, opts.operatorMetadata ?? '{}' ],
        [
            chainConfig.contracts.OperatorDefaultDelegationPolicy,
            chainConfig.contracts.OperatorDefaultPoolYieldPolicy,
            chainConfig.contracts.OperatorDefaultUndelegationPolicy,
        ], [
            0,
            parseEther('1').mul(opts.minOperatorStakePercent ?? 0).div(100),
            0,
            0,
            0,
            parseEther('1').mul(opts.operatorSharePercent ?? 0).div(100)
        ]
    )).wait() as ContractReceipt // TODO: figure out why typechain types produce any from .connect, shouldn't need explicit typing here
    const newOperatorAddress = operatorReceipt.events?.find((e) => e.event === 'NewOperator')?.args?.operatorContractAddress
    const newOperator = new Contract(newOperatorAddress, operatorABI, opts.deployer) as unknown as Operator
    return newOperator
}

export interface DeploySponsorshipContractOpts {
    streamId: string
    deployer: Wallet
    metadata?: string
    minimumStakeWei?: BigNumber
    minHorizonSeconds?: number
    minOperatorCount?: number
    // eslint-disable-next-line max-len
    chainConfig?: { contracts: { SponsorshipFactory: string, SponsorshipStakeWeightedAllocationPolicy: string, SponsorshipDefaultLeavePolicy: string, SponsorshipVoteKickPolicy: string } }
}

export async function deploySponsorshipContract(opts: DeploySponsorshipContractOpts): Promise<Sponsorship> {
    const chainConfig = opts.chainConfig ?? CHAIN_CONFIG.dev2
    const sponsorshipFactory = new Contract(
        chainConfig.contracts.SponsorshipFactory, 
        sponsorshipFactoryABI,
        opts.deployer
    ) as unknown as SponsorshipFactory
    const sponsorshipDeployTx = await sponsorshipFactory.deploySponsorship(
        (opts.minimumStakeWei ?? parseEther('60')).toString(),
        (opts.minHorizonSeconds ?? 0).toString(),
        (opts.minOperatorCount ?? 1).toString(),
        opts.streamId,
        opts.metadata ?? '{}',
        [
            chainConfig.contracts.SponsorshipStakeWeightedAllocationPolicy,
            chainConfig.contracts.SponsorshipDefaultLeavePolicy,
            chainConfig.contracts.SponsorshipVoteKickPolicy,
        ], [
            parseEther('0.01'),
            '0',
            '0'
        ]
    )
    const sponsorshipDeployReceipt = await sponsorshipDeployTx.wait() as ContractReceipt
    const newSponsorshipEvent = sponsorshipDeployReceipt.events?.find((e) => e.event === 'NewSponsorship')
    const newSponsorshipAddress = newSponsorshipEvent?.args?.sponsorshipContract
    const newSponsorship = new Contract(newSponsorshipAddress, sponsorshipABI, opts.deployer) as unknown as Sponsorship
    return newSponsorship
}

export function getProvider(): Provider {
    return new JsonRpcProvider(CHAIN_CONFIG[TEST_CHAIN].rpcEndpoints[0].url)
}

export function getTokenContract(): TestToken {
    return new Contract(CHAIN_CONFIG[TEST_CHAIN].contracts.DATA, tokenABI) as unknown as TestToken
}

interface GenerateWalletWithGasAndTokensOpts {
    provider?: Provider
    chainConfig?: { contracts: { DATA: string } }
    adminKey?: string
}

export async function generateWalletWithGasAndTokens(opts?: GenerateWalletWithGasAndTokensOpts): Promise<Wallet> {
    const provider = opts?.provider ?? getProvider()
    const newWallet = new Wallet(fastPrivateKey())
    const adminWallet = new Wallet(opts?.adminKey ?? CHAIN_CONFIG[TEST_CHAIN].adminPrivateKey).connect(provider)
    const token = (opts?.chainConfig !== undefined) 
        ? new Contract(opts.chainConfig.contracts.DATA!, tokenABI, adminWallet) as unknown as TestToken
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

export const stake = async (operatorContract: Operator, sponsorshipContractAddresses: string, amount: number): Promise<void> => {
    await (await operatorContract.stake(sponsorshipContractAddresses, parseEther(amount.toString()))).wait()
}

export const sponsor = async (sponsorer: Wallet, sponsorshipContractAddresses: string, amount: number, token?: TestToken): Promise<void> => {
    // eslint-disable-next-line max-len
    // https://github.com/streamr-dev/network-contracts/blob/01ec980cfe576e25e8c9acc08a57e1e4769f3e10/packages/network-contracts/contracts/OperatorTokenomics/Sponsorship.sol#L139
    await transferTokens(sponsorer, sponsorshipContractAddresses, amount, '', token)
}

export const transferTokens = async (from: Wallet, to: string, amount: number, data?: string, token?: TestToken): Promise<void> => {
    const tx = await ((token ?? getTokenContract()).connect(from).transferAndCall(to, parseEther(amount.toString()), data ?? ''))
    await tx.wait()
}
