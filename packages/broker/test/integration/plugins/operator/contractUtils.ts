import { AddressZero } from '@ethersproject/constants'
import { Contract } from '@ethersproject/contracts'
import { JsonRpcProvider, Provider } from '@ethersproject/providers'
import { parseEther } from '@ethersproject/units'
import { config as CHAIN_CONFIG } from '@streamr/config'
import type { Operator, OperatorFactory, Sponsorship, SponsorshipFactory } from '@streamr/network-contracts'
import { TestToken, operatorABI, operatorFactoryABI, sponsorshipABI, sponsorshipFactoryABI, tokenABI } from '@streamr/network-contracts'
import { fastPrivateKey } from '@streamr/test-utils'
import { EthereumAddress, toEthereumAddress } from '@streamr/utils'
import { BigNumber, ContractReceipt, Wallet } from 'ethers'
import { OperatorServiceConfig } from '../../../../src/plugins/operator/OperatorPlugin'

const TEST_CHAIN = 'dev2'
// TODO read from config when https://github.com/streamr-dev/network-contracts/pull/604 
export const THE_GRAPH_URL = `http://${process.env.STREAMR_DOCKER_DEV_HOST ?? '10.200.10.1'}:8800/subgraphs/name/streamr-dev/network-subgraphs`

export interface SetupOperatorContractOpts {
    nodeAddresses?: EthereumAddress[]
    provider: Provider
    // eslint-disable-next-line max-len
    chainConfig?: { contracts: { DATA: string, OperatorFactory: string, OperatorDefaultDelegationPolicy: string, OperatorDefaultPoolYieldPolicy: string, OperatorDefaultUndelegationPolicy: string } }
    adminKey?: string
}

export async function setupOperatorContract(
    opts: SetupOperatorContractOpts
): Promise<{ operatorWallet: Wallet, operatorContract: Operator, operatorConfig: OperatorServiceConfig }> {
    const operatorWallet = await generateWalletWithGasAndTokens(opts.provider, opts.chainConfig, opts.adminKey)
    const operatorContract = await deployOperatorContract({ chainConfig: opts.chainConfig ?? CHAIN_CONFIG[TEST_CHAIN], deployer: operatorWallet })
    const operatorConfig = {
        operatorContractAddress: toEthereumAddress(operatorContract.address),
        signer: operatorWallet,
        provider: opts.provider,
        theGraphUrl: THE_GRAPH_URL
    }
    return { operatorWallet, operatorContract, operatorConfig }
}

interface DeployOperatorContractOpts {
    chainConfig?: { contracts: { OperatorFactory: string, OperatorDefaultDelegationPolicy: string, OperatorDefaultPoolYieldPolicy: string, OperatorDefaultUndelegationPolicy: string } }
    deployer: Wallet
    minOperatorStakePercent?: number
    operatorSharePercent?: number
    operatorMetadata?: string
    poolTokenName?: string 
}

/**
 * @param opts.deployer should be the operator's Wallet
 * @returns Operator
 */
export async function deployOperatorContract(
    opts: DeployOperatorContractOpts
): Promise<Operator> {
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
    // eslint-disable-next-line max-len
    chainConfig?: { contracts: { SponsorshipFactory: string, SponsorshipStakeWeightedAllocationPolicy: string, SponsorshipDefaultLeavePolicy: string, SponsorshipVoteKickPolicy: string } }
    deployer: Wallet
    streamId: string
    metadata?: string
    minimumStakeWei?: BigNumber
    minHorizonSeconds?: number
    minOperatorCount?: number
}

export async function deploySponsorshipContract(
    opts: DeploySponsorshipContractOpts
): Promise<Sponsorship> {
    const chainConfig = opts.chainConfig ?? CHAIN_CONFIG.dev2
    const sponsorshipFactory =
        new Contract(chainConfig.contracts.SponsorshipFactory, sponsorshipFactoryABI, opts.deployer) as unknown as SponsorshipFactory
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

export async function generateWalletWithGasAndTokens(
    provider: Provider,
    config?: { contracts: { DATA: string } },
    adminKey?: string
): Promise<Wallet> {
    const newWallet = new Wallet(fastPrivateKey())
    const adminWallet = new Wallet(adminKey ?? CHAIN_CONFIG[TEST_CHAIN].adminPrivateKey).connect(provider)
    const token = (config !== undefined) 
        ? new Contract(config.contracts.DATA!, tokenABI, adminWallet) as unknown as TestToken
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
